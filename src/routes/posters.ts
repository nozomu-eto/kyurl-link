import { and, eq, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { posters, qrcodes } from '@/db/schema'
import { authMiddleware, type AuthUser } from '@/middleware/auth'
import {
  posterCreateInputSchema,
  posterListResponseSchema,
  posterSchema,
  posterUpdateInputSchema,
} from '@/shared/schemas/poster'

// レイアウトテンプレートは今回'default'のみを扱う
const DEFAULT_LAYOUT_TEMPLATE = 'default'

// DB上のposterレコード(styleOptionsはJSON文字列)を、レスポンス用スキーマの形
// (styleOptionsをJSON.parseしたオブジェクト)に変換する
function toPosterResponse(record: typeof posters.$inferSelect) {
  return posterSchema.parse({
    ...record,
    styleOptions: record.styleOptions === null ? null : JSON.parse(record.styleOptions),
  })
}

// poster(掲示物)リソースのルート。links.ts/qrcodes.tsと同じパターンでメソッドチェーンで定義する。
// c.env.DBを使うため、HonoのBindingsにCloudflareBindingsを、authMiddlewareが
// c.set('user', ...)するため、Variablesにもuserの型を指定する
const app = new Hono<{ Bindings: CloudflareBindings; Variables: { user: AuthUser } }>()
  .basePath('/posters')
  // 一覧取得は認証必須(docs/architecture.md 第7節)
  .get('/', authMiddleware, async (c) => {
    const db = drizzle(c.env.DB)

    // ソフトデリート済み(deletedAtが設定されている)レコードは一覧に含めない。
    // ページングは未実装のため暫定的に固定値を返す
    const items = await db.select().from(posters).where(isNull(posters.deletedAt))

    const response = posterListResponseSchema.parse({
      items: items.map((item) => toPosterResponse(item)),
      total: items.length,
      limit: 20,
      offset: 0,
    })

    return c.json(response)
  })
  // 新規作成
  .post('/', authMiddleware, async (c) => {
    // リクエストボディをJSONとして読み取り、posterCreateInputSchemaで検証する
    const body = await c.req.json().catch(() => null)
    const parsed = posterCreateInputSchema.safeParse(body)

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

    // 指定されたqrCodeIdが実在し、かつソフトデリートされていないqrcodeであることを確認する
    const [targetQrcode] = await db
      .select({ id: qrcodes.id })
      .from(qrcodes)
      .where(and(eq(qrcodes.id, parsed.data.qrCodeId), isNull(qrcodes.deletedAt)))
      .limit(1)

    if (!targetQrcode) {
      return c.json(
        {
          error: {
            code: 'INVALID_TARGET',
            message: '指定されたqrcodeが存在しないか、削除されています',
          },
        },
        400,
      )
    }

    // id・layoutTemplate・styleOptionsはサーバー側で決定して保存する
    // (layoutTemplateは今回'default'固定、styleOptionsは作成時null固定)
    const [created] = await db
      .insert(posters)
      .values({
        id: crypto.randomUUID(),
        title: parsed.data.title,
        subtitle: parsed.data.subtitle ?? null,
        layoutTemplate: DEFAULT_LAYOUT_TEMPLATE,
        styleOptions: null,
        size: parsed.data.size,
        qrCodeId: parsed.data.qrCodeId,
      })
      .returning()

    return c.json(toPosterResponse(created), 201)
  })
  // 詳細取得
  .get('/:id', authMiddleware, async (c) => {
    const db = drizzle(c.env.DB)
    const id = c.req.param('id')

    const [record] = await db.select().from(posters).where(eq(posters.id, id)).limit(1)

    // 見つからない、またはソフトデリート済み(deletedAtが設定されている)場合は404
    if (!record || record.deletedAt !== null) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: '指定されたposterが見つかりません',
          },
        },
        404,
      )
    }

    return c.json(toPosterResponse(record))
  })
  // title/subtitle/styleOptionsのみ更新可能
  .patch('/:id', authMiddleware, async (c) => {
    const id = c.req.param('id')

    const body = await c.req.json().catch(() => null)
    const parsed = posterUpdateInputSchema.safeParse(body)

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

    const [existing] = await db.select().from(posters).where(eq(posters.id, id)).limit(1)

    // 見つからない、またはソフトデリート済みの場合は404
    if (!existing || existing.deletedAt !== null) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: '指定されたposterが見つかりません',
          },
        },
        404,
      )
    }

    // リクエストで指定されたフィールドのみを更新対象にする。styleOptionsのDB保存時はJSON文字列化する
    const updateValues: Partial<typeof posters.$inferInsert> = {}
    if (parsed.data.title !== undefined) {
      updateValues.title = parsed.data.title
    }
    if (parsed.data.subtitle !== undefined) {
      updateValues.subtitle = parsed.data.subtitle
    }
    if (parsed.data.styleOptions !== undefined) {
      updateValues.styleOptions = JSON.stringify(parsed.data.styleOptions)
    }

    const [updated] = await db.update(posters).set(updateValues).where(eq(posters.id, id)).returning()

    return c.json(toPosterResponse(updated))
  })
  // 物理削除はせず、deletedAtに現在時刻をセットするソフトデリート
  .delete('/:id', authMiddleware, async (c) => {
    const id = c.req.param('id')
    const db = drizzle(c.env.DB)

    const [existing] = await db.select().from(posters).where(eq(posters.id, id)).limit(1)

    // 見つからない、または既に削除済みの場合は404
    if (!existing || existing.deletedAt !== null) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: '指定されたposterが見つかりません',
          },
        },
        404,
      )
    }

    await db.update(posters).set({ deletedAt: new Date() }).where(eq(posters.id, id))

    // ボディ無しの204を返す
    return c.body(null, 204)
  })

export default app
// Hono RPCクライアントから型推論できるようルートの型をexportする
export type PostersAppType = typeof app
