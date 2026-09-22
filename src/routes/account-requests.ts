import { and, desc, eq, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { accountRequests, links, posters, qrcodes } from '@/db/schema'
import { buildRequestReceivedEmail } from '@/lib/account-deletion-emails'
import { auth } from '@/lib/auth'
import { authMiddleware, type AuthUser } from '@/middleware/auth'
import { accountRequestCreateInputSchema, accountRequestSchema } from '@/shared/schemas/account-request'

// 猶予期間(docs/architecture.md 第7.1節「猶予期間は7日間」)
const DELETION_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000

// DB上のaccountRequestレコード(日時カラムはDateオブジェクト)を、レスポンス用スキーマの形
// (各日時をISO文字列化したもの)に変換する
function toAccountRequestResponse(record: typeof accountRequests.$inferSelect) {
  return accountRequestSchema.parse({
    ...record,
    requestedAt: record.requestedAt.toISOString(),
    scheduledDeletionAt: record.scheduledDeletionAt.toISOString(),
    completedAt: record.completedAt === null ? null : record.completedAt.toISOString(),
  })
}

// accountRequest(アカウント削除申請)リソースのルート。型推論を保つためメソッドチェーンで定義する。
// c.env.DBを使うため、HonoのBindingsにCloudflareBindingsを、authMiddlewareが
// c.set('user', ...)するため、Variablesにもuserの型を指定する
const app = new Hono<{ Bindings: CloudflareBindings; Variables: { user: AuthUser } }>()
  .basePath('/account-requests')
  // 自分の直近の削除申請状況を取得する。statusが'cancelled'でも直近の申請として返し、
  // フロントエンド側でstatusを見て表示を切り替える想定
  .get('/', authMiddleware, async (c) => {
    const db = drizzle(c.env.DB)
    const userId = c.get('user').id

    const [latestRequest] = await db
      .select()
      .from(accountRequests)
      .where(eq(accountRequests.userId, userId))
      .orderBy(desc(accountRequests.requestedAt))
      .limit(1)

    // 申請していない状態は正常なので、フロントエンド側で「404なら申請なし」と扱う想定
    if (!latestRequest) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'アカウント削除の申請が見つかりません',
          },
        },
        404,
      )
    }

    return c.json(toAccountRequestResponse(latestRequest))
  })
  // 削除申請
  .post('/', authMiddleware, async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = accountRequestCreateInputSchema.safeParse(body)

    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'リクエストボディが不正です',
            details: parsed.error.flatten(),
          },
        },
        400,
      )
    }

    // 誤操作防止のため、パスワード再入力で本人確認を行う(docs/architecture.md 第7.1節)。
    // verifyPasswordは検証に失敗すると例外を投げるため、401として扱う
    try {
      await auth(c.env).api.verifyPassword({
        body: { password: parsed.data.password },
        headers: c.req.raw.headers,
      })
    } catch {
      return c.json(
        {
          error: {
            code: 'INVALID_PASSWORD',
            message: 'パスワードが正しくありません',
          },
        },
        401,
      )
    }

    const db = drizzle(c.env.DB)
    const userId = c.get('user').id

    // 重複申請を防ぐため、既にpending状態の申請が無いか確認する
    const [existingPendingRequest] = await db
      .select({ id: accountRequests.id })
      .from(accountRequests)
      .where(and(eq(accountRequests.userId, userId), eq(accountRequests.status, 'pending')))
      .limit(1)

    if (existingPendingRequest) {
      return c.json(
        {
          error: {
            code: 'ALREADY_REQUESTED',
            message: 'すでにアカウント削除の申請が完了しています',
          },
        },
        409,
      )
    }

    const now = new Date()
    const scheduledDeletionAt = new Date(now.getTime() + DELETION_GRACE_PERIOD_MS)

    // 申請が成立した時点で、リダイレクト等の機能を即座に停止させる必要があるため
    // (docs/architecture.md 第7.1節「リダイレクト機能はこの時点で即座に停止し、410 Goneを返す」)、
    // 「ユーザー自身が所有する未削除のlinks/qrcodes/postersをソフトデリートする」ことと
    // 「accountRequestsに申請レコードをinsertする」ことを1つのバッチにまとめて実行する。
    // 個別に実行すると、途中で失敗した場合に「リソースは止まったが申請記録が残らない」
    // ような中途半端な状態になりうるため
    const [, , , insertedAccountRequests] = await db.batch([
      // linksはdeletedAtと同時にstatus: 'suspended'もセットする(docs/architecture.md 第7.1節②
      // 「リダイレクト機能はこの時点で即座に停止し、410 Goneを返す」)。既存のqrcodes/postersには
      // statusという概念(active/expired/suspended)自体が無いため、deletedAtのみで良い
      db
        .update(links)
        .set({ deletedAt: now, status: 'suspended' })
        .where(and(eq(links.userId, userId), isNull(links.deletedAt))),
      db
        .update(qrcodes)
        .set({ deletedAt: now })
        .where(and(eq(qrcodes.userId, userId), isNull(qrcodes.deletedAt))),
      db
        .update(posters)
        .set({ deletedAt: now })
        .where(and(eq(posters.userId, userId), isNull(posters.deletedAt))),
      db
        .insert(accountRequests)
        .values({
          id: crypto.randomUUID(),
          userId,
          status: 'pending',
          requestedAt: now,
          scheduledDeletionAt,
        })
        .returning(),
    ])

    const [created] = insertedAccountRequests

    // 申請受付メールを送信する。メール送信の失敗が退会申請そのもの(=既にDB更新は完了している)
    // を妨げないよう、必ずtry/catchで囲み、失敗してもAPIレスポンス自体は201のまま返す
    try {
      await c.env.EMAIL.send({
        from: 'no-reply@kyurl.link',
        to: c.get('user').email,
        ...buildRequestReceivedEmail(scheduledDeletionAt),
      })
    } catch (error) {
      console.error('申請受付メールの送信に失敗しました', error)
    }

    return c.json(toAccountRequestResponse(created), 201)
  })

export default app
// Hono RPCクライアントから型推論できるようルートの型をexportする
export type AccountRequestsAppType = typeof app
