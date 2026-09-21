import { drizzle } from 'drizzle-orm/d1'
import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { links } from '@/db/schema'

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
