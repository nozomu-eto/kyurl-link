import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { links, qrcodes } from '@/db/schema'
import { linkSchema } from '@/shared/schemas/link'
import { qrcodeSchema } from '@/shared/schemas/qrcode'
import { markEmailVerified } from '../../test/mark-email-verified'
import { decodeGrayscalePixels, readPngDimensions } from '../../test/png-inspect'

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

  it.each(['javascript:alert(1)', 'data:text/html,xxx', 'mailto:a@example.com', 'ftp://example.com'])(
    "targetType: 'rawUrl' + targetUrlが%sの場合、400(VALIDATION_ERROR)になる",
    async (targetUrl) => {
      const sessionCookie = await signUpAndGetSessionCookie()

      const response = await SELF.fetch('https://example.com/api/v1/qrcodes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie,
        },
        body: JSON.stringify({ targetType: 'rawUrl', targetUrl }),
      })
      expect(response.status).toBe(400)
      const body = await response.json<{ error: { code: string } }>()
      expect(body.error.code).toBe('VALIDATION_ERROR')
    },
  )

  it('nameを指定して作成すると、前後の空白が除去されて保存される', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()

    const response = await SELF.fetch('https://example.com/api/v1/qrcodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ targetType: 'rawUrl', targetUrl: 'https://example.com/raw', name: '  店頭用  ' }),
    })
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ name: '店頭用' })
  })

  it('nameを省略、または空文字(トリム後に空になる文字列を含む)で作成すると、nameはnullになる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()

    const withoutNameResponse = await SELF.fetch('https://example.com/api/v1/qrcodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ targetType: 'rawUrl', targetUrl: 'https://example.com/raw' }),
    })
    expect(await withoutNameResponse.json()).toMatchObject({ name: null })

    const blankNameResponse = await SELF.fetch('https://example.com/api/v1/qrcodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ targetType: 'rawUrl', targetUrl: 'https://example.com/raw', name: '   ' }),
    })
    expect(await blankNameResponse.json()).toMatchObject({ name: null })
  })

  it('nameに41文字を指定すると400(VALIDATION_ERROR)になる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()

    const response = await SELF.fetch('https://example.com/api/v1/qrcodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ targetType: 'rawUrl', targetUrl: 'https://example.com/raw', name: 'あ'.repeat(41) }),
    })
    expect(response.status).toBe(400)
    const body = await response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('VALIDATION_ERROR')
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

  it('formatを指定しない場合はSVGが返る(既存の<img src>表示を変えないため)', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createRawUrlQrcode(sessionCookie)

    const response = await SELF.fetch(`https://example.com/api/v1/qrcodes/${qrcode.id}/image`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/svg+xml')
  })

  it('format=svgを明示した場合もSVGが返る', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createRawUrlQrcode(sessionCookie)

    const response = await SELF.fetch(`https://example.com/api/v1/qrcodes/${qrcode.id}/image?format=svg`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/svg+xml')
  })

  it('format=pngのみでsizeを指定しない場合、初期値の1024pxのPNGが返る', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createRawUrlQrcode(sessionCookie)

    const response = await SELF.fetch(`https://example.com/api/v1/qrcodes/${qrcode.id}/image?format=png`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600')

    const png = new Uint8Array(await response.arrayBuffer())
    const { width, height } = readPngDimensions(png)
    expect(width).toBe(1024)
    expect(height).toBe(1024)
  })

  it.each([512, 1024, 2048])('format=png&size=%iで、指定した縦横のPNGが返る', async (size) => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createRawUrlQrcode(sessionCookie)

    const response = await SELF.fetch(`https://example.com/api/v1/qrcodes/${qrcode.id}/image?format=png&size=${size}`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')

    const png = new Uint8Array(await response.arrayBuffer())
    const { width, height } = readPngDimensions(png)
    expect(width).toBe(size)
    expect(height).toBe(size)
  })

  it('PNGの画素が白と黒だけであること(中間色が無いこと)', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createRawUrlQrcode(sessionCookie)

    const response = await SELF.fetch(`https://example.com/api/v1/qrcodes/${qrcode.id}/image?format=png&size=512`)
    const png = new Uint8Array(await response.arrayBuffer())
    const pixels = await decodeGrayscalePixels(png)
    const uniqueValues = new Set(pixels)
    expect(Array.from(uniqueValues).sort((a, b) => a - b)).toEqual([0, 255])
  })

  it('不正なformatを指定すると400(VALIDATION_ERROR)になる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createRawUrlQrcode(sessionCookie)

    const response = await SELF.fetch(`https://example.com/api/v1/qrcodes/${qrcode.id}/image?format=webp`)
    expect(response.status).toBe(400)
    const body = await response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it.each(['500', '4096', 'abc'])('format=pngで不正なsize(%s)を指定すると400(VALIDATION_ERROR)になる', async (size) => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createRawUrlQrcode(sessionCookie)

    const response = await SELF.fetch(`https://example.com/api/v1/qrcodes/${qrcode.id}/image?format=png&size=${size}`)
    expect(response.status).toBe(400)
    const body = await response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('format=svgのときは、不正なsizeを指定しても無視されSVGが返る(sizeの検証はformat=pngのときだけ)', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createRawUrlQrcode(sessionCookie)

    const response = await SELF.fetch(`https://example.com/api/v1/qrcodes/${qrcode.id}/image?format=svg&size=999999`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/svg+xml')
  })

  it('削除済みのQRコードでは、format=pngでも404になる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createRawUrlQrcode(sessionCookie)

    const deleteResponse = await SELF.fetch(`https://example.com/api/v1/qrcodes/${qrcode.id}`, {
      method: 'DELETE',
      headers: { Cookie: sessionCookie },
    })
    expect(deleteResponse.status).toBe(204)

    const response = await SELF.fetch(`https://example.com/api/v1/qrcodes/${qrcode.id}/image?format=png`)
    expect(response.status).toBe(404)
  })

  it('対象のlinkが削除済みの場合、format=pngでも404になる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const link = await createLink(sessionCookie)

    const createResponse = await SELF.fetch('https://example.com/api/v1/qrcodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ targetType: 'link', targetId: link.id }),
    })
    expect(createResponse.status).toBe(201)
    const qrcode = qrcodeSchema.parse(await createResponse.json())

    // 対象linkをソフトデリートする
    const db = drizzle(env.DB)
    await db.update(links).set({ deletedAt: new Date() }).where(eq(links.id, link.id))

    const response = await SELF.fetch(`https://example.com/api/v1/qrcodes/${qrcode.id}/image?format=png`)
    expect(response.status).toBe(404)
  })
})

describe('qrcode PATCH・DELETE', () => {
  it('PATCH /api/v1/qrcodes/:idでstyleOptions(空オブジェクト)を指定すると200になる', async () => {
    // QRコードは白黒固定になったため、styleOptionsは実質空オブジェクトのみ許可される
    // (色のキーは下のテストの通り400になる)
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createRawUrlQrcode(sessionCookie)

    const patchResponse = await SELF.fetch(`https://example.com/api/v1/qrcodes/${qrcode.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ styleOptions: {} }),
    })
    expect(patchResponse.status).toBe(200)
    expect(await patchResponse.json()).toMatchObject({
      id: qrcode.id,
      styleOptions: {},
    })
  })

  it.each([{ foregroundColor: '#000000' }, { backgroundColor: '#ffffff' }, { color: '#000000' }])(
    'PATCH /api/v1/qrcodes/:idでstyleOptionsに色のキー等(%o)を指定すると400(VALIDATION_ERROR)になる',
    async (styleOptions) => {
      // QRコードは読み取りやすさを優先し白地に黒で出力する方針になったため、色のキーを
      // 送ると(foregroundColor/backgroundColorを含め)拒否されることを確認する
      const sessionCookie = await signUpAndGetSessionCookie()
      const qrcode = await createRawUrlQrcode(sessionCookie)

      const patchResponse = await SELF.fetch(`https://example.com/api/v1/qrcodes/${qrcode.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie,
        },
        body: JSON.stringify({ styleOptions }),
      })
      expect(patchResponse.status).toBe(400)
      const body = await patchResponse.json<{ error: { code: string } }>()
      expect(body.error.code).toBe('VALIDATION_ERROR')
    },
  )

  it('PATCH /api/v1/qrcodes/:idでnameを変更すると反映され、前後の空白は除去される', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createRawUrlQrcode(sessionCookie)

    const patchResponse = await SELF.fetch(`https://example.com/api/v1/qrcodes/${qrcode.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ name: '  お店の入口用  ' }),
    })
    expect(patchResponse.status).toBe(200)
    expect(await patchResponse.json()).toMatchObject({ id: qrcode.id, name: 'お店の入口用' })
  })

  it('PATCH /api/v1/qrcodes/:idでnameに空文字(トリム後に空になる文字列を含む)を指定するとnullになる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createRawUrlQrcode(sessionCookie)

    // 一度名前を付けてから、空文字で消せることを確認する
    await SELF.fetch(`https://example.com/api/v1/qrcodes/${qrcode.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ name: '仮の名前' }),
    })

    const patchResponse = await SELF.fetch(`https://example.com/api/v1/qrcodes/${qrcode.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ name: '   ' }),
    })
    expect(patchResponse.status).toBe(200)
    expect(await patchResponse.json()).toMatchObject({ name: null })
  })

  it('PATCH /api/v1/qrcodes/:idでnameに41文字を指定すると400(VALIDATION_ERROR)になる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createRawUrlQrcode(sessionCookie)

    const patchResponse = await SELF.fetch(`https://example.com/api/v1/qrcodes/${qrcode.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ name: 'あ'.repeat(41) }),
    })
    expect(patchResponse.status).toBe(400)
    const body = await patchResponse.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('GET /api/v1/qrcodes/:idは、既存データ相当(styleOptionsに色のキーを含むレコード)を取得してもエラーにならない', async () => {
    // styleOptionsの検証を厳しくする前に保存された既存レコードを想定し、D1へ直接
    // foregroundColor/backgroundColorを含むJSON文字列を書き込む(公開前修正v2 T6と同様の手法)
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createRawUrlQrcode(sessionCookie)

    const db = drizzle(env.DB)
    await db
      .update(qrcodes)
      .set({ styleOptions: JSON.stringify({ foregroundColor: '#123456', backgroundColor: '#abcdef' }) })
      .where(eq(qrcodes.id, qrcode.id))

    const getResponse = await SELF.fetch(`https://example.com/api/v1/qrcodes/${qrcode.id}`, {
      headers: { Cookie: sessionCookie },
    })
    expect(getResponse.status).toBe(200)
    expect(await getResponse.json()).toMatchObject({
      styleOptions: { foregroundColor: '#123456', backgroundColor: '#abcdef' },
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
