import { env, SELF } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'
import { linkSchema } from '@/shared/schemas/link'
import { markEmailVerified } from '../../test/mark-email-verified'

const originalFetch = globalThis.fetch

afterEach(() => {
  // テスト後は必ず元のfetchに戻す(urlhaus-client.test.tsと同じパターン)
  globalThis.fetch = originalFetch
})

// Turnstileのsiteverify APIをモックする。POST /reportsはTurnstile検証を必須にしているため、
// 実際のCloudflareのエンドポイントへ問い合わせず、successの値を固定して返す
function mockTurnstileSiteverify(success: boolean) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ success }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch
}

// サインアップし、authMiddlewareを通すためのセッションCookieを取得する
// (通報自体は認証不要だが、テスト対象のlinkを作るためにはlink作成側の認証が必要。
// requireVerifiedEmailミドルウェアを通すため、作成直後にemailVerifiedをtrueにしておく)
async function signUpAndGetSessionCookie() {
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
  const body = await response.json<{ user: { id: string } }>()
  await markEmailVerified(body.user.id)
  return setCookie.split(';')[0]
}

// 認証済みlinkを1件作成する
async function createLink(sessionCookie: string, originalUrl = 'https://example.com/report-target') {
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

describe('POST /api/v1/reports', () => {
  it('認証なしで、実在するshortCodeへの通報が201で成功する(Turnstileトークンが有効な場合)', async () => {
    mockTurnstileSiteverify(true)
    const sessionCookie = await signUpAndGetSessionCookie()
    const link = await createLink(sessionCookie)

    // 通報自体は認証不要のエンドポイントのため、Cookie無しでアクセスする
    const response = await SELF.fetch('https://example.com/api/v1/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shortCode: link.shortCode, reason: 'スパムのようなリンクです', turnstileToken: 'valid-test-token' }),
    })
    expect(response.status).toBe(201)

    const body = await response.json()
    expect(body).toMatchObject({
      linkId: link.id,
      reason: 'スパムのようなリンクです',
      status: 'pending',
    })
  })

  it('存在しないshortCodeへの通報は404になる', async () => {
    mockTurnstileSiteverify(true)

    const response = await SELF.fetch('https://example.com/api/v1/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shortCode: 'not-existing-short-code', reason: 'テスト通報', turnstileToken: 'valid-test-token' }),
    })
    expect(response.status).toBe(404)

    const body = await response.json()
    expect(body).toMatchObject({
      error: {
        code: expect.any(String),
        message: expect.any(String),
      },
    })
  })

  it('reasonが空文字の場合400になる', async () => {
    mockTurnstileSiteverify(true)
    const sessionCookie = await signUpAndGetSessionCookie()
    const link = await createLink(sessionCookie)

    const response = await SELF.fetch('https://example.com/api/v1/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shortCode: link.shortCode, reason: '', turnstileToken: 'valid-test-token' }),
    })
    expect(response.status).toBe(400)

    const body = await response.json()
    expect(body).toMatchObject({
      error: {
        code: expect.any(String),
        message: expect.any(String),
      },
    })
  })

  it('turnstileTokenが無い場合400(VALIDATION_ERROR)になる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const link = await createLink(sessionCookie)

    // siteverifyへ到達する前にzodスキーマの必須チェックで弾かれるため、mockTurnstileSiteverifyは不要
    const response = await SELF.fetch('https://example.com/api/v1/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shortCode: link.shortCode, reason: 'テスト通報' }),
    })
    expect(response.status).toBe(400)

    const body = await response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('turnstileTokenが不正(siteverifyがsuccess: falseを返す)場合400(TURNSTILE_VERIFICATION_FAILED)になる', async () => {
    mockTurnstileSiteverify(false)
    const sessionCookie = await signUpAndGetSessionCookie()
    const link = await createLink(sessionCookie)

    const response = await SELF.fetch('https://example.com/api/v1/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shortCode: link.shortCode, reason: 'テスト通報', turnstileToken: 'invalid-test-token' }),
    })
    expect(response.status).toBe(400)

    const body = await response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('TURNSTILE_VERIFICATION_FAILED')
  })
})
