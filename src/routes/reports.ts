import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { links, reports } from '@/db/schema'
import { reportRateLimitMiddleware } from '@/middleware/rate-limit'
import { reportCreateInputSchema, reportSchema } from '@/shared/schemas/report'

// DB上のreportレコード(createdAtはDateオブジェクト)を、レスポンス用スキーマの形
// (createdAtをISO文字列化したもの)に変換する
function toReportResponse(record: typeof reports.$inferSelect) {
  return reportSchema.parse({
    ...record,
    createdAt: record.createdAt.toISOString(),
  })
}

// report(通報)リソースのルート。型推論を保つためメソッドチェーンで定義する。
// c.env.DBを使うため、HonoのBindingsにCloudflareBindingsを指定する。
// 利用規約第9条の通報導線は未ログインの一般利用者も使うため、authMiddlewareは付けない
const app = new Hono<{ Bindings: CloudflareBindings }>()
  .basePath('/reports')
  // 通報受付
  .post('/', reportRateLimitMiddleware, async (c) => {
    // リクエストボディをJSONとして読み取り、reportCreateInputSchemaで検証する
    const body = await c.req.json().catch(() => null)
    const parsed = reportCreateInputSchema.safeParse(body)

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

    const db = drizzle(c.env.DB)

    // 通報者は内部IDを知らないため、まずshortCodeから対象linkを検索する。
    // ソフトデリート済みの壊れたリンクへの通報もありうるため、deletedAtのチェックは行わない
    const [targetLink] = await db.select({ id: links.id }).from(links).where(eq(links.shortCode, parsed.data.shortCode)).limit(1)

    if (!targetLink) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: '指定されたshortCodeのlinkが見つかりません',
          },
        },
        404,
      )
    }

    // id・linkId・statusはサーバー側で決定して保存する(statusは常に'pending'固定)
    const [created] = await db
      .insert(reports)
      .values({
        id: crypto.randomUUID(),
        linkId: targetLink.id,
        reason: parsed.data.reason,
        status: 'pending',
      })
      .returning()

    return c.json(toReportResponse(created), 201)
  })

export default app
// Hono RPCクライアントから型推論できるようルートの型をexportする
export type ReportsAppType = typeof app
