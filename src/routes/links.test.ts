import { drizzle } from 'drizzle-orm/d1'
import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { links } from '@/db/schema'
import { linkListResponseSchema, linkSchema } from '@/shared/schemas/link'

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
  // "better-auth.session_token=...; Max-Age=...; Path=...; ..." からCookieヘッダーに使う先頭の "name=value" だけを取り出す
  return setCookie.split(';')[0]
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
    // このテスト内で完結するよう、都度一意なIDでテスト用D1(env.DB)にデータを1件insertする
    // (テストファイル内では同一D1インスタンスを使い回すため、他テストと衝突しない値にする)
    const id = crypto.randomUUID()
    const db = drizzle(env.DB)
    await db.insert(links).values({
      id,
      originalUrl: 'https://example.com',
      shortCode: id,
      status: 'active',
      expiresAt: null,
    })

    const sessionCookie = await signUpAndGetSessionCookie()

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

describe('links CRUD', () => {
  it('POST /api/v1/links で作成したlinkを、GET /api/v1/links/:idで取得できる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()

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
    const sessionCookie = await signUpAndGetSessionCookie()
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
    const sessionCookie = await signUpAndGetSessionCookie()
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
