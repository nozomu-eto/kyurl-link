import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { links, posters, qrcodes } from '@/db/schema'
import { buildPosterExportHashSource, computePosterExportCacheKey } from '@/lib/poster-export-cache'
import { renderQrcodeSvg } from '@/lib/qrcode-image'
import { POSTER_SUBTITLE_MAX_LENGTH, POSTER_TITLE_MAX_LENGTH } from '@/shared/constants/input-limits'
import { POSTER_TEMPLATE_VERSION } from '@/shared/poster-template'
import { posterSchema } from '@/shared/schemas/poster'
import { qrcodeSchema } from '@/shared/schemas/qrcode'
import { markEmailVerified } from '../../test/mark-email-verified'
import { countPdfPages, readPdfMediaBox } from '../../test/pdf-inspect'
import { readPngDimensions } from '../../test/png-inspect'

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

// linkStatusのテスト用に、認証済みlinkを1件作成する
async function createLink(sessionCookie: string) {
  const response = await SELF.fetch('https://example.com/api/v1/links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({ originalUrl: 'https://example.com/poster-link-target' }),
  })
  expect(response.status).toBe(201)
  return response.json<{ id: string }>()
}

// linkStatusのテスト用に、targetType: 'link'のqrcodeを1件作成する
async function createLinkQrcode(sessionCookie: string, linkId: string) {
  const response = await SELF.fetch('https://example.com/api/v1/qrcodes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({ targetType: 'link', targetId: linkId }),
  })
  expect(response.status).toBe(201)
  return qrcodeSchema.parse(await response.json())
}

// 認証済みposterを1件作成する
async function createPoster(sessionCookie: string, qrCodeId: string, size: 'A6' | 'A5' = 'A6') {
  const response = await SELF.fetch('https://example.com/api/v1/posters', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify({ title: 'テスト掲示物', size, qrCodeId }),
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

  it('titleが空白のみの場合、前後の空白を除去した結果が空になるため400(VALIDATION_ERROR)になる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)

    const response = await SELF.fetch('https://example.com/api/v1/posters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ title: '   ', size: 'A6', qrCodeId: qrcode.id }),
    })
    expect(response.status).toBe(400)
    const body = await response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('subtitleに空文字(トリム後に空になる文字列を含む)を指定するとnullになる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)

    const response = await SELF.fetch('https://example.com/api/v1/posters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ title: 'テスト掲示物', subtitle: '   ', size: 'A6', qrCodeId: qrcode.id }),
    })
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ subtitle: null })
  })
})

describe('PATCH /api/v1/posters/:id のtitle/subtitle', () => {
  it('titleを省略した場合は更新されない', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)
    const poster = await createPoster(sessionCookie, qrcode.id)

    const patchResponse = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ subtitle: '更新後のサブタイトル' }),
    })
    expect(patchResponse.status).toBe(200)
    expect(await patchResponse.json()).toMatchObject({ title: poster.title, subtitle: '更新後のサブタイトル' })
  })

  it('subtitleを省略した場合は更新されない', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)
    const created = await SELF.fetch('https://example.com/api/v1/posters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ title: 'テスト掲示物', subtitle: '既存のサブタイトル', size: 'A6', qrCodeId: qrcode.id }),
    })
    const poster = posterSchema.parse(await created.json())

    const patchResponse = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ title: '更新後のタイトル' }),
    })
    expect(patchResponse.status).toBe(200)
    expect(await patchResponse.json()).toMatchObject({ title: '更新後のタイトル', subtitle: '既存のサブタイトル' })
  })

  it('subtitleに空文字を指定するとnullになる(消せる)', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)
    const created = await SELF.fetch('https://example.com/api/v1/posters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ title: 'テスト掲示物', subtitle: '既存のサブタイトル', size: 'A6', qrCodeId: qrcode.id }),
    })
    const poster = posterSchema.parse(await created.json())

    const patchResponse = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ subtitle: '   ' }),
    })
    expect(patchResponse.status).toBe(200)
    expect(await patchResponse.json()).toMatchObject({ subtitle: null })
  })
})

describe('PATCH /api/v1/posters/:id のsize/qrCodeId', () => {
  it('sizeを変更できる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)
    const poster = await createPoster(sessionCookie, qrcode.id, 'A6')

    const response = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ size: 'A5' }),
    })

    expect(response.status).toBe(200)
    expect(posterSchema.parse(await response.json()).size).toBe('A5')
  })

  it('使うQRコードを、自分の別のQRコードに変更できる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)
    const otherQrcode = await createQrcode(sessionCookie)
    const poster = await createPoster(sessionCookie, qrcode.id)

    const response = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ qrCodeId: otherQrcode.id }),
    })

    expect(response.status).toBe(200)
    expect(posterSchema.parse(await response.json()).qrCodeId).toBe(otherQrcode.id)
  })

  it('他のユーザーのQRコード・存在しないQRコードには変更できない(400 INVALID_TARGET)', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const otherUserCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)
    const othersQrcode = await createQrcode(otherUserCookie)
    const poster = await createPoster(sessionCookie, qrcode.id)

    for (const qrCodeId of [othersQrcode.id, 'not-existing-qrcode-id']) {
      const response = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
        body: JSON.stringify({ qrCodeId }),
      })
      expect(response.status).toBe(400)
      expect((await response.json<{ error: { code: string } }>()).error.code).toBe('INVALID_TARGET')
    }
  })

  it('不正なsizeは400(VALIDATION_ERROR)になる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)
    const poster = await createPoster(sessionCookie, qrcode.id)

    const response = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ size: 'A4' }),
    })

    expect(response.status).toBe(400)
  })
})

describe('上限を超える既存データ', () => {
  it('上限変更前に保存された長いtitle/subtitleを持つレコードも、GETでエラー無く読み出せる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)
    const poster = await createPoster(sessionCookie, qrcode.id)

    const longTitle = 'あ'.repeat(POSTER_TITLE_MAX_LENGTH + 40)
    const longSubtitle = 'い'.repeat(POSTER_SUBTITLE_MAX_LENGTH + 80)
    const db = drizzle(env.DB)
    await db.update(posters).set({ title: longTitle, subtitle: longSubtitle }).where(eq(posters.id, poster.id))

    const getResponse = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}`, {
      headers: { Cookie: sessionCookie },
    })
    expect(getResponse.status).toBe(200)
    expect(await getResponse.json()).toMatchObject({ title: longTitle, subtitle: longSubtitle })
  })
})

describe('linkStatus', () => {
  it('QRコードがtargetType: rawUrlの場合はnoneになる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)
    const poster = await createPoster(sessionCookie, qrcode.id)
    expect(poster.linkStatus).toBe('none')

    const getResponse = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}`, { headers: { Cookie: sessionCookie } })
    expect(await getResponse.json()).toMatchObject({ linkStatus: 'none' })
  })

  it('対象linkが有効な場合はactiveになる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const link = await createLink(sessionCookie)
    const qrcode = await createLinkQrcode(sessionCookie, link.id)
    const poster = await createPoster(sessionCookie, qrcode.id)
    expect(poster.linkStatus).toBe('active')
  })

  it('対象linkのexpiresAtが過去の場合はexpiredになる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const link = await createLink(sessionCookie)
    const qrcode = await createLinkQrcode(sessionCookie, link.id)
    const poster = await createPoster(sessionCookie, qrcode.id)

    const db = drizzle(env.DB)
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    await db.update(links).set({ expiresAt: pastDate }).where(eq(links.id, link.id))

    const getResponse = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}`, { headers: { Cookie: sessionCookie } })
    expect(await getResponse.json()).toMatchObject({ linkStatus: 'expired' })
  })

  it('対象linkのstatusがsuspendedの場合はsuspendedになる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const link = await createLink(sessionCookie)
    const qrcode = await createLinkQrcode(sessionCookie, link.id)
    const poster = await createPoster(sessionCookie, qrcode.id)

    await SELF.fetch(`https://example.com/api/v1/links/${link.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ status: 'suspended' }),
    })

    const getResponse = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}`, { headers: { Cookie: sessionCookie } })
    expect(await getResponse.json()).toMatchObject({ linkStatus: 'suspended' })
  })

  it('対象linkがソフトデリート済みの場合はdeletedになる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const link = await createLink(sessionCookie)
    const qrcode = await createLinkQrcode(sessionCookie, link.id)
    const poster = await createPoster(sessionCookie, qrcode.id)

    const deleteResponse = await SELF.fetch(`https://example.com/api/v1/links/${link.id}`, {
      method: 'DELETE',
      headers: { Cookie: sessionCookie },
    })
    expect(deleteResponse.status).toBe(204)

    const getResponse = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}`, { headers: { Cookie: sessionCookie } })
    expect(await getResponse.json()).toMatchObject({ linkStatus: 'deleted' })
  })

  it('QRコードがソフトデリート済みの場合はdeletedになる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)
    const poster = await createPoster(sessionCookie, qrcode.id)

    // qrcodeを直接ソフトデリートする(通常のDELETE /api/v1/qrcodes/:idはposters.qrCodeIdの
    // 外部キー制約(onDelete: 'restrict')の対象外。物理削除ではなくdeletedAtの更新のため)
    const db = drizzle(env.DB)
    await db.update(qrcodes).set({ deletedAt: new Date() }).where(eq(qrcodes.id, qrcode.id))

    const getResponse = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}`, { headers: { Cookie: sessionCookie } })
    expect(await getResponse.json()).toMatchObject({ linkStatus: 'deleted' })
  })

  it('一覧(GET /api/v1/posters)でもlinkStatusが計算される', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)
    await createPoster(sessionCookie, qrcode.id)

    const listResponse = await SELF.fetch('https://example.com/api/v1/posters', { headers: { Cookie: sessionCookie } })
    const body = await listResponse.json<{ items: { linkStatus: string }[] }>()
    expect(body.items.length).toBeGreaterThan(0)
    for (const item of body.items) {
      expect(item.linkStatus).toBe('none')
    }
  })
})

describe('PATCH /api/v1/posters/:id のstyleOptions', () => {
  it('styleOptions(空オブジェクト)を指定すると200になる', async () => {
    // QRコードが白黒固定になったことに伴い掲示物側もstyleOptionsは実質空オブジェクトのみ許可される
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)
    const poster = await createPoster(sessionCookie, qrcode.id)

    const patchResponse = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ styleOptions: {} }),
    })
    expect(patchResponse.status).toBe(200)
    expect(await patchResponse.json()).toMatchObject({ styleOptions: {} })
  })

  it.each([{ foregroundColor: '#000000' }, { backgroundColor: '#ffffff' }, { color: '#000000' }])(
    'styleOptionsに色のキー等(%o)を指定すると400(VALIDATION_ERROR)になる',
    async (styleOptions) => {
      // 色の変更機能は無いため、foregroundColor/backgroundColorを含め、色のキーを送ると
      // 拒否されることを確認する
      const sessionCookie = await signUpAndGetSessionCookie()
      const qrcode = await createQrcode(sessionCookie)
      const poster = await createPoster(sessionCookie, qrcode.id)

      const patchResponse = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
        body: JSON.stringify({ styleOptions }),
      })
      expect(patchResponse.status).toBe(400)
      const body = await patchResponse.json<{ error: { code: string } }>()
      expect(body.error.code).toBe('VALIDATION_ERROR')
    },
  )

  it('GET /api/v1/posters/:idは、既存データ相当(styleOptionsに色のキーを含むレコード)を取得してもエラーにならない', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)
    const poster = await createPoster(sessionCookie, qrcode.id)

    const db = drizzle(env.DB)
    await db
      .update(posters)
      .set({ styleOptions: JSON.stringify({ foregroundColor: '#123456', backgroundColor: '#abcdef' }) })
      .where(eq(posters.id, poster.id))

    const getResponse = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}`, {
      headers: { Cookie: sessionCookie },
    })
    expect(getResponse.status).toBe(200)
    expect(await getResponse.json()).toMatchObject({
      styleOptions: { foregroundColor: '#123456', backgroundColor: '#abcdef' },
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

  // QRコードに埋め込む内容は、qrcodes.tsのGET /:id/imageと共通のresolveQrcodeContentで決める。
  // exportハンドラが計算するキャッシュキーと同じキーのR2オブジェクトを先に置いておき、それが返れば
  // (Browser Renderingを起動せずに)QRコードの内容が期待どおりに決まっていることを確認できる
  async function expectExportUsesQrContent(sessionCookie: string, poster: { id: string; title: string; subtitle: string | null; size: string; styleOptions: unknown }, qrContent: string) {
    const cacheKey = await computePosterExportCacheKey({
      posterId: poster.id,
      format: 'pdf',
      paper: 'a4',
      templateVersion: POSTER_TEMPLATE_VERSION,
      hashSource: buildPosterExportHashSource({
        title: poster.title,
        subtitle: poster.subtitle,
        size: poster.size,
        styleOptions: poster.styleOptions,
        qrCodeSvg: renderQrcodeSvg(qrContent),
        format: 'pdf',
        paper: 'a4',
      }),
    })
    const dummyPdf = new Uint8Array([0x25, 0x50, 0x44, 0x46])
    await env.POSTER_CACHE.put(cacheKey, dummyPdf)

    const response = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}/export`, { headers: { Cookie: sessionCookie } })
    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(dummyPdf)
  }

  it('短縮URL経由のQRコードは、`{origin}/{shortCode}`をQRコードの内容にする', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const link = await createLink(sessionCookie)
    const qrcode = await createLinkQrcode(sessionCookie, link.id)
    const poster = await createPoster(sessionCookie, qrcode.id)
    const [{ shortCode }] = await drizzle(env.DB).select({ shortCode: links.shortCode }).from(links).where(eq(links.id, link.id))

    await expectExportUsesQrContent(sessionCookie, poster, `https://example.com/${shortCode}`)
  })

  it('URLを直接指定したQRコードは、そのURLをそのままQRコードの内容にする', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)
    const poster = await createPoster(sessionCookie, qrcode.id)

    await expectExportUsesQrContent(sessionCookie, poster, 'https://example.com/poster-target')
  })

  it('QRコードの短縮URLが削除済みの場合は404(対象のlinkが見つかりません)になる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const link = await createLink(sessionCookie)
    const qrcode = await createLinkQrcode(sessionCookie, link.id)
    const poster = await createPoster(sessionCookie, qrcode.id)
    await drizzle(env.DB).update(links).set({ deletedAt: new Date() }).where(eq(links.id, link.id))

    const response = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}/export`, { headers: { Cookie: sessionCookie } })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: { code: 'NOT_FOUND', message: '対象のlinkが見つかりません' } })
  })

  it('paperに不正な値を指定すると400(VALIDATION_ERROR)になる(Browser Renderingを起動する前に検証するため、CI環境でも実行できる)', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)
    const poster = await createPoster(sessionCookie, qrcode.id)

    const response = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}/export?format=pdf&paper=b5`, {
      headers: { Cookie: sessionCookie },
    })
    expect(response.status).toBe(400)
    const body = await response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  // 1mm = 72/25.4pt。Chromeは単位変換の丸めで値がわずかにずれるため、±2pt(約0.7mm)の
  // 誤差を許容する
  const MM_TO_PT = 72 / 25.4
  const MEDIA_BOX_TOLERANCE_PT = 2

  function expectMediaBoxSizeMm(mediaBox: [number, number, number, number], widthMm: number, heightMm: number) {
    const [x0, y0, x1, y1] = mediaBox
    expect(x1 - x0).toBeGreaterThanOrEqual(widthMm * MM_TO_PT - MEDIA_BOX_TOLERANCE_PT)
    expect(x1 - x0).toBeLessThanOrEqual(widthMm * MM_TO_PT + MEDIA_BOX_TOLERANCE_PT)
    expect(y1 - y0).toBeGreaterThanOrEqual(heightMm * MM_TO_PT - MEDIA_BOX_TOLERANCE_PT)
    expect(y1 - y0).toBeLessThanOrEqual(heightMm * MM_TO_PT + MEDIA_BOX_TOLERANCE_PT)
  }

  // 以降は実際にBrowser Renderingを起動してPDF/PNGを検証する(既存のR2キャッシュテストと同じ理由でCIではスキップする)
  it.skipIf(process.env.CI_SKIP_BROWSER_TEST)('paper=a4(A6)は1ページのA4縦(210×297mm)になる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)
    const poster = await createPoster(sessionCookie, qrcode.id, 'A6')

    const response = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}/export?format=pdf&paper=a4`, {
      headers: { Cookie: sessionCookie },
    })
    expect(response.status).toBe(200)
    const pdf = new Uint8Array(await response.arrayBuffer())
    expect(countPdfPages(pdf)).toBe(1)
    expectMediaBoxSizeMm(readPdfMediaBox(pdf), 210, 297)
  }, 30000)

  it.skipIf(process.env.CI_SKIP_BROWSER_TEST)('paper=a4(A5)は1ページのA4横向き(297×210mm)になる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)
    const poster = await createPoster(sessionCookie, qrcode.id, 'A5')

    const response = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}/export?format=pdf&paper=a4`, {
      headers: { Cookie: sessionCookie },
    })
    expect(response.status).toBe(200)
    const pdf = new Uint8Array(await response.arrayBuffer())
    expect(countPdfPages(pdf)).toBe(1)
    expectMediaBoxSizeMm(readPdfMediaBox(pdf), 297, 210)
  }, 30000)

  it.skipIf(process.env.CI_SKIP_BROWSER_TEST)('paper=fit(A6)は1ページのA6(105×148mm)になる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)
    const poster = await createPoster(sessionCookie, qrcode.id, 'A6')

    const response = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}/export?format=pdf&paper=fit`, {
      headers: { Cookie: sessionCookie },
    })
    expect(response.status).toBe(200)
    const pdf = new Uint8Array(await response.arrayBuffer())
    expect(countPdfPages(pdf)).toBe(1)
    expectMediaBoxSizeMm(readPdfMediaBox(pdf), 105, 148)
  }, 30000)

  it.skipIf(process.env.CI_SKIP_BROWSER_TEST)('paper=fit(A5)は1ページのA5(148×210mm)になる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)
    const poster = await createPoster(sessionCookie, qrcode.id, 'A5')

    const response = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}/export?format=pdf&paper=fit`, {
      headers: { Cookie: sessionCookie },
    })
    expect(response.status).toBe(200)
    const pdf = new Uint8Array(await response.arrayBuffer())
    expect(countPdfPages(pdf)).toBe(1)
    expectMediaBoxSizeMm(readPdfMediaBox(pdf), 148, 210)
  }, 30000)

  it.skipIf(process.env.CI_SKIP_BROWSER_TEST)('format=pngの場合、paperが不正な値でも無視され200になる', async () => {
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)
    const poster = await createPoster(sessionCookie, qrcode.id)

    const response = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}/export?format=png&paper=not-a-real-value`, {
      headers: { Cookie: sessionCookie },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
  }, 30000)

  it.each([
    ['A6', 105, 148],
    ['A5', 148, 210],
  ] as const)('PNGの縦横比が掲示物サイズ(%s)の縦横比と一致する', async (size, widthMm, heightMm) => {
    if (process.env.CI_SKIP_BROWSER_TEST) {
      return
    }
    const sessionCookie = await signUpAndGetSessionCookie()
    const qrcode = await createQrcode(sessionCookie)
    const poster = await createPoster(sessionCookie, qrcode.id, size)

    const response = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}/export?format=png`, {
      headers: { Cookie: sessionCookie },
    })
    expect(response.status).toBe(200)
    const png = new Uint8Array(await response.arrayBuffer())
    const { width, height } = readPngDimensions(png)

    // 撮影対象(.poster要素)自体の縦横比が掲示物サイズの縦横比と一致することを確認する
    // (ぴったり同じ値にはならない可能性があるため、比率の差を許容する)
    const expectedRatio = widthMm / heightMm
    const actualRatio = width / height
    expect(Math.abs(actualRatio - expectedRatio)).toBeLessThan(0.02)
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
