import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { linkSchema } from '@/shared/schemas/link'
import { qrcodeSchema } from '@/shared/schemas/qrcode'

// サインアップし、authMiddlewareを通すためのセッションCookieを取得する
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
  return setCookie.split(';')[0]
}

// qrcodeのtargetType='link'テスト用に、認証済みlinkを1件作成する
async function createLink(sessionCookie: string) {
  const response = await SELF.fetch('https://example.com/api/v1/links', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify({ originalUrl: 'https://example.com/qrcode-target' }),
  })
  expect(response.status).toBe(201)
  return linkSchema.parse(await response.json())
}

// 認証済みqrcodeを1件作成する(targetType='rawUrl')
async function createRawUrlQrcode(sessionCookie: string) {
  const response = await SELF.fetch('https://example.com/api/v1/qrcodes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify({ targetType: 'rawUrl', targetUrl: 'https://example.com/raw' }),
  })
  expect(response.status).toBe(201)
  return qrcodeSchema.parse(await response.json())
}

describe('POST /api/v1/qrcodes', () => {
  it("targetType: 'link' + 実在するlinkのidを指定して作成できる", async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const link = await createLink(sessionCookie)

    const response = await SELF.fetch('https://example.com/api/v1/qrcodes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ targetType: 'link', targetId: link.id }),
    })
    expect(response.status).toBe(201)

    const body = await response.json()
    expect(body).toMatchObject({
      targetType: 'link',
      targetId: link.id,
      targetUrl: null,
      styleOptions: null,
    })
  })

  it("targetType: 'link' + 存在しないidを指定すると400になる", async () => {
    const sessionCookie = await signUpAndGetSessionCookie()

    const response = await SELF.fetch('https://example.com/api/v1/qrcodes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ targetType: 'link', targetId: 'not-existing-link-id' }),
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

  it("targetType: 'rawUrl' + 有効なURLで作成できる", async () => {
    const sessionCookie = await signUpAndGetSessionCookie()

    const response = await SELF.fetch('https://example.com/api/v1/qrcodes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ targetType: 'rawUrl', targetUrl: 'https://example.com/raw' }),
    })
    expect(response.status).toBe(201)

    const body = await response.json()
    expect(body).toMatchObject({
      targetType: 'rawUrl',
      targetId: null,
      targetUrl: 'https://example.com/raw',
      styleOptions: null,
    })
  })
})

describe('GET /api/v1/qrcodes/:id/image', () => {
  it('認証なしで200を返し、Content-Typeがimage/svg+xmlであることを確認する', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createRawUrlQrcode(sessionCookie)

    // authMiddlewareを付けない公開エンドポイントのため、Cookie無しでアクセスする
    const response = await SELF.fetch(`https://example.com/api/v1/qrcodes/${qrcode.id}/image`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/svg+xml')

    const svg = await response.text()
    expect(svg).toContain('<svg')
  })
})

describe('qrcode PATCH・DELETE', () => {
  it('PATCH /api/v1/qrcodes/:idでstyleOptionsを変更すると反映される', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createRawUrlQrcode(sessionCookie)

    const patchResponse = await SELF.fetch(`https://example.com/api/v1/qrcodes/${qrcode.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ styleOptions: { color: '#000000' } }),
    })
    expect(patchResponse.status).toBe(200)
    expect(await patchResponse.json()).toMatchObject({
      id: qrcode.id,
      styleOptions: { color: '#000000' },
    })
  })

  it('DELETE /api/v1/qrcodes/:id実行後、GET /api/v1/qrcodes/:idは404になる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createRawUrlQrcode(sessionCookie)

    const deleteResponse = await SELF.fetch(`https://example.com/api/v1/qrcodes/${qrcode.id}`, {
      method: 'DELETE',
      headers: { Cookie: sessionCookie },
    })
    expect(deleteResponse.status).toBe(204)

    const getResponse = await SELF.fetch(`https://example.com/api/v1/qrcodes/${qrcode.id}`, {
      headers: { Cookie: sessionCookie },
    })
    expect(getResponse.status).toBe(404)
  })
})

describe('所有者チェック(他人のリソースにはアクセスできない)', () => {
  it('ユーザーAが作成したqrcodeに対して、ユーザーBがアクセスすると404になる', async () => {
    const cookieA = await signUpAndGetSessionCookie()
    const qrcode = await createRawUrlQrcode(cookieA)

    const cookieB = await signUpAndGetSessionCookie()
    const response = await SELF.fetch(`https://example.com/api/v1/qrcodes/${qrcode.id}`, {
      headers: { Cookie: cookieB },
    })
    expect(response.status).toBe(404)
  })

  it('ユーザーBが、ユーザーAのlinkのidをtargetIdに指定してqrcode作成を試みると400になる', async () => {
    const cookieA = await signUpAndGetSessionCookie()
    const linkA = await createLink(cookieA)

    const cookieB = await signUpAndGetSessionCookie()
    const response = await SELF.fetch('https://example.com/api/v1/qrcodes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieB,
      },
      body: JSON.stringify({ targetType: 'link', targetId: linkA.id }),
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
})

describe('未認証アクセス', () => {
  it('GET /api/v1/qrcodesは401を返す', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/qrcodes')
    expect(response.status).toBe(401)
  })

  it('POST /api/v1/qrcodesは401を返す', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/qrcodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetType: 'rawUrl', targetUrl: 'https://example.com' }),
    })
    expect(response.status).toBe(401)
  })

  it('GET /api/v1/qrcodes/:idは401を返す', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/qrcodes/dummy-id')
    expect(response.status).toBe(401)
  })

  it('PATCH /api/v1/qrcodes/:idは401を返す', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/qrcodes/dummy-id', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ styleOptions: {} }),
    })
    expect(response.status).toBe(401)
  })

  it('DELETE /api/v1/qrcodes/:idは401を返す', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/qrcodes/dummy-id', {
      method: 'DELETE',
    })
    expect(response.status).toBe(401)
  })

  it('GET /api/v1/qrcodes/:id/imageは公開エンドポイントのため401にならない(存在しないidなので404)', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/qrcodes/dummy-id/image')
    expect(response.status).toBe(404)
  })
})
