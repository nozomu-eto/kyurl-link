import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { POSTER_SUBTITLE_MAX_LENGTH, POSTER_TITLE_MAX_LENGTH } from '@/shared/constants/input-limits'
import { posterSchema } from '@/shared/schemas/poster'
import { qrcodeSchema } from '@/shared/schemas/qrcode'
import { markEmailVerified } from '../../test/mark-email-verified'

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

  it(`titleが上限文字数(${POSTER_TITLE_MAX_LENGTH})+1文字の場合、400(VALIDATION_ERROR)になる`, async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)

    const response = await SELF.fetch('https://example.com/api/v1/posters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ title: 'あ'.repeat(POSTER_TITLE_MAX_LENGTH + 1), size: 'A6', qrCodeId: qrcode.id }),
    })
    expect(response.status).toBe(400)
    const body = await response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it(`titleがちょうど上限文字数(${POSTER_TITLE_MAX_LENGTH})の場合、作成できる`, async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)
    const title = 'あ'.repeat(POSTER_TITLE_MAX_LENGTH)

    const response = await SELF.fetch('https://example.com/api/v1/posters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ title, size: 'A6', qrCodeId: qrcode.id }),
    })
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ title })
  })

  it(`subtitleが上限文字数(${POSTER_SUBTITLE_MAX_LENGTH})+1文字の場合、400(VALIDATION_ERROR)になる`, async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)

    const response = await SELF.fetch('https://example.com/api/v1/posters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({
        title: 'テスト掲示物',
        subtitle: 'あ'.repeat(POSTER_SUBTITLE_MAX_LENGTH + 1),
        size: 'A6',
        qrCodeId: qrcode.id,
      }),
    })
    expect(response.status).toBe(400)
    const body = await response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it(`subtitleがちょうど上限文字数(${POSTER_SUBTITLE_MAX_LENGTH})の場合、作成できる`, async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)
    const subtitle = 'あ'.repeat(POSTER_SUBTITLE_MAX_LENGTH)

    const response = await SELF.fetch('https://example.com/api/v1/posters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ title: 'テスト掲示物', subtitle, size: 'A6', qrCodeId: qrcode.id }),
    })
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ subtitle })
  })
})

describe('PATCH /api/v1/posters/:id のstyleOptions', () => {
  it('styleOptionsに許可されたキー(foregroundColor)を指定すると反映される', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)
    const poster = await createPoster(sessionCookie, qrcode.id)

    const patchResponse = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ styleOptions: { foregroundColor: '#000000' } }),
    })
    expect(patchResponse.status).toBe(200)
    expect(await patchResponse.json()).toMatchObject({ styleOptions: { foregroundColor: '#000000' } })
  })

  it('styleOptionsに未知のキーを指定すると400(VALIDATION_ERROR)になる', async () => {
    // qrcode.tsと同様、styleOptionsはz.strictObject()で実際に使われるキーのみを許可するため、
    // 任意のキー(この例ではcolor)を含む場合は拒否されることを確認する(公開前修正v2 T6)
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)
    const poster = await createPoster(sessionCookie, qrcode.id)

    const patchResponse = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ styleOptions: { color: '#000000' } }),
    })
    expect(patchResponse.status).toBe(400)
    const body = await patchResponse.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('VALIDATION_ERROR')
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

describe('所有者チェック(他人のリソースにはアクセスできない)', () => {
  it('ユーザーAが作成したposterに対して、ユーザーBがアクセスすると404になる', async () => {
    const cookieA = await signUpAndGetSessionCookie()
    const qrcodeA = await createQrcode(cookieA)
    const poster = await createPoster(cookieA, qrcodeA.id)

    const cookieB = await signUpAndGetSessionCookie()
    const response = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}`, {
      headers: { Cookie: cookieB },
    })
    expect(response.status).toBe(404)
  })

  it('ユーザーBが、ユーザーAのqrcodeのidをqrCodeIdに指定してposter作成を試みると400になる', async () => {
    const cookieA = await signUpAndGetSessionCookie()
    const qrcodeA = await createQrcode(cookieA)

    const cookieB = await signUpAndGetSessionCookie()
    const response = await SELF.fetch('https://example.com/api/v1/posters', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieB,
      },
      body: JSON.stringify({ title: 'テスト掲示物', size: 'A6', qrCodeId: qrcodeA.id }),
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
