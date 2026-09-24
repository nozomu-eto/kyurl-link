import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { links } from '@/db/schema'
import { URL_MAX_LENGTH } from '@/shared/constants/input-limits'
import { linkListResponseSchema, linkSchema } from '@/shared/schemas/link'
import { markEmailVerified } from '../../test/mark-email-verified'

// サインアップし、authMiddlewareを通すためのセッションCookieと、作成されたuserのidを取得する。
// requireVerifiedEmailミドルウェアを通すため、作成直後にemailVerifiedをtrueにしておく
async function signUp() {
  const response = await SELF.fetch('https://example.com/api/auth/sign-up/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Better AuthはCSRF対策としてOriginを検証するため、BETTER_AUTH_URLと同じ値を付与する
      Origin: env.BETTER_AUTH_URL,
    },
    body: JSON.stringify({
      email: `test-${crypto.randomUUID()}@example.com`,
      password: 'password1234',
      name: 'Test User',
    }),
  })

  const setCookie = response.headers.get('set-cookie')
  if (!setCookie) {
    throw new Error('サインアップのレスポンスにset-cookieが含まれていません')
  }
  // "better-auth.session_token=...; Max-Age=...; Path=...; ..." からCookieヘッダーに使う先頭の "name=value" だけを取り出す
  const sessionCookie = setCookie.split(';')[0]

  const body = await response.json<{ user: { id: string } }>()
  const userId = body.user.id
  await markEmailVerified(userId)
  return { sessionCookie, userId }
}

// 認証済みlinkを1件作成し、作成結果(id等)を返す
async function createLink(sessionCookie: string, originalUrl = 'https://example.com/crud-test') {
  const response = await SELF.fetch('https://example.com/api/v1/links', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify({ originalUrl }),
  })
  expect(response.status).toBe(201)
  return linkSchema.parse(await response.json())
}

describe('GET /api/v1/links', () => {
  it('認証済みの場合、ステータスコード200と、insertした1件を含むitems/total/limit/offsetを返す', async () => {
    const { sessionCookie, userId } = await signUp()

    // このテスト内で完結するよう、都度一意なIDでテスト用D1(env.DB)にデータを1件insertする
    // (テストファイル内では同一D1インスタンスを使い回すため、他テストと衝突しない値にする)。
    // 一覧はuserIdで絞り込まれるため、サインアップしたユーザー自身のidをuserIdに設定する
    const id = crypto.randomUUID()
    const db = drizzle(env.DB)
    await db.insert(links).values({
      id,
      userId,
      originalUrl: 'https://example.com',
      shortCode: id,
      status: 'active',
      expiresAt: null,
    })

    const response = await SELF.fetch('https://example.com/api/v1/links', {
      headers: { Cookie: sessionCookie },
    })
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body).toMatchObject({
      items: expect.arrayContaining([
        {
          id,
          originalUrl: 'https://example.com',
          shortCode: id,
          status: 'active',
          expiresAt: null,
          securityStatus: 'unscanned',
          lastScannedAt: expect.any(String),
          moderationStatus: 'none',
        },
      ]),
      total: expect.any(Number),
      limit: expect.any(Number),
      offset: expect.any(Number),
    })
  })

  it('未認証の場合、共通エラー形式で401を返す', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/links')
    expect(response.status).toBe(401)

    const body = await response.json()
    expect(body).toMatchObject({
      error: {
        code: expect.any(String),
        message: expect.any(String),
      },
    })
  })
})

describe('POST /api/v1/links のoriginalUrlスキーム検証', () => {
  it.each(['javascript:alert(1)', 'data:text/html,xxx', 'mailto:a@example.com', 'ftp://example.com'])(
    'originalUrlが%sの場合、400(VALIDATION_ERROR)になる',
    async (originalUrl) => {
      const { sessionCookie } = await signUp()

      const response = await SELF.fetch('https://example.com/api/v1/links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie,
        },
        body: JSON.stringify({ originalUrl }),
      })
      expect(response.status).toBe(400)
      const body = await response.json<{ error: { code: string } }>()
      expect(body.error.code).toBe('VALIDATION_ERROR')
    },
  )

  it.each(['https://example.com', 'http://example.com'])('originalUrlが%sの場合、作成できる', async (originalUrl) => {
    const { sessionCookie } = await signUp()

    const created = await createLink(sessionCookie, originalUrl)
    expect(created.originalUrl).toBe(originalUrl)
  })
})

describe('POST /api/v1/links のoriginalUrl文字数上限', () => {
  // 'https://example.com/'(21文字)に続けてパスをパディングし、ちょうど目的の文字数のURLを作る
  function buildUrlOfLength(length: number) {
    const prefix = 'https://example.com/'
    return prefix + 'a'.repeat(length - prefix.length)
  }

  it(`originalUrlが上限文字数(${URL_MAX_LENGTH})+1文字の場合、400(VALIDATION_ERROR)になる`, async () => {
    const { sessionCookie } = await signUp()

    const response = await SELF.fetch('https://example.com/api/v1/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ originalUrl: buildUrlOfLength(URL_MAX_LENGTH + 1) }),
    })
    expect(response.status).toBe(400)
    const body = await response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it(`originalUrlがちょうど上限文字数(${URL_MAX_LENGTH})の場合、作成できる`, async () => {
    const { sessionCookie } = await signUp()
    const originalUrl = buildUrlOfLength(URL_MAX_LENGTH)

    const created = await createLink(sessionCookie, originalUrl)
    expect(created.originalUrl).toBe(originalUrl)
  })
})

describe('POST・PATCH /api/v1/links のexpiresAt形式検証', () => {
  it.each(['abc', '2026-13-45'])('POST時にexpiresAtが%sの場合、400(VALIDATION_ERROR)になる', async (expiresAt) => {
    const { sessionCookie } = await signUp()

    const response = await SELF.fetch('https://example.com/api/v1/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ originalUrl: 'https://example.com', expiresAt }),
    })
    expect(response.status).toBe(400)
    const body = await response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('POST時にexpiresAtが有効なISO 8601日時(offset付き)の場合、作成できる', async () => {
    const { sessionCookie } = await signUp()
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const response = await SELF.fetch('https://example.com/api/v1/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ originalUrl: 'https://example.com', expiresAt: futureDate }),
    })
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ expiresAt: futureDate })
  })

  it('POST時にexpiresAtがnullの場合、無期限として作成できる', async () => {
    const { sessionCookie } = await signUp()

    const response = await SELF.fetch('https://example.com/api/v1/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ originalUrl: 'https://example.com', expiresAt: null }),
    })
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ expiresAt: null })
  })

  it.each(['abc', '2026-13-45'])('PATCH時にexpiresAtが%sの場合、400(VALIDATION_ERROR)になる', async (expiresAt) => {
    const { sessionCookie } = await signUp()
    const created = await createLink(sessionCookie)

    const response = await SELF.fetch(`https://example.com/api/v1/links/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ expiresAt }),
    })
    expect(response.status).toBe(400)
    const body = await response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('POST・PATCH /api/v1/links のexpiresAt過去日時拒否', () => {
  it('POST時にexpiresAtが過去の日時の場合、400(VALIDATION_ERROR)になる', async () => {
    const { sessionCookie } = await signUp()
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const response = await SELF.fetch('https://example.com/api/v1/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ originalUrl: 'https://example.com', expiresAt: pastDate }),
    })
    expect(response.status).toBe(400)
    const body = await response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('POST時にexpiresAtが未来の日時の場合、作成できる', async () => {
    const { sessionCookie } = await signUp()
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const response = await SELF.fetch('https://example.com/api/v1/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ originalUrl: 'https://example.com', expiresAt: futureDate }),
    })
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ expiresAt: futureDate })
  })

  it('PATCH時にexpiresAtが過去の日時の場合、400(VALIDATION_ERROR)になる', async () => {
    const { sessionCookie } = await signUp()
    const created = await createLink(sessionCookie)
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const response = await SELF.fetch(`https://example.com/api/v1/links/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ expiresAt: pastDate }),
    })
    expect(response.status).toBe(400)
    const body = await response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('PATCH時にexpiresAtが未来の日時の場合、更新できる', async () => {
    const { sessionCookie } = await signUp()
    const created = await createLink(sessionCookie)
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const response = await SELF.fetch(`https://example.com/api/v1/links/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ expiresAt: futureDate }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ expiresAt: futureDate })
  })
})

describe('links CRUD', () => {
  it('POST /api/v1/links で作成したlinkを、GET /api/v1/links/:idで取得できる', async () => {
    const { sessionCookie } = await signUp()

    const created = await createLink(sessionCookie)
    expect(created).toMatchObject({
      originalUrl: 'https://example.com/crud-test',
      status: 'active',
      expiresAt: null,
    })

    const getResponse = await SELF.fetch(`https://example.com/api/v1/links/${created.id}`, {
      headers: { Cookie: sessionCookie },
    })
    expect(getResponse.status).toBe(200)
    expect(await getResponse.json()).toEqual(created)
  })

  it('PATCH /api/v1/links/:idでstatusを変更すると反映される', async () => {
    const { sessionCookie } = await signUp()
    const created = await createLink(sessionCookie)

    const patchResponse = await SELF.fetch(`https://example.com/api/v1/links/${created.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ status: 'suspended' }),
    })
    expect(patchResponse.status).toBe(200)
    expect(await patchResponse.json()).toMatchObject({ id: created.id, status: 'suspended' })

    const getResponse = await SELF.fetch(`https://example.com/api/v1/links/${created.id}`, {
      headers: { Cookie: sessionCookie },
    })
    expect(await getResponse.json()).toMatchObject({ status: 'suspended' })
  })

  it('DELETE /api/v1/links/:id実行後、一覧に含まれず、GET /api/v1/links/:idは404になる', async () => {
    const { sessionCookie } = await signUp()
    const created = await createLink(sessionCookie)

    const deleteResponse = await SELF.fetch(`https://example.com/api/v1/links/${created.id}`, {
      method: 'DELETE',
      headers: { Cookie: sessionCookie },
    })
    expect(deleteResponse.status).toBe(204)

    const listResponse = await SELF.fetch('https://example.com/api/v1/links', {
      headers: { Cookie: sessionCookie },
    })
    const list = linkListResponseSchema.parse(await listResponse.json())
    expect(list.items.some((item) => item.id === created.id)).toBe(false)

    const getResponse = await SELF.fetch(`https://example.com/api/v1/links/${created.id}`, {
      headers: { Cookie: sessionCookie },
    })
    expect(getResponse.status).toBe(404)

    const body = await getResponse.json()
    expect(body).toMatchObject({
      error: {
        code: expect.any(String),
        message: expect.any(String),
      },
    })
  })
})

describe('運営による強制停止(moderationStatus)', () => {
  it('moderationStatusがsuspendedのlinkは、所有者がPATCHでstatusを変更しようとすると403(MODERATION_LOCKED)になる', async () => {
    const { sessionCookie } = await signUp()
    const created = await createLink(sessionCookie)

    // 管理画面・管理APIは無いため、D1への直接更新を模してmoderationStatusを書き換える
    // (docs/deployment.md「D1への直接SQL操作」参照)
    const db = drizzle(env.DB)
    await db.update(links).set({ moderationStatus: 'suspended' }).where(eq(links.id, created.id))

    const patchResponse = await SELF.fetch(`https://example.com/api/v1/links/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ status: 'active' }),
    })
    expect(patchResponse.status).toBe(403)
    const body = await patchResponse.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('MODERATION_LOCKED')

    // statusは変更されていないことを確認する(既定値のactiveのまま)
    const getResponse = await SELF.fetch(`https://example.com/api/v1/links/${created.id}`, {
      headers: { Cookie: sessionCookie },
    })
    expect(await getResponse.json()).toMatchObject({ status: 'active', moderationStatus: 'suspended' })
  })

  it('moderationStatusがsuspendedのlinkでも、statusを含まないPATCH(expiresAtのみ)は成功する', async () => {
    const { sessionCookie } = await signUp()
    const created = await createLink(sessionCookie)

    const db = drizzle(env.DB)
    await db.update(links).set({ moderationStatus: 'suspended' }).where(eq(links.id, created.id))

    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const patchResponse = await SELF.fetch(`https://example.com/api/v1/links/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ expiresAt: futureDate }),
    })
    expect(patchResponse.status).toBe(200)
    expect(await patchResponse.json()).toMatchObject({ expiresAt: futureDate })
  })

  it('moderationStatusがnone(通常)のlinkは、従来どおりPATCHでstatusを変更できる', async () => {
    const { sessionCookie } = await signUp()
    const created = await createLink(sessionCookie)
    expect(created.moderationStatus).toBe('none')

    const patchResponse = await SELF.fetch(`https://example.com/api/v1/links/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ status: 'suspended' }),
    })
    expect(patchResponse.status).toBe(200)
  })
})

describe('所有者チェック(他人のlinkにはアクセスできない)', () => {
  it('ユーザーAが作成したlinkに対して、ユーザーBがGET /:id・PATCH・DELETEを実行するといずれも404になる', async () => {
    const userA = await signUp()
    const created = await createLink(userA.sessionCookie)

    const userB = await signUp()

    const getResponse = await SELF.fetch(`https://example.com/api/v1/links/${created.id}`, {
      headers: { Cookie: userB.sessionCookie },
    })
    expect(getResponse.status).toBe(404)

    const patchResponse = await SELF.fetch(`https://example.com/api/v1/links/${created.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: userB.sessionCookie,
      },
      body: JSON.stringify({ status: 'suspended' }),
    })
    expect(patchResponse.status).toBe(404)

    const deleteResponse = await SELF.fetch(`https://example.com/api/v1/links/${created.id}`, {
      method: 'DELETE',
      headers: { Cookie: userB.sessionCookie },
    })
    expect(deleteResponse.status).toBe(404)
  })
})

describe('POST /api/v1/links の悪意あるURL検知(docs/architecture.md 第4節)', () => {
  it('ヒューリスティックに該当するURL(IPアドレスリテラル)で作成すると、securityStatus: flaggedで返る', async () => {
    const { sessionCookie } = await signUp()

    const created = await createLink(sessionCookie, 'http://192.168.1.1/login')
    expect(created.securityStatus).toBe('flagged')
    expect(typeof created.lastScannedAt).toBe('string')
  })

  it('通常のURLで作成すると、URLHAUS_API_KEY未設定のテスト環境ではfail-openし、securityStatus: unscannedで返る', async () => {
    const { sessionCookie } = await signUp()

    const created = await createLink(sessionCookie, 'https://example.com/normal-page')
    expect(created.securityStatus).toBe('unscanned')
  })
})

describe('GET /api/v1/links/:id/clicks', () => {
  it('存在しないlinkに対しては404になる', async () => {
    const { sessionCookie } = await signUp()

    const response = await SELF.fetch('https://example.com/api/v1/links/not-existing-id/clicks', {
      headers: { Cookie: sessionCookie },
    })
    expect(response.status).toBe(404)
  })

  it('他人のlinkに対しては404になる', async () => {
    const userA = await signUp()
    const created = await createLink(userA.sessionCookie)

    const userB = await signUp()
    const response = await SELF.fetch(`https://example.com/api/v1/links/${created.id}/clicks`, {
      headers: { Cookie: userB.sessionCookie },
    })
    expect(response.status).toBe(404)
  })

  it('未認証の場合401になる', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/links/dummy-id/clicks')
    expect(response.status).toBe(401)
  })

  it('Analytics Engine SQL APIの呼び出し(fetch)をモックし、totalClicks/dailyClicksが期待通りの形で返る', async () => {
    const { sessionCookie } = await signUp()
    const created = await createLink(sessionCookie)

    // globalThis.fetchを一時的に差し替え、実際のSQL API呼び出しをせずに固定のレスポンスを返す。
    // 実際のAnalytics Engine SQL APIはclicksを文字列型("3"等)で返すため、モックもそれに合わせる
    // (以前clicksを数値型でモックしていたために型変換漏れのバグを検知できなかったため)
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: [
            { day: '2026-09-20', clicks: '3' },
            { day: '2026-09-21', clicks: '5' },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch

    try {
      const response = await SELF.fetch(`https://example.com/api/v1/links/${created.id}/clicks`, {
        headers: { Cookie: sessionCookie },
      })
      expect(response.status).toBe(200)

      const body = await response.json<{ totalClicks: number; dailyClicks: { day: string; clicks: number }[] }>()
      expect(body).toEqual({
        totalClicks: 8,
        dailyClicks: [
          { day: '2026-09-20', clicks: 3 },
          { day: '2026-09-21', clicks: 5 },
        ],
      })

      // totalClicks・dailyClicks[].clicksがいずれも数値型(文字列のままではない)であることを確認する
      expect(typeof body.totalClicks).toBe('number')
      for (const item of body.dailyClicks) {
        expect(typeof item.clicks).toBe('number')
      }
    } finally {
      // テスト後は必ず元のfetchに戻す
      globalThis.fetch = originalFetch
    }
  })
})

describe('未認証アクセス', () => {
  it('POST /api/v1/linksは401を返す', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalUrl: 'https://example.com' }),
    })
    expect(response.status).toBe(401)
  })

  it('GET /api/v1/links/:idは401を返す', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/links/dummy-id')
    expect(response.status).toBe(401)
  })

  it('PATCH /api/v1/links/:idは401を返す', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/links/dummy-id', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'suspended' }),
    })
    expect(response.status).toBe(401)
  })

  it('DELETE /api/v1/links/:idは401を返す', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/links/dummy-id', {
      method: 'DELETE',
    })
    expect(response.status).toBe(401)
  })
})
