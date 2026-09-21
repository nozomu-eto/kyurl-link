import { and, eq, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import QRCode from 'qrcode-svg'
import { links, qrcodes } from '@/db/schema'
import { authMiddleware, type AuthUser } from '@/middleware/auth'
import {
  qrcodeCreateInputSchema,
  qrcodeListResponseSchema,
  qrcodeSchema,
  qrcodeUpdateInputSchema,
} from '@/shared/schemas/qrcode'

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
  // 詳細取得
  .get('/:id', authMiddleware, async (c) => {
    const db = drizzle(c.env.DB)
    const id = c.req.param('id')

    const [record] = await db.select().from(qrcodes).where(eq(qrcodes.id, id)).limit(1)

    // 見つからない、またはソフトデリート済み(deletedAtが設定されている)場合は404
    if (!record || record.deletedAt !== null) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: '指定されたqrcodeが見つかりません',
          },
        },
        404,
      )
    }

    return c.json(toQrcodeResponse(record))
  })
  // styleOptionsのみ更新可能
  .patch('/:id', authMiddleware, async (c) => {
    const id = c.req.param('id')

    const body = await c.req.json().catch(() => null)
    const parsed = qrcodeUpdateInputSchema.safeParse(body)

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

    const [existing] = await db.select().from(qrcodes).where(eq(qrcodes.id, id)).limit(1)

    // 見つからない、またはソフトデリート済みの場合は404
    if (!existing || existing.deletedAt !== null) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: '指定されたqrcodeが見つかりません',
          },
        },
        404,
      )
    }

    // リクエストで指定されたフィールドのみを更新対象にする。DB保存時はJSON文字列化する
    const updateValues: Partial<typeof qrcodes.$inferInsert> = {}
    if (parsed.data.styleOptions !== undefined) {
      updateValues.styleOptions = JSON.stringify(parsed.data.styleOptions)
    }

    const [updated] = await db.update(qrcodes).set(updateValues).where(eq(qrcodes.id, id)).returning()

    return c.json(toQrcodeResponse(updated))
  })
  // 物理削除はせず、deletedAtに現在時刻をセットするソフトデリート
  .delete('/:id', authMiddleware, async (c) => {
    const id = c.req.param('id')
    const db = drizzle(c.env.DB)

    const [existing] = await db.select().from(qrcodes).where(eq(qrcodes.id, id)).limit(1)

    // 見つからない、または既に削除済みの場合は404
    if (!existing || existing.deletedAt !== null) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: '指定されたqrcodeが見つかりません',
          },
        },
        404,
      )
    }

    await db.update(qrcodes).set({ deletedAt: new Date() }).where(eq(qrcodes.id, id))

    // ボディ無しの204を返す
    return c.body(null, 204)
  })
  // QRコード画像(SVG)。リダイレクト等と同様、認証不要の公開エンドポイントとする(docs/architecture.md 第7節)
  .get('/:id/image', async (c) => {
    const db = drizzle(c.env.DB)
    const id = c.req.param('id')

    const [record] = await db.select().from(qrcodes).where(eq(qrcodes.id, id)).limit(1)

    // authMiddlewareを通さないため、エラーレスポンスもここでJSON形式に統一する
    if (!record || record.deletedAt !== null) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: '指定されたqrcodeが見つかりません',
          },
        },
        404,
      )
    }

    // QRコードに埋め込む内容を、対象種別に応じて決定する
    let content: string
    if (record.targetType === 'link') {
      const targetId = record.targetId
      if (!targetId) {
        return c.json(
          { error: { code: 'NOT_FOUND', message: '対象のlinkが見つかりません' } },
          404,
        )
      }

      // 対象linkのshortCodeを取得し、`{origin}/{shortCode}`(リダイレクトURL)をQRコードの内容にする
      const [targetLink] = await db
        .select({ shortCode: links.shortCode })
        .from(links)
        .where(and(eq(links.id, targetId), isNull(links.deletedAt)))
        .limit(1)

      if (!targetLink) {
        return c.json(
          { error: { code: 'NOT_FOUND', message: '対象のlinkが見つかりません' } },
          404,
        )
      }

      content = `${new URL(c.req.url).origin}/${targetLink.shortCode}`
    } else {
      const targetUrl = record.targetUrl
      if (!targetUrl) {
        return c.json(
          { error: { code: 'NOT_FOUND', message: '対象URLが見つかりません' } },
          404,
        )
      }

      // targetType='rawUrl'の場合は、保存されたURLをそのままQRコードの内容にする
      content = targetUrl
    }

    const svg = new QRCode({ content }).svg()

    return c.body(svg, 200, { 'Content-Type': 'image/svg+xml' })
  })

export default app
// Hono RPCクライアントから型推論できるようルートの型をexportする
export type QrcodesAppType = typeof app
