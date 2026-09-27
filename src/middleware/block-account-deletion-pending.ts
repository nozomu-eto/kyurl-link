import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { createMiddleware } from 'hono/factory'
import { accountRequests } from '@/db/schema'
import type { AuthUser } from '@/middleware/auth'

// アカウント削除申請の猶予期間中(status: 'pending')は、新規作成系エンドポイント
// (POST /links・POST /qrcodes・POST /posters)を止める(docs/architecture.md 第7.1節)。
// ログイン時の自動取り消しをやめた(取り消しは明示的なボタンでのみ行う)ことに伴い、
// 申請中の利用者がそのままログインして作成を続けられてしまうと、作ったものが猶予終了時に
// まとめてソフトデリートされてしまうため。authMiddlewareの後段に置き、c.get('user')が
// 使える前提とする
export const blockAccountDeletionPending = createMiddleware<{
  Bindings: CloudflareBindings
  Variables: { user: AuthUser }
}>(async (c, next) => {
  const db = drizzle(c.env.DB)
  const userId = c.get('user').id

  const [pendingRequest] = await db
    .select({ id: accountRequests.id })
    .from(accountRequests)
    .where(and(eq(accountRequests.userId, userId), eq(accountRequests.status, 'pending')))
    .limit(1)

  if (pendingRequest) {
    return c.json(
      {
        error: {
          code: 'ACCOUNT_DELETION_PENDING',
          message: 'アカウントの削除を申請中のため、新しく作成できません。取り消す場合はアカウント設定から操作してください',
        },
      },
      403,
    )
  }

  await next()
})
