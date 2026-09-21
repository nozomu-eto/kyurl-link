import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { links } from '@/db/schema'
import { authMiddleware, type AuthUser } from '@/middleware/auth'
import { linkCreateInputSchema, linkListResponseSchema, linkSchema } from '@/shared/schemas/link'

// shortCode生成に使う文字種(英数字)
const SHORT_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
// shortCodeの長さ(6〜8文字程度の目安として7文字固定)
const SHORT_CODE_LENGTH = 7
// 重複時の再生成の最大試行回数(簡易実装)
const SHORT_CODE_MAX_ATTEMPTS = 5

// 英数字7文字のランダムなshortCodeを1件生成する
function generateShortCode() {
  let code = ''
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    code += SHORT_CODE_CHARS[Math.floor(Math.random() * SHORT_CODE_CHARS.length)]
  }
  return code
}

// link(短縮URL)リソースのルート。型推論を保つためメソッドチェーンで定義する。
// c.env.DBを使うため、HonoのBindingsにCloudflareBindings(wrangler typesが生成する型)を指定する。
// authMiddlewareがc.set('user', ...)するため、Variablesにもuserの型を指定する
const app = new Hono<{ Bindings: CloudflareBindings; Variables: { user: AuthUser } }>()
  .basePath('/links')
  // 一覧取得は認証必須(docs/architecture.md 第7節)のため、authMiddlewareを経由させる
  .get('/', authMiddleware, async (c) => {
    // リクエストごとのD1バインディングからDrizzleインスタンスを生成する
    const db = drizzle(c.env.DB)

    // linksテーブルの全件を取得する(ページングは未実装のため暫定的に固定値を返す)
    const items = await db.select().from(links)

    // レスポンス形状をスキーマで検証してから返す。レコードが0件でもitems: []としてそのまま返す(エラーにしない)
    const response = linkListResponseSchema.parse({
      items,
      total: items.length,
      limit: 20,
      offset: 0,
    })

    return c.json(response)
  })
  // 新規作成
  .post('/', authMiddleware, async (c) => {
    // リクエストボディをJSONとして読み取り、linkCreateInputSchemaで検証する
    const body = await c.req.json().catch(() => null)
    const parsed = linkCreateInputSchema.safeParse(body)

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

    // shortCodeをランダム生成し、既存のレコードと重複していないかDBで確認する。
    // 重複していれば再生成し、最大試行回数を超えたらエラーとする(簡易実装)
    let shortCode: string | undefined
    for (let attempt = 0; attempt < SHORT_CODE_MAX_ATTEMPTS; attempt++) {
      const candidate = generateShortCode()
      const existing = await db.select({ id: links.id }).from(links).where(eq(links.shortCode, candidate)).limit(1)

      if (existing.length === 0) {
        shortCode = candidate
        break
      }
    }

    if (!shortCode) {
      return c.json(
        {
          error: {
            code: 'SHORT_CODE_GENERATION_FAILED',
            message: '短縮コードの生成に失敗しました。もう一度お試しください',
          },
        },
        500,
      )
    }

    // id・status・shortCodeはサーバー側で決定して保存する
    const [created] = await db
      .insert(links)
      .values({
        id: crypto.randomUUID(),
        originalUrl: parsed.data.originalUrl,
        shortCode,
        status: 'active',
        expiresAt: parsed.data.expiresAt ?? null,
      })
      .returning()

    // レスポンス形状をスキーマで検証してから201で返す
    const response = linkSchema.parse(created)

    return c.json(response, 201)
  })
  // 詳細取得(クリック数サマリ・QR一覧は別リソース実装後に追加するため、現時点ではlinkSchema分のみ返す)
  .get('/:id', authMiddleware, async (c) => {
    const db = drizzle(c.env.DB)
    const id = c.req.param('id')

    const [record] = await db.select().from(links).where(eq(links.id, id)).limit(1)

    // 見つからない、またはソフトデリート済み(deletedAtが設定されている)場合は404
    if (!record || record.deletedAt !== null) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: '指定されたlinkが見つかりません',
          },
        },
        404,
      )
    }

    const response = linkSchema.parse(record)

    return c.json(response)
  })

export default app
// Hono RPCクライアントから型推論できるようルートの型をexportする
export type LinksAppType = typeof app
