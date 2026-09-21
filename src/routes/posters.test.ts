import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { posterSchema } from '@/shared/schemas/poster'
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

// posterのqrCodeId用に、認証済みqrcode(targetType='rawUrl')を1件作成する
async function createQrcode(sessionCookie: string) {
  const response = await SELF.fetch('https://example.com/api/v1/qrcodes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify({ targetType: 'rawUrl', targetUrl: 'https://example.com/poster-target' }),
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

describe('POST /api/v1/posters', () => {
  it('実在するqrCodeIdでposterを作成できる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)

    const poster = await createPoster(sessionCookie, qrcode.id)
    expect(poster).toMatchObject({
      title: 'テスト掲示物',
      size: 'A6',
      qrCodeId: qrcode.id,
      layoutTemplate: 'default',
      styleOptions: null,
    })
  })

  it('存在しないqrCodeIdを指定すると400になる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()

    const response = await SELF.fetch('https://example.com/api/v1/posters', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ title: 'テスト掲示物', size: 'A6', qrCodeId: 'not-existing-qrcode-id' }),
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

describe('GET /api/v1/posters/:id/export', () => {
  // Browser Rendering(ローカルでは初回にブラウザのダウンロードが発生する)を実際に起動するため、
  // デフォルトのテストタイムアウトでは不足することがある
  //
  // Cloudflare Workers Buildsのビルドコンテナには、ローカルブラウザ実行に必要な共有ライブラリ
  // (libatk-1.0.so.0等)が無く、apt-get等での追加インストールも許可されていないため、CI環境では
  // このテストをスキップする。この機能自体は実際の本番環境(Cloudflare Browser Rendering)で
  // 手動検証済み(docs/deployment.md参照)。ローカル開発環境では通常通りこのテストが実行される
  it.skipIf(process.env.CI_SKIP_BROWSER_TEST)('format=pdfで200とContent-Type: application/pdfを返し、2回目はR2キャッシュから返る', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)
    const poster = await createPoster(sessionCookie, qrcode.id)

    // 1回目: Browser Renderingで生成し、R2にキャッシュされる
    const firstResponse = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}/export?format=pdf`, {
      headers: { Cookie: sessionCookie },
    })
    expect(firstResponse.status).toBe(200)
    expect(firstResponse.headers.get('content-type')).toBe('application/pdf')
    const firstBody = await firstResponse.arrayBuffer()
    expect(firstBody.byteLength).toBeGreaterThan(0)

    // R2(POSTER_CACHE)にposter.id配下でオブジェクトが1件作られていることを確認する
    const listAfterFirst = await env.POSTER_CACHE.list({ prefix: `${poster.id}/pdf/` })
    expect(listAfterFirst.objects.length).toBe(1)

    // 2回目: 同じ内容でリクエストすると、新規生成せずR2キャッシュから同じバイト列が返る
    const secondResponse = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}/export?format=pdf`, {
      headers: { Cookie: sessionCookie },
    })
    expect(secondResponse.status).toBe(200)
    expect(secondResponse.headers.get('content-type')).toBe('application/pdf')
    const secondBody = await secondResponse.arrayBuffer()
    expect(new Uint8Array(secondBody)).toEqual(new Uint8Array(firstBody))

    // オブジェクト数が増えていない(=新規生成されずキャッシュがそのまま使われた)ことを確認する
    const listAfterSecond = await env.POSTER_CACHE.list({ prefix: `${poster.id}/pdf/` })
    expect(listAfterSecond.objects.length).toBe(1)
  }, 30000)
})

describe('未認証アクセス', () => {
  it('GET /api/v1/postersは401を返す', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/posters')
    expect(response.status).toBe(401)
  })

  it('POST /api/v1/postersは401を返す', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/posters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'test', size: 'A6', qrCodeId: 'dummy-id' }),
    })
    expect(response.status).toBe(401)
  })

  it('GET /api/v1/posters/:idは401を返す', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/posters/dummy-id')
    expect(response.status).toBe(401)
  })

  it('PATCH /api/v1/posters/:idは401を返す', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/posters/dummy-id', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'test' }),
    })
    expect(response.status).toBe(401)
  })

  it('DELETE /api/v1/posters/:idは401を返す', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/posters/dummy-id', {
      method: 'DELETE',
    })
    expect(response.status).toBe(401)
  })

  it('GET /api/v1/posters/:id/exportは401を返す(postersはexportも認証必須)', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/posters/dummy-id/export')
    expect(response.status).toBe(401)
  })
})
