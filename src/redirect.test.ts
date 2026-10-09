import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { links } from '@/db/schema'
import { goneePageHtml, notFoundPageHtml, securityWarningPageHtml } from '@/lib/redirect-pages'
import { linkSchema } from '@/shared/schemas/link'
import { markEmailVerified } from '../test/mark-email-verified'

// サインアップし、authMiddlewareを通すためのセッションCookieを取得する。
// requireVerifiedEmailミドルウェアを通すため、作成直後にemailVerifiedをtrueにしておく
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

    // PATCH /links/:idは過去日時をexpiresAtに設定することを拒否するため、
    // 「期限切れ状態のlink」自体はAPI越しには作れない。ここでは410判定のロジックだけを
    // 確認したいので、moderationStatusのテストと同様にD1を直接更新して期限切れ状態を再現する
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const db = drizzle(env.DB)
    await db.update(links).set({ expiresAt: pastDate }).where(eq(links.id, link.id))

    // 410ページの表示自体は認証不要のため、Cookie無しでアクセスする
    const response = await SELF.fetch(`https://example.com/${link.shortCode}`, { redirect: 'manual' })
    expect(response.status).toBe(410)
  })

  it('securityStatusがflaggedのlinkにアクセスすると、302の代わりに警告インターステシャルが表示される(認証不要)', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    // ヒューリスティック(IPアドレスリテラル)によりPOST /links時点でflaggedと判定されるURLを使う
    const link = await createLink(sessionCookie, 'http://192.168.1.1/phishing-target')
    expect(link.securityStatus).toBe('flagged')

    const response = await SELF.fetch(`https://example.com/${link.shortCode}`, { redirect: 'manual' })
    expect(response.status).toBe(200)

    const body = await response.text()
    expect(body).toContain('このリンク先の安全性を確認できませんでした')
    expect(body).toContain('このまま進む')
    expect(body).toContain('このリンクに問題があると思われる場合はこちらから報告')
  })

  it('flaggedなlinkでも?proceed=1を付けてアクセスすると、302でoriginalUrlにリダイレクトされる(認証不要)', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const link = await createLink(sessionCookie, 'http://192.168.1.1/phishing-target')
    expect(link.securityStatus).toBe('flagged')

    const response = await SELF.fetch(`https://example.com/${link.shortCode}?proceed=1`, { redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('http://192.168.1.1/phishing-target')
  })

  it('アカウント削除申請によりカスケードでソフトデリートされたlinkにアクセスすると、404ではなく410になる(docs/architecture.mdの「アカウント削除・データ削除の実装フロー」)', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const link = await createLink(sessionCookie)

    // 通常通り302でリダイレクトされることを確認しておく(申請前は正常動作)
    const beforeResponse = await SELF.fetch(`https://example.com/${link.shortCode}`, { redirect: 'manual' })
    expect(beforeResponse.status).toBe(302)

    const accountRequestResponse = await SELF.fetch('https://example.com/api/v1/account-requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ password: 'password1234' }),
    })
    expect(accountRequestResponse.status).toBe(201)

    // 410ページの表示自体は認証不要のため、Cookie無しでアクセスする
    const response = await SELF.fetch(`https://example.com/${link.shortCode}`, { redirect: 'manual' })
    expect(response.status).toBe(410)

    const body = await response.text()
    expect(body).toContain('ご利用いただけません')
  })

  it('DBに直接http/https以外のスキームのoriginalUrlを保存したlinkにアクセスしても、リダイレクトされず404になる(多層防御)', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const link = await createLink(sessionCookie)

    // POST /linksのスキーマ検証をバイパスし、DB直接操作を模して危険なスキームを保存する
    const db = drizzle(env.DB)
    await db.update(links).set({ originalUrl: 'javascript:alert(1)' }).where(eq(links.id, link.id))

    const response = await SELF.fetch(`https://example.com/${link.shortCode}`, { redirect: 'manual' })
    expect(response.status).toBe(404)

    const body = await response.text()
    expect(body).toContain('見つかりませんでした')
  })

  it('moderationStatusが"suspended"(運営による強制停止)のlinkにアクセスすると410になる(認証不要)', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const link = await createLink(sessionCookie)

    // 管理画面・管理APIは無いため、D1への直接更新を模してmoderationStatusを書き換える
    const db = drizzle(env.DB)
    await db.update(links).set({ moderationStatus: 'suspended' }).where(eq(links.id, link.id))

    const response = await SELF.fetch(`https://example.com/${link.shortCode}`, { redirect: 'manual' })
    expect(response.status).toBe(410)

    const body = await response.text()
    expect(body).toContain('ご利用いただけません')
  })

  it('個別削除(DELETE /api/v1/links/:id)後のlinkにアクセスすると、引き続き404になる(回帰防止)', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const link = await createLink(sessionCookie)

    const deleteResponse = await SELF.fetch(`https://example.com/api/v1/links/${link.id}`, {
      method: 'DELETE',
      headers: { Cookie: sessionCookie },
    })
    expect(deleteResponse.status).toBe(204)

    const response = await SELF.fetch(`https://example.com/${link.shortCode}`, { redirect: 'manual' })
    expect(response.status).toBe(404)

    const body = await response.text()
    expect(body).toContain('見つかりませんでした')
  })
})

describe('来訪者向け3画面(404・410・警告インターステシャル)の見た目・表示内容', () => {
  it('404・410・警告の3画面のHTMLに、スマートフォンでの表示崩れを防ぐviewportとlang="ja"が含まれる', () => {
    for (const html of [notFoundPageHtml(), goneePageHtml(), securityWarningPageHtml('abc123', 'dummy-site-key', undefined, 'https://example.com/target')]) {
      expect(html).toContain('lang="ja"')
      expect(html).toContain('name="viewport"')
    }
  })

  it('警告インターステシャルに移動先の元URLが表示される', () => {
    const html = securityWarningPageHtml('abc123', 'dummy-site-key', undefined, 'https://example.com/original-target')
    expect(html).toContain('移動先のURL')
    expect(html).toContain('https://example.com/original-target')
  })

  it('元URLに<script>や"を含めても、実体参照にエスケープされ生のタグとしては出力されない', () => {
    const maliciousUrl = 'https://example.com/"><script>alert(1)</script>'
    const html = securityWarningPageHtml('abc123', 'dummy-site-key', undefined, maliciousUrl)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&quot;')
  })

  it('警告インターステシャルで[戻る]のリンクが[このまま進む]より前に出力される', () => {
    const html = securityWarningPageHtml('abc123', 'dummy-site-key', undefined, 'https://example.com/target')
    const backIndex = html.indexOf('戻る')
    const proceedIndex = html.indexOf('このまま進む')
    expect(backIndex).toBeGreaterThan(-1)
    expect(proceedIndex).toBeGreaterThan(-1)
    expect(backIndex).toBeLessThan(proceedIndex)
  })
})
