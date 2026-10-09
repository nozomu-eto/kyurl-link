import { and, eq, lt } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { user } from '@/db/auth-schema'
import { accountRequests, posters } from '@/db/schema'
import { buildDeletionCompletedEmail } from '@/lib/account-deletion-emails'

// R2(POSTER_CACHE)からobjectKeyのprefixに一致する全オブジェクトを削除する。
// 1回のlist()では最大1000件までしか返らないため、truncated(まだ続きがある)な間はcursorで
// ページングしながら削除する
async function deletePosterCacheObjects(posterCache: R2Bucket, prefix: string) {
  let cursor: string | undefined
  do {
    const listed = await posterCache.list({ prefix, cursor })
    await Promise.all(listed.objects.map((object) => posterCache.delete(object.key)))
    cursor = listed.truncated ? listed.cursor : undefined
  } while (cursor)
}

// 猶予期間(7日)を経過したアカウント削除申請を処理し、対象ユーザーを物理削除するバッチ。
// docs/architecture.mdの「アカウント削除・データ削除の実装フロー」「⑤物理削除バッチ」に対応する。Cron Trigger(scheduledハンドラ)
// から1日1回呼び出されることを想定する
export async function runAccountDeletionBatch(env: CloudflareBindings): Promise<number> {
  const db = drizzle(env.DB)
  const now = new Date()

  // 1. status='pending'かつscheduledDeletionAtが現在時刻より過去(=猶予期間を過ぎた)の
  // 申請を全て取得する
  const targets = await db
    .select()
    .from(accountRequests)
    .where(and(eq(accountRequests.status, 'pending'), lt(accountRequests.scheduledDeletionAt, now)))

  for (const target of targets) {
    // 2a. 対象ユーザーが所有するposter(ソフトデリート済みも含む全件)のidを取得する。
    // R2オブジェクトキー(`${poster.id}/{format}/{hash}`)を特定するのにposter.idが必要なため
    const targetPosters = await db.select({ id: posters.id }).from(posters).where(eq(posters.userId, target.userId))

    // 2b. R2オブジェクトの削除は、DBのuser物理削除より必ず先に行う。
    // poster.idがR2オブジェクトキーを特定する唯一の手がかりであり、先にuserを物理削除して
    // posters(cascade)まで消えてしまうと、どのR2オブジェクトが対象だったか二度と
    // 特定できなくなり、R2にゴミ(孤立オブジェクト)が残り続けてしまうため
    for (const poster of targetPosters) {
      await deletePosterCacheObjects(env.POSTER_CACHE, `${poster.id}/`)
    }

    // 2c. userを物理削除する。links/qrcodes/posters/accountRequests/session/accountは
    // すべてonDelete: 'cascade'で連動削除されるため、個別に削除する必要はない
    const [deletedUser] = await db.delete(user).where(eq(user.id, target.userId)).returning({ email: user.email })

    // 2d. observability(Workers Logs)で確認できるよう対象メールアドレスを出力し、
    // 完全削除完了メールを送信する。メール送信の失敗は物理削除そのもの(=既にDB/R2の削除は
    // 完了している)を妨げないよう、必ずtry/catchで囲む
    if (deletedUser) {
      console.log(`アカウント削除完了: ${deletedUser.email}`)

      try {
        await env.EMAIL.send({
          from: 'no-reply@kyurl.link',
          to: deletedUser.email,
          ...buildDeletionCompletedEmail(),
        })
      } catch (error) {
        console.error('完全削除完了メールの送信に失敗しました', error)
      }
    }
  }

  // 3. 処理件数を返す(呼び出し元でログ出力に使う)
  return targets.length
}
