import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { linkSchema } from '@/shared/schemas/link'
import { posterSchema } from '@/shared/schemas/poster'
import { qrcodeSchema } from '@/shared/schemas/qrcode'
import { markEmailVerified } from '../../test/mark-email-verified'

// サインアップに使う固定パスワード(verifyPasswordの正誤を確認するテストで参照する)
const TEST_PASSWORD = 'password1234'

// サインアップし、authMiddlewareを通すためのセッションCookieを取得する。
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
      password: TEST_PASSWORD,
      name: 'Test User',
      agreeToTerms: true,
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
async function createLink(sessionCookie: string) {
  const response = await SELF.fetch('https://example.com/api/v1/links', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify({ originalUrl: 'https://example.com/account-request-target' }),
  })
  expect(response.status).toBe(201)
  return linkSchema.parse(await response.json())
}

// 認証済みqrcodeを1件作成する(targetType='rawUrl')
async function createQrcode(sessionCookie: string) {
  const response = await SELF.fetch('https://example.com/api/v1/qrcodes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify({ targetType: 'rawUrl', targetUrl: 'https://example.com/account-request-qr' }),
  })
  expect(response.status).toBe(201)
  return qrcodeSchema.parse(await response.json())
}

// 認証済みposterを1件作成する
async function createPoster(sessionCookie: string, qrCodeId: string) {
  const response = await SELF.fetch('https://example.com/api/v1/posters', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify({ title: 'テスト掲示物', size: 'A6', qrCodeId }),
  })
  expect(response.status).toBe(201)
  return posterSchema.parse(await response.json())
}

describe('POST /api/v1/account-requests', () => {
  it('正しいパスワードで申請すると201になり、所有するlink・qrcode・posterのdeletedAtが全て設定される', async () => {
    const sessionCookie = await signUp()
    const link = await createLink(sessionCookie)
    const qrcode = await createQrcode(sessionCookie)
    const poster = await createPoster(sessionCookie, qrcode.id)

    // env.EMAIL.send()を差し替えて、申請受付メールが送信されたことを直接検証する。
    // @cloudflare/vitest-pluginには送信メールを直接検証する組み込みAPIが無いため、
    // env.EMAIL.send自体を差し替えて呼び出し内容を記録する方式で代用する
    const sentEmails: { to?: unknown; subject?: string }[] = []
    env.EMAIL.send = async (message) => {
      sentEmails.push(message as { to?: unknown; subject?: string })
      return { messageId: 'test-message-id' }
    }

    const response = await SELF.fetch('https://example.com/api/v1/account-requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ password: TEST_PASSWORD }),
    })
    expect(response.status).toBe(201)

    // 申請受付メールが1通送信されたことを確認する
    expect(sentEmails).toHaveLength(1)
    expect(sentEmails[0]).toMatchObject({
      subject: '【kyurl.link】アカウント削除申請を受け付けました',
    })

    const body = await response.json()
    expect(body).toMatchObject({
      status: 'pending',
      completedAt: null,
    })

    // ソフトデリートされ、詳細取得が404になることで削除を確認する
    const linkResponse = await SELF.fetch(`https://example.com/api/v1/links/${link.id}`, {
      headers: { Cookie: sessionCookie },
    })
    expect(linkResponse.status).toBe(404)

    const qrcodeResponse = await SELF.fetch(`https://example.com/api/v1/qrcodes/${qrcode.id}`, {
      headers: { Cookie: sessionCookie },
    })
    expect(qrcodeResponse.status).toBe(404)

    const posterResponse = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}`, {
      headers: { Cookie: sessionCookie },
    })
    expect(posterResponse.status).toBe(404)
  })

  it('誤ったパスワードで申請すると401になり、リソースは削除されないままである', async () => {
    const sessionCookie = await signUp()
    const link = await createLink(sessionCookie)

    const response = await SELF.fetch('https://example.com/api/v1/account-requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ password: 'wrong-password' }),
    })
    expect(response.status).toBe(401)

    const body = await response.json()
    expect(body).toMatchObject({
      error: {
        code: expect.any(String),
        message: expect.any(String),
      },
    })

    // linkは削除されておらず、引き続き取得できることを確認する
    const linkResponse = await SELF.fetch(`https://example.com/api/v1/links/${link.id}`, {
      headers: { Cookie: sessionCookie },
    })
    expect(linkResponse.status).toBe(200)
  })

  it('同じユーザーが2回申請すると2回目は409になる', async () => {
    const sessionCookie = await signUp()

    const firstResponse = await SELF.fetch('https://example.com/api/v1/account-requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ password: TEST_PASSWORD }),
    })
    expect(firstResponse.status).toBe(201)

    const secondResponse = await SELF.fetch('https://example.com/api/v1/account-requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ password: TEST_PASSWORD }),
    })
    expect(secondResponse.status).toBe(409)

    const body = await secondResponse.json()
    expect(body).toMatchObject({
      error: {
        code: expect.any(String),
        message: expect.any(String),
      },
    })
  })

  it('未認証の場合401になる', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/account-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: TEST_PASSWORD }),
    })
    expect(response.status).toBe(401)
  })
})

describe('GET /api/v1/account-requests', () => {
  it('申請していない状態で実行すると404になる', async () => {
    const sessionCookie = await signUp()

    const response = await SELF.fetch('https://example.com/api/v1/account-requests', {
      headers: { Cookie: sessionCookie },
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

  it('申請後に実行すると200で申請内容が返る', async () => {
    const sessionCookie = await signUp()

    const requestResponse = await SELF.fetch('https://example.com/api/v1/account-requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ password: TEST_PASSWORD }),
    })
    expect(requestResponse.status).toBe(201)
    const created = await requestResponse.json()

    const response = await SELF.fetch('https://example.com/api/v1/account-requests', {
      headers: { Cookie: sessionCookie },
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(created)
  })
})
