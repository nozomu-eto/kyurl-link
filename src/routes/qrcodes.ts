import { and, eq, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { links, qrcodes } from '@/db/schema'
import { authMiddleware, type AuthUser } from '@/middleware/auth'
import { qrcodeCreateInputSchema, qrcodeListResponseSchema, qrcodeSchema } from '@/shared/schemas/qrcode'

// DB上のqrcodeレコード(styleOptionsはJSON文字列)を、レスポンス用スキーマの形
// (styleOptionsをJSON.parseしたオブジェクト)に変換する
function toQrcodeResponse(record: typeof qrcodes.$inferSelect) {
  return qrcodeSchema.parse({
    ...record,
    styleOptions: record.styleOptions === null ? null : JSON.parse(record.styleOptions),
  })
}

// qrcode(QRコード)リソースのルート。links.tsと同じパターンでメソッドチェーンで定義する。
// c.env.DBを使うため、HonoのBindingsにCloudflareBindingsを、authMiddlewareが
// c.set('user', ...)するため、Variablesにもuserの型を指定する
const app = new Hono<{ Bindings: CloudflareBindings; Variables: { user: AuthUser } }>()
  .basePath('/qrcodes')
  // 一覧取得は認証必須(docs/architecture.md 第7節)
  .get('/', authMiddleware, async (c) => {
    const db = drizzle(c.env.DB)

    // ソフトデリート済み(deletedAtが設定されている)レコードは一覧に含めない。
    // ページングは未実装のため暫定的に固定値を返す
    const items = await db.select().from(qrcodes).where(isNull(qrcodes.deletedAt))

    const response = qrcodeListResponseSchema.parse({
      items: items.map((item) => toQrcodeResponse(item)),
      total: items.length,
      limit: 20,
      offset: 0,
    })

    return c.json(response)
  })
  // 新規作成
  .post('/', authMiddleware, async (c) => {
    // リクエストボディをJSONとして読み取り、qrcodeCreateInputSchemaで検証する
    const body = await c.req.json().catch(() => null)
    const parsed = qrcodeCreateInputSchema.safeParse(body)

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

    // targetType='link'の場合、指定されたtargetIdが実在し、かつソフトデリートされていない
    // linkであることを確認する
    if (parsed.data.targetType === 'link') {
      const [targetLink] = await db
        .select({ id: links.id })
        .from(links)
        .where(and(eq(links.id, parsed.data.targetId), isNull(links.deletedAt)))
        .limit(1)

      if (!targetLink) {
        return c.json(
          {
            error: {
              code: 'INVALID_TARGET',
              message: '指定されたlinkが存在しないか、削除されています',
            },
          },
          400,
        )
      }
    }

    // id・styleOptionsはサーバー側で決定して保存する(styleOptionsは作成時はnull固定)
    const [created] = await db
      .insert(qrcodes)
      .values({
        id: crypto.randomUUID(),
        targetType: parsed.data.targetType,
        targetId: parsed.data.targetType === 'link' ? parsed.data.targetId : null,
        targetUrl: parsed.data.targetType === 'rawUrl' ? parsed.data.targetUrl : null,
        styleOptions: null,
      })
      .returning()

    return c.json(toQrcodeResponse(created), 201)
  })

export default app
// Hono RPCクライアントから型推論できるようルートの型をexportする
export type QrcodesAppType = typeof app
