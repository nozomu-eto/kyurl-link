import { and, eq, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { links } from '@/db/schema'
import { buildLinkClicksSql } from '@/lib/link-clicks-query'
import { determineLinkSecurityStatus } from '@/lib/link-security-check'
import { authMiddleware, type AuthUser } from '@/middleware/auth'
import { linkCreateInputSchema, linkListResponseSchema, linkSchema, linkUpdateInputSchema } from '@/shared/schemas/link'

// DB上のlinkレコード(lastScannedAtはDateオブジェクト)を、レスポンス用スキーマの形
// (lastScannedAtをISO文字列化したもの)に変換する
function toLinkResponse(record: typeof links.$inferSelect) {
  return linkSchema.parse({
    ...record,
    lastScannedAt: record.lastScannedAt.toISOString(),
  })
}

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
    const userId = c.get('user').id

    // ソフトデリート済み(deletedAtが設定されている)レコードは一覧に含めない。
    // 他人のlinkが混ざらないよう、ログインユーザー自身のものだけに絞り込む。
    // ページングは未実装のため暫定的に固定値を返す
    const items = await db
      .select()
      .from(links)
      .where(and(isNull(links.deletedAt), eq(links.userId, userId)))

    // レスポンス形状をスキーマで検証してから返す。レコードが0件でもitems: []としてそのまま返す(エラーにしない)
    const response = linkListResponseSchema.parse({
      items: items.map(toLinkResponse),
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

    // 悪意あるURL検知(docs/architecture.md 第4節「作成時のヒューリスティック+URLhaus照合」)。
    // POST /links全体が長時間ブロックされないよう、checkUrlAgainstUrlhaus側で短いタイムアウトを
    // 設けている(URLhaus照会が失敗・タイムアウトした場合はfail-open、securityStatus: 'unscanned')
    const securityStatus = await determineLinkSecurityStatus(parsed.data.originalUrl, c.env.URLHAUS_API_KEY)

    // id・status・shortCode・userId(所有者)・securityStatus・lastScannedAtはサーバー側で決定して保存する
    const [created] = await db
      .insert(links)
      .values({
        id: crypto.randomUUID(),
        userId: c.get('user').id,
        originalUrl: parsed.data.originalUrl,
        shortCode,
        status: 'active',
        expiresAt: parsed.data.expiresAt ?? null,
        securityStatus,
        lastScannedAt: new Date(),
      })
      .returning()

    // レスポンス形状をスキーマで検証してから201で返す
    const response = toLinkResponse(created)

    return c.json(response, 201)
  })
  // 詳細取得(クリック数サマリ・QR一覧は別リソース実装後に追加するため、現時点ではlinkSchema分のみ返す)
  .get('/:id', authMiddleware, async (c) => {
    const db = drizzle(c.env.DB)
    const id = c.req.param('id')
    const userId = c.get('user').id

    const [record] = await db
      .select()
      .from(links)
      .where(and(eq(links.id, id), eq(links.userId, userId)))
      .limit(1)

    // 見つからない、ソフトデリート済み、または他人のlinkの場合は404。
    // 他人のリソースが存在すること自体を漏らさないため、両者を区別しない
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

    const response = toLinkResponse(record)

    return c.json(response)
  })
  // status・expiresAtのみ更新可能
  .patch('/:id', authMiddleware, async (c) => {
    const id = c.req.param('id')
    const userId = c.get('user').id

    const body = await c.req.json().catch(() => null)
    const parsed = linkUpdateInputSchema.safeParse(body)

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

    const [existing] = await db
      .select()
      .from(links)
      .where(and(eq(links.id, id), eq(links.userId, userId)))
      .limit(1)

    // 見つからない、ソフトデリート済み、または他人のlinkの場合は404
    if (!existing || existing.deletedAt !== null) {
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

    // リクエストで指定されたフィールドのみを更新対象にする
    const updateValues: Partial<typeof links.$inferInsert> = {}
    if (parsed.data.status !== undefined) {
      updateValues.status = parsed.data.status
    }
    if (parsed.data.expiresAt !== undefined) {
      updateValues.expiresAt = parsed.data.expiresAt
    }

    const [updated] = await db
      .update(links)
      .set(updateValues)
      .where(and(eq(links.id, id), eq(links.userId, userId)))
      .returning()

    const response = toLinkResponse(updated)

    return c.json(response)
  })
  // 物理削除はせず、deletedAtに現在時刻をセットするソフトデリート
  .delete('/:id', authMiddleware, async (c) => {
    const id = c.req.param('id')
    const userId = c.get('user').id
    const db = drizzle(c.env.DB)

    const [existing] = await db
      .select()
      .from(links)
      .where(and(eq(links.id, id), eq(links.userId, userId)))
      .limit(1)

    // 見つからない、既に削除済み、または他人のlinkの場合は404
    if (!existing || existing.deletedAt !== null) {
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

    await db
      .update(links)
      .set({ deletedAt: new Date() })
      .where(and(eq(links.id, id), eq(links.userId, userId)))

    // ボディ無しの204を返す
    return c.body(null, 204)
  })
  // クリック統計(Analytics Engine SQL APIへの問い合わせ、docs/architecture.md 第7節・第12節)
  .get('/:id/clicks', authMiddleware, async (c) => {
    const db = drizzle(c.env.DB)
    const id = c.req.param('id')
    const userId = c.get('user').id

    // 既存のGET /:idと同じ絞り込み(所有者チェック含む)で対象linkの存在を確認する
    const [record] = await db
      .select({ id: links.id })
      .from(links)
      .where(and(eq(links.id, id), eq(links.userId, userId), isNull(links.deletedAt)))
      .limit(1)

    if (!record) {
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

    const sql = buildLinkClicksSql(id)

    // Analytics Engine SQL APIへ問い合わせる。認証はACCOUNT_ID(アカウントを特定するID)と
    // ANALYTICS_API_TOKEN(APIトークン、wrangler secretで設定済み)の組み合わせで行う
    const analyticsResponse = await fetch(`https://api.cloudflare.com/client/v4/accounts/${c.env.ACCOUNT_ID}/analytics_engine/sql`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.env.ANALYTICS_API_TOKEN}`,
      },
      body: sql,
    })

    if (analyticsResponse.status !== 200) {
      return c.json(
        {
          error: {
            code: 'ANALYTICS_QUERY_FAILED',
            message: 'クリック統計の取得に失敗しました',
          },
        },
        502,
      )
    }

    // Analytics Engine SQL APIはclicksを文字列型("6"等)で返すため、Number()で数値に変換してから扱う
    const result = await analyticsResponse.json<{ data: { day: string; clicks: string }[] }>()
    const dailyClicks = result.data.map((item) => ({ day: item.day, clicks: Number(item.clicks) }))
    const totalClicks = dailyClicks.reduce((sum, item) => sum + item.clicks, 0)

    return c.json({ totalClicks, dailyClicks })
  })

export default app
// Hono RPCクライアントから型推論できるようルートの型をexportする
export type LinksAppType = typeof app
