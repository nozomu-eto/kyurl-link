import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { linkSchema } from '@/shared/schemas/link'
import { markEmailVerified } from '../test/mark-email-verified'

// React Router(data mode)導入により、'/'を含むフロントエンドの予約パスはASSETS binding
// (SPAシェル)へ委譲されるようになった。このテスト環境ではvite buildの成果物
// (dist/client)が存在しないため、ASSETS.fetch()自体は404を返すが、それでも構わない
// (本物のSPAシェルが返るかどうかはpnpm run buildで検証する対象であり、Definition of Done
// にも定義されている)。ここでユニットテストとして確認すべきなのは、これらのパスが
// 誤って/:shortCodeのリダイレクトハンドラ(最後に登録される、単一セグメントの
// catch-all)に捕まっていないこと。Honoのルーティングは登録順が優先されるため
// (src/index.tsxのコメント参照)、この前提が崩れると'/login'等が短縮コードとして
// DB照会され、存在しないshortCode用の404ページ(redirect-pages.tsのnotFoundPageHtml、
// 「見つかりませんでした」という文言を含む)が返ってしまう。それが起きていないことを
// 本文に当該文言が含まれないことで確認する
// サインアップし、authMiddlewareを通すためのセッションCookieを取得する。
// requireVerifiedEmailミドルウェアを通すため、作成直後にemailVerifiedをtrueにしておく
async function signUpAndGetSessionCookie() {
  const response = await SELF.fetch('https://example.com/api/auth/sign-up/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
async function createLink(sessionCookie: string, originalUrl = 'https://example.com/security-headers-target') {
  const response = await SELF.fetch('https://example.com/api/v1/links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({ originalUrl }),
  })
  expect(response.status).toBe(201)
  return linkSchema.parse(await response.json())
}

// セキュリティヘッダ(公開前修正v2 T8)が、レスポンスの種類を問わず一律で付与されていることを確認する。
// hono/secure-headersのミドルウェアはHonoのレスポンスパイプライン(ctx.res)に対して後付けで
// ヘッダーを設定する実装のため、リダイレクト・エラーページ・API・ASSETS委譲(SPA)の
// いずれも同じ仕組みで付与される想定だが、ASSETS委譲分は明示的に確認しておく
describe('セキュリティヘッダ(hono/secure-headers)', () => {
  function expectSecurityHeaders(response: Response) {
    expect(response.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(response.headers.get('x-frame-options')).toBe('DENY')
  }

  it('公開リダイレクト(302)にセキュリティヘッダが付与される', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const link = await createLink(sessionCookie)

    const response = await SELF.fetch(`https://example.com/${link.shortCode}`, { redirect: 'manual' })
    expect(response.status).toBe(302)
    expectSecurityHeaders(response)
  })

  it('404ページにセキュリティヘッダが付与される', async () => {
    const response = await SELF.fetch('https://example.com/not-existing-short-code-for-headers-test', { redirect: 'manual' })
    expect(response.status).toBe(404)
    expectSecurityHeaders(response)
  })

  it('410ページにセキュリティヘッダが付与される', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const link = await createLink(sessionCookie)

    const patchResponse = await SELF.fetch(`https://example.com/api/v1/links/${link.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ status: 'suspended' }),
    })
    expect(patchResponse.status).toBe(200)

    const response = await SELF.fetch(`https://example.com/${link.shortCode}`, { redirect: 'manual' })
    expect(response.status).toBe(410)
    expectSecurityHeaders(response)
  })

  it('悪意あるURL警告インターステシャル(200)にセキュリティヘッダが付与される', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    // ヒューリスティック(IPアドレスリテラル)によりPOST /links時点でflaggedと判定されるURLを使う
    const link = await createLink(sessionCookie, 'http://192.168.1.2/phishing-target-for-headers-test')
    expect(link.securityStatus).toBe('flagged')

    const response = await SELF.fetch(`https://example.com/${link.shortCode}`, { redirect: 'manual' })
    expect(response.status).toBe(200)
    expectSecurityHeaders(response)
  })

  it('APIレスポンス(GET /api/v1/links、401)にセキュリティヘッダが付与される', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/links')
    expect(response.status).toBe(401)
    expectSecurityHeaders(response)
  })

  it('SPA/静的アセット(ASSETS binding委譲)のレスポンスにもセキュリティヘッダが付与される', async () => {
    // テスト環境ではvite buildの成果物(dist/client)が存在しないためASSETS.fetch()は404を返すが、
    // ここで確認したいのはヘッダーがASSETS委譲のレスポンスにも同じミドルウェアで付与されることであり、
    // 本文の内容(実際のSPAシェルかどうか)はpnpm run build側の検証対象のため対象外
    const response = await SELF.fetch('https://example.com/app', { redirect: 'manual' })
    expectSecurityHeaders(response)
  })
})

describe('フロントエンドの予約パスが/:shortCodeに奪われないこと', () => {
  it.each(['/', '/login', '/signup', '/terms', '/privacy', '/verify-email', '/reset-password', '/app', '/app/links/new'])(
    '%s は短縮コード用の404ページ(「見つかりませんでした」)を返さない',
    async (path) => {
      const response = await SELF.fetch(`https://example.com${path}`)
      const body = await response.text()
      expect(body).not.toContain('見つかりませんでした')
    },
  )
})
