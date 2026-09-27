import { and, eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { accountRequests, links, posters, qrcodes } from '@/db/schema'

// 猶予期間中(accountRequestsがstatus='pending'の間)にログインした場合、アカウント削除申請を
// 取り消し、申請時にソフトデリートされたリソースを復元する(docs/architecture.md 第7.1節
// 「③猶予期間: この間にログインすれば deletedAt をクリアして削除を取り消し可能」)
// dbはdrizzle(env.DB)由来のインスタンスを受け取る。呼び出し元(src/routes/account-requests.ts)
// ではBetter Authのテーブルも含めたschema付きインスタンスを渡す場合もあるため、
// 任意のTSchemaを受け付けられるようにする。
// 戻り値は取り消した申請(status: 'cancelled'に更新後のもの)。取り消す対象が無ければnull
export async function cancelPendingAccountRequestIfAny<TSchema extends Record<string, unknown>>(
  db: DrizzleD1Database<TSchema>,
  userId: string,
): Promise<typeof accountRequests.$inferSelect | null> {
  // 1. pending状態の申請を1件取得する。無ければ取り消す対象が無いため何もしない
  const [pendingRequest] = await db
    .select()
    .from(accountRequests)
    .where(and(eq(accountRequests.userId, userId), eq(accountRequests.status, 'pending')))
    .limit(1)

  if (!pendingRequest) {
    return null
  }

  // 2. links/qrcodes/postersのうち、userIdが一致し、かつdeletedAtがこのaccountRequestの
  // requestedAtと完全に一致するレコードのみを復元(deletedAtをnullに戻す)対象にする。
  // アカウント削除申請時(POST /api/v1/account-requests)、対象ユーザーの未削除リソース全件の
  // deletedAtに同一の時刻(このaccountRequests.requestedAt)を一括セットしているため、この
  // 時刻と完全一致するレコードだけが「今回の申請によってソフトデリートされた」ものだと
  // 判定できる。申請より前にユーザー自身が個別にlink/qrcode/posterを削除していた場合は
  // deletedAtが別の時刻になっているため、この条件には一致せず復元されない
  // (=個別削除したリソースを取り消し操作で誤って復活させてしまう取り違えを防ぐ)
  await db.batch([
    // linksはdeletedAtのクリアと同時に、申請時のカスケード処理(POST /api/v1/account-requests)が
    // セットしたstatus: 'suspended'も'active'に戻す。
    // 既知の限定的なエッジケース: 申請前にユーザー自身が個別にsuspendedへ変更していたlinkも
    // 区別できず'active'に戻ってしまう(statusの変更前の値を別途保持していないため)。
    // 申請の取り消しという操作の主目的(削除前の状態への復元)を優先し、発生頻度・影響とも
    // 限定的なこのケースは許容する
    db
      .update(links)
      .set({ deletedAt: null, status: 'active' })
      .where(and(eq(links.userId, userId), eq(links.deletedAt, pendingRequest.requestedAt))),
    db
      .update(qrcodes)
      .set({ deletedAt: null })
      .where(and(eq(qrcodes.userId, userId), eq(qrcodes.deletedAt, pendingRequest.requestedAt))),
    db
      .update(posters)
      .set({ deletedAt: null })
      .where(and(eq(posters.userId, userId), eq(posters.deletedAt, pendingRequest.requestedAt))),
    // 3. accountRequestsの該当レコードのstatusを'cancelled'に更新する
    db.update(accountRequests).set({ status: 'cancelled' }).where(eq(accountRequests.id, pendingRequest.id)),
  ])

  return { ...pendingRequest, status: 'cancelled' }
}
