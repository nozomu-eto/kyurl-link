import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { linkSchema } from '@/shared/schemas/link'

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

// 認証済みlinkを1件作成する
async function createLink(sessionCookie: string, originalUrl = 'https://example.com/redirect-target') {
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

describe('GET /:shortCode', () => {
  it('有効なlinkのshortCodeにアクセスすると302でoriginalUrlにリダイレクトされる(認証不要)', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const link = await createLink(sessionCookie, 'https://example.com/redirect-target')

    // 公開エンドポイントのため、Cookie無しでアクセスする
    const response = await SELF.fetch(`https://example.com/${link.shortCode}`, { redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://example.com/redirect-target')
  })

  it('statusを"suspended"に変更した後にアクセスすると410になり、本文に「ご利用いただけません」を含む(認証不要)', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const link = await createLink(sessionCookie)

    const patchResponse = await SELF.fetch(`https://example.com/api/v1/links/${link.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ status: 'suspended' }),
    })
    expect(patchResponse.status).toBe(200)

    // 410ページの表示自体は認証不要のため、Cookie無しでアクセスする
    const response = await SELF.fetch(`https://example.com/${link.shortCode}`, { redirect: 'manual' })
    expect(response.status).toBe(410)

    const body = await response.text()
    expect(body).toContain('ご利用いただけません')
  })

  it('存在しないshortCodeにアクセスすると404になり、本文に「見つかりませんでした」を含む(認証不要)', async () => {
    const response = await SELF.fetch('https://example.com/not-existing-short-code', { redirect: 'manual' })
    expect(response.status).toBe(404)

    const body = await response.text()
    expect(body).toContain('見つかりませんでした')
  })

  it('expiresAtが過去の日時の場合、statusが"active"のままでも410になる(認証不要)', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const link = await createLink(sessionCookie)

    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const patchResponse = await SELF.fetch(`https://example.com/api/v1/links/${link.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ expiresAt: pastDate }),
    })
    expect(patchResponse.status).toBe(200)
    const patched = await patchResponse.json()
    expect(patched).toMatchObject({ status: 'active', expiresAt: pastDate })

    // 410ページの表示自体は認証不要のため、Cookie無しでアクセスする
    const response = await SELF.fetch(`https://example.com/${link.shortCode}`, { redirect: 'manual' })
    expect(response.status).toBe(410)
  })
})
