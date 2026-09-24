import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { linkSchema } from '@/shared/schemas/link'
import { posterSchema } from '@/shared/schemas/poster'
import { qrcodeSchema } from '@/shared/schemas/qrcode'
import { markEmailVerified } from '../../test/mark-email-verified'

// サインアップし、authMiddlewareを通すためのセッションCookieを取得する。
// レート制限は(未ログインのreportsを除き)ユーザーID単位でカウントするため、
// テストごとに新しいユーザーを作ることでテスト間のカウントの取り違えを防ぐ。
// requireVerifiedEmailミドルウェアを通すため、作成直後にemailVerifiedをtrueにしておく
async function signUp() {
  const response = await SELF.fetch('https://example.com/api/auth/sign-up/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: env.BETTER_AUTH_URL,
    },
    body: JSON.stringify({
      email: `rate-limit-${crypto.randomUUID()}@example.com`,
      password: 'password1234',
      name: 'Rate Limit Test User',
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

async function postLink(sessionCookie: string) {
  return SELF.fetch('https://example.com/api/v1/links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({ originalUrl: 'https://example.com/rate-limit-test' }),
  })
}

async function postQrcode(sessionCookie: string) {
  return SELF.fetch('https://example.com/api/v1/qrcodes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({ targetType: 'rawUrl', targetUrl: 'https://example.com/rate-limit-test' }),
  })
}

// wrangler.jsoncのWRITE_RATE_LIMITERは1分あたり30回まで。POST /links・POST /qrcodes・
// POST /postersで共有するバインディングのため、links.test.ts等の他テストへ影響が出ないよう、
// ここでは毎回signUp()で専用ユーザーを作り、カウントの起点をテストごとに分離する
const WRITE_RATE_LIMIT_MAX = 30
// REPORT_RATE_LIMITERは1分あたり5回まで(未ログイン・IPアドレス単位)
const REPORT_RATE_LIMIT_MAX = 5
// POSTER_EXPORT_RATE_LIMITERは1分あたり10回まで
const POSTER_EXPORT_RATE_LIMIT_MAX = 10

// POST /links・POST /qrcodes・POST /postersはWRITE_RATE_LIMITERバインディングをユーザーID単位で
// 共有するため、上限までの消費にはURLhaus照会(外部ネットワーク呼び出し)を伴わないPOST /qrcodes
// (targetType: 'rawUrl')を使う。POST /linksはURLhaus照会があり、上限回数分連続で呼ぶとテストが
// 大幅に遅くなる・外部サービス側のレート制限に引っかかる等の問題があるため避ける。
// 上限到達後はミドルウェアがハンドラに到達する前に429を返すため、429になることの確認自体は
// POST /links・POST /postersで行っても外部呼び出しは発生しない
describe('POST /links・POST /qrcodes・POST /posters のレート制限(WRITE_RATE_LIMITER)', () => {
  it(`同一ユーザーが上限(${WRITE_RATE_LIMIT_MAX}回/分)に達すると、POST /qrcodes・POST /links・POST /postersいずれも429(RATE_LIMITED)になる`, async () => {
    const sessionCookie = await signUp()

    for (let i = 0; i < WRITE_RATE_LIMIT_MAX; i++) {
      const response = await postQrcode(sessionCookie)
      expect(response.status).toBe(201)
    }

    const blockedQrcodeResponse = await postQrcode(sessionCookie)
    expect(blockedQrcodeResponse.status).toBe(429)
    const qrcodeBody = await blockedQrcodeResponse.json<{ error: { code: string } }>()
    expect(qrcodeBody.error.code).toBe('RATE_LIMITED')

    // 同じユーザー・同じバインディングを共有するPOST /linksも429になる(URLhaus照会に
    // 到達する前にミドルウェアで拒否されるため、実際に外部呼び出しは発生しない)
    const blockedLinkResponse = await postLink(sessionCookie)
    expect(blockedLinkResponse.status).toBe(429)

    // POST /postersも同様
    const blockedPosterResponse = await SELF.fetch('https://example.com/api/v1/posters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ title: 'レート制限テスト', size: 'A6', qrCodeId: 'dummy-id' }),
    })
    expect(blockedPosterResponse.status).toBe(429)
  })

  it('別のユーザーのリクエストは、他のユーザーの試行回数の影響を受けない', async () => {
    const sessionCookieA = await signUp()
    const sessionCookieB = await signUp()

    // ユーザーAを上限まで使い切る
    for (let i = 0; i < WRITE_RATE_LIMIT_MAX; i++) {
      const response = await postQrcode(sessionCookieA)
      expect(response.status).toBe(201)
    }
    const blockedResponse = await postQrcode(sessionCookieA)
    expect(blockedResponse.status).toBe(429)

    // ユーザーBはユーザーAのカウントに影響されず、通常どおり作成できる
    const otherUserResponse = await postQrcode(sessionCookieB)
    expect(otherUserResponse.status).toBe(201)
  })
})

describe('POST /api/v1/reports のレート制限(REPORT_RATE_LIMITER、未ログイン)', () => {
  // 通報対象が実在しなくても、schema検証を通過した時点でレート制限ミドルウェアが先に実行されるため、
  // 存在しないshortCode(404)への通報でも、429になるかどうかの検証には使える
  async function postReport(ip: string) {
    return SELF.fetch('https://example.com/api/v1/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': ip },
      body: JSON.stringify({ shortCode: 'not-existing', reason: 'レート制限テスト' }),
    })
  }

  it(`同一IPから${REPORT_RATE_LIMIT_MAX + 1}回目のリクエストは429(RATE_LIMITED)になる`, async () => {
    const ip = '198.51.100.1'

    for (let i = 0; i < REPORT_RATE_LIMIT_MAX; i++) {
      const response = await postReport(ip)
      // 対象linkが存在しないため404だが、レート制限には掛からない
      expect(response.status).toBe(404)
    }

    const blockedResponse = await postReport(ip)
    expect(blockedResponse.status).toBe(429)
    const body = await blockedResponse.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('RATE_LIMITED')
  })

  it('別のIPからのリクエストは、他のIPの試行回数の影響を受けない', async () => {
    const ipA = '198.51.100.10'
    const ipB = '198.51.100.20'

    for (let i = 0; i < REPORT_RATE_LIMIT_MAX; i++) {
      const response = await postReport(ipA)
      expect(response.status).toBe(404)
    }
    const blockedResponse = await postReport(ipA)
    expect(blockedResponse.status).toBe(429)

    const otherIpResponse = await postReport(ipB)
    expect(otherIpResponse.status).toBe(404)
  })
})

describe('GET /api/v1/posters/:id/export のレート制限(POSTER_EXPORT_RATE_LIMITER)', () => {
  it.skipIf(process.env.CI_SKIP_BROWSER_TEST)(
    `同一ユーザーから${POSTER_EXPORT_RATE_LIMIT_MAX + 1}回目のexportは429(RATE_LIMITED)になる`,
    async () => {
      const sessionCookie = await signUp()

      const linkResponse = await postLink(sessionCookie)
      expect(linkResponse.status).toBe(201)
      const link = linkSchema.parse(await linkResponse.json())

      const qrcodeResponse = await SELF.fetch('https://example.com/api/v1/qrcodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
        body: JSON.stringify({ targetType: 'link', targetId: link.id }),
      })
      expect(qrcodeResponse.status).toBe(201)
      const qrcode = qrcodeSchema.parse(await qrcodeResponse.json())

      const posterResponse = await SELF.fetch('https://example.com/api/v1/posters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
        body: JSON.stringify({ title: 'レート制限テスト', size: 'A6', qrCodeId: qrcode.id }),
      })
      expect(posterResponse.status).toBe(201)
      const poster = posterSchema.parse(await posterResponse.json())

      // 1回目はBrowser Renderingで生成、2回目以降は内容が同じためR2キャッシュから返る
      // (src/routes/posters.tsのハッシュベースのキャッシュキー設計による)ため、
      // 上限回数分の呼び出しでも実際にブラウザを起動するのは1回だけで済む
      for (let i = 0; i < POSTER_EXPORT_RATE_LIMIT_MAX; i++) {
        const response = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}/export`, {
          headers: { Cookie: sessionCookie },
        })
        expect(response.status).toBe(200)
      }

      const blockedResponse = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}/export`, {
        headers: { Cookie: sessionCookie },
      })
      expect(blockedResponse.status).toBe(429)
      const body = await blockedResponse.json<{ error: { code: string } }>()
      expect(body.error.code).toBe('RATE_LIMITED')
    },
  )
})
