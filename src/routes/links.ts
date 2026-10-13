import { and, eq, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { links } from '@/db/schema'
import { LINK_CLICKS_DAYS_OPTIONS, buildLinkClicksSql, getLinkClicksStartDay, type LinkClicksDays } from '@/lib/link-clicks-query'
import { determineLinkSecurityStatus } from '@/lib/link-security-check'
import { computeLinkDisplayStatus } from '@/lib/link-status'
import { generateShortCode } from '@/lib/short-code'
import { authMiddleware, type AuthUser } from '@/middleware/auth'
import { userRateLimitMiddleware } from '@/middleware/rate-limit'
import { blockAccountDeletionPending } from '@/middleware/block-account-deletion-pending'
import { requireVerifiedEmail } from '@/middleware/require-verified-email'
import { jsonValidator } from '@/middleware/json-validator'
import { linkCreateInputSchema, linkListResponseSchema, linkSchema, linkUpdateInputSchema } from '@/shared/schemas/link'

// DB上のlinkレコード(lastScannedAtはDateオブジェクト)を、レスポンス用スキーマの形
// (lastScannedAtをISO文字列化・displayStatusを計算したもの)に変換する
function toLinkResponse(record: typeof links.$inferSelect) {
  return linkSchema.parse({
    ...record,
    createdAt: record.createdAt.toISOString(),
    lastScannedAt: record.lastScannedAt.toISOString(),
    displayStatus: computeLinkDisplayStatus(record),
  })
}

// 重複時の再生成の最大試行回数(簡易実装)
const SHORT_CODE_MAX_ATTEMPTS = 5

// link(短縮URL)リソースのルート。型推論を保つためメソッドチェーンで定義する。
// c.env.DBを使うため、HonoのBindingsにCloudflareBindings(wrangler typesが生成する型)を指定する。
// authMiddlewareがc.set('user', ...)するため、Variablesにもuserの型を指定する
const app = new Hono<{ Bindings: CloudflareBindings; Variables: { user: AuthUser } }>()
  .basePath('/links')
  // 一覧取得は認証必須(docs/architecture.mdの「API設計」)のため、authMiddlewareを経由させる
  .get('/', authMiddleware, async (c) => {
    // リクエストごとのD1バインディングからDrizzleインスタンスを生成する
    const db = drizzle(c.env.DB)
    const userId = c.get('user').id

    // ソフトデリート済み(deletedAtが設定されている)レコードは一覧に含めない。
    // 他人のlinkが混ざらないよう、ログインユーザー自身のものだけに絞り込む。
    // ページングは未実装のため固定値を返す
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
  .post('/', authMiddleware, requireVerifiedEmail, blockAccountDeletionPending, userRateLimitMiddleware('WRITE_RATE_LIMITER'), jsonValidator(linkCreateInputSchema), async (c) => {
    // 検証済みのリクエストボディ(jsonValidatorがスキーマで検証する)
    const input = c.req.valid('json')

    // expiresAtが現在時刻以前(過去または現在と同時刻)の場合は、作成した瞬間に無効な
    // linkが生まれてしまうため拒否する。形式検証(zodのz.iso.datetime)だけでは
    // 「過去日時かどうか」までは判定できないため、ここで別途チェックする
    if (input.expiresAt != null && new Date(input.expiresAt).getTime() <= Date.now()) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: '有効期限には未来の日時を指定してください',
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

    // 悪意あるURL検知(docs/architecture.mdの「悪意あるURLの検知」「作成時のヒューリスティック+URLhaus照合」)。
    // POST /links全体が長時間ブロックされないよう、checkUrlAgainstUrlhaus側で短いタイムアウトを
    // 設けている(URLhaus照会が失敗・タイムアウトした場合はfail-open、securityStatus: 'unscanned')
    const securityStatus = await determineLinkSecurityStatus(input.originalUrl, c.env.URLHAUS_API_KEY)

    // id・status・shortCode・userId(所有者)・securityStatus・lastScannedAtはサーバー側で決定して保存する
    const [created] = await db
      .insert(links)
      .values({
        id: crypto.randomUUID(),
        userId: c.get('user').id,
        originalUrl: input.originalUrl,
        shortCode,
        status: 'active',
        expiresAt: input.expiresAt ?? null,
        securityStatus,
        lastScannedAt: new Date(),
      })
      .returning()

    // レスポンス形状をスキーマで検証してから201で返す
    const response = toLinkResponse(created)

    return c.json(response, 201)
  })
  // 詳細取得(link本体のみ返す。クリック統計は/:id/clicks、QRコード一覧はGET /qrcodes)
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
  .patch('/:id', authMiddleware, requireVerifiedEmail, jsonValidator(linkUpdateInputSchema), async (c) => {
    const id = c.req.param('id')
    const userId = c.get('user').id

    // 検証済みのリクエストボディ(jsonValidatorがスキーマで検証する)
    const input = c.req.valid('json')

    // 作成時と同様、expiresAtが現在時刻以前の場合は拒否する(nullは無期限への変更を意味するため対象外)
    if (input.expiresAt != null && new Date(input.expiresAt).getTime() <= Date.now()) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: '有効期限には未来の日時を指定してください',
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

    // 運営により強制停止(moderationStatus: 'suspended')されている間は、所有者がstatusを
    // 変更してactiveに戻す(停止を解除する)ことを拒否する。expiresAtの変更は禁止しない
    // (moderationStatusとは独立した項目のため)
    if (existing.moderationStatus === 'suspended' && input.status !== undefined) {
      return c.json(
        {
          error: {
            code: 'MODERATION_LOCKED',
            message: 'このlinkは運営により停止されているため、状態を変更できません',
          },
        },
        403,
      )
    }

    // リクエストで指定されたフィールドのみを更新対象にする
    const updateValues: Partial<typeof links.$inferInsert> = {}
    if (input.status !== undefined) {
      updateValues.status = input.status
    }
    if (input.expiresAt !== undefined) {
      updateValues.expiresAt = input.expiresAt
    }

    // 期限切れの自動復帰(docs/architecture.mdの「画面ごとの確定仕様」「期限切れの後でも、延長または無期限に
    // すると再開できる」)。既存レコードがstatus: 'expired'で、かつリクエストにstatusが
    // 含まれていない場合に限り、更新後のexpiresAt(リクエストで指定された値、無ければ既存の値)が
    // 未来またはnull(無期限)になるならstatusをactiveに戻す。
    // リクエストでstatusが明示的に指定されている場合(例: suspendedへの変更)は、この自動復帰を
    // 発動させず指定された値をそのまま使う(上のif文で既にupdateValues.statusへ設定済みのため、
    // ここでは何もしない)
    if (existing.status === 'expired' && input.status === undefined) {
      const nextExpiresAt = input.expiresAt !== undefined ? input.expiresAt : existing.expiresAt
      const isStillInTheFuture = nextExpiresAt === null || new Date(nextExpiresAt).getTime() > Date.now()
      if (isStillInTheFuture) {
        updateValues.status = 'active'
      }
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
  // クリック統計(Analytics Engine SQL APIへの問い合わせ、docs/architecture.mdの「API設計」・「アクセスログの保持・削除の実装方式」)
  .get('/:id/clicks', authMiddleware, async (c) => {
    const db = drizzle(c.env.DB)
    const id = c.req.param('id')
    const userId = c.get('user').id

    // クエリdays(7/30/90、初期値30)。許可した3値以外はSQLへ文字列を直接埋め込まないよう、
    // buildLinkClicksSql側にも渡す前にここで検証する
    const rawDays = c.req.query('days')
    const days = rawDays === undefined ? 30 : Number(rawDays)
    if (!LINK_CLICKS_DAYS_OPTIONS.includes(days as LinkClicksDays)) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: `daysには${LINK_CLICKS_DAYS_OPTIONS.join('/')}のいずれかを指定してください`,
          },
        },
        400,
      )
    }

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

    const sql = buildLinkClicksSql(id, days as LinkClicksDays)

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
    // SQLは日本時間の開始日より1日前まで広く取っているため、開始日より前の日(日本時間)はここで捨てる
    const startDay = getLinkClicksStartDay(days as LinkClicksDays)
    const dailyClicks = result.data
      .map((item) => ({ day: item.day, clicks: Number(item.clicks) }))
      .filter((item) => item.day.slice(0, 10) >= startDay)
    const totalClicks = dailyClicks.reduce((sum, item) => sum + item.clicks, 0)

    return c.json({ totalClicks, dailyClicks })
  })

export default app
// Hono RPCクライアントから型推論できるようルートの型をexportする
export type LinksAppType = typeof app
