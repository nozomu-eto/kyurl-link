import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { posters } from '@/db/schema'
import { buildPosterExportHashSource, computePosterBatchExportCacheKey } from '@/lib/poster-export-cache'
import { renderQrcodeSvg } from '@/lib/qrcode-image'
import { POSTER_TEMPLATE_VERSION } from '@/shared/poster-template'
import { posterSchema } from '@/shared/schemas/poster'
import { qrcodeSchema } from '@/shared/schemas/qrcode'
import { markEmailVerified } from '../../test/mark-email-verified'

// POST /api/v1/posters/batch-export(まとめて印刷)のテスト。
// Browser Renderingは起動しない: Workers Buildsの環境ではChromeが起動できず、テストがタイムアウトして
// ビルドが失敗するため(POR-130)。入力検証・所有者チェック・上限など、Browser Renderingより前に終わる処理と、
// キャッシュに当たる場合(R2に事前投入したPDFが返る)だけを確かめる

async function signUp() {
  const response = await SELF.fetch('https://example.com/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: env.BETTER_AUTH_URL },
    body: JSON.stringify({ email: `batch-${crypto.randomUUID()}@example.com`, password: 'password1234', name: 'Test User', agreeToTerms: true }),
  })
  const setCookie = response.headers.get('set-cookie')
  if (!setCookie) {
    throw new Error('サインアップのレスポンスにset-cookieが含まれていません')
  }
  const body = await response.json<{ user: { id: string } }>()
  await markEmailVerified(body.user.id)
  return { sessionCookie: setCookie.split(';')[0], userId: body.user.id }
}

async function createQrcode(sessionCookie: string, targetUrl = 'https://example.com/batch-target') {
  const response = await SELF.fetch('https://example.com/api/v1/qrcodes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({ targetType: 'rawUrl', targetUrl }),
  })
  expect(response.status).toBe(201)
  return qrcodeSchema.parse(await response.json())
}

async function createPoster(sessionCookie: string, qrCodeId: string, size: 'A6' | 'A5' = 'A6', title = 'まとめて印刷') {
  const response = await SELF.fetch('https://example.com/api/v1/posters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({ title, size, qrCodeId }),
  })
  expect(response.status).toBe(201)
  return posterSchema.parse(await response.json())
}

function batchExport(sessionCookie: string | null, body: unknown) {
  return SELF.fetch('https://example.com/api/v1/posters/batch-export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(sessionCookie ? { Cookie: sessionCookie } : {}) },
    body: JSON.stringify(body),
  })
}

async function errorCode(response: Response) {
  return (await response.json<{ error: { code: string } }>()).error.code
}

describe('POST /api/v1/posters/batch-export の入力検証', () => {
  it('未認証は401', async () => {
    const response = await batchExport(null, { size: 'A6', items: [{ posterId: 'x', count: 1 }] })
    expect(response.status).toBe(401)
  })

  it.each([
    ['sizeがA6・A5以外', { size: 'A4', items: [{ posterId: 'x', count: 1 }] }],
    ['itemsが空', { size: 'A6', items: [] }],
    ['countが0', { size: 'A6', items: [{ posterId: 'x', count: 0 }] }],
    ['countが負', { size: 'A6', items: [{ posterId: 'x', count: -1 }] }],
    ['countが整数でない', { size: 'A6', items: [{ posterId: 'x', count: 1.5 }] }],
    ['posterIdが空', { size: 'A6', items: [{ posterId: '', count: 1 }] }],
    ['同じposterIdが重複', { size: 'A6', items: [{ posterId: 'x', count: 1 }, { posterId: 'x', count: 2 }] }],
    ['itemsが無い', { size: 'A6' }],
  ])('%sは400(VALIDATION_ERROR)', async (_name, body) => {
    const { sessionCookie } = await signUp()
    const response = await batchExport(sessionCookie, body)
    expect(response.status).toBe(400)
    expect(await errorCode(response)).toBe('VALIDATION_ERROR')
  })
})

describe('POST /api/v1/posters/batch-export の上限(A4用紙10枚)', () => {
  it('A6は40面を超えると400(LIMIT_EXCEEDED)になり、40面ちょうどは上限チェックを通る', async () => {
    const { sessionCookie } = await signUp()
    const qrcode = await createQrcode(sessionCookie)
    const poster = await createPoster(sessionCookie, qrcode.id, 'A6')

    const overResponse = await batchExport(sessionCookie, { size: 'A6', items: [{ posterId: poster.id, count: 41 }] })
    expect(overResponse.status).toBe(400)
    expect(await errorCode(overResponse)).toBe('LIMIT_EXCEEDED')

    // 40面ちょうどは上限エラーにならない(ここではBrowser Renderingを起動しないよう、存在しない掲示物を指定して404で止める)
    const okResponse = await batchExport(sessionCookie, { size: 'A6', items: [{ posterId: 'not-existing', count: 40 }] })
    expect(okResponse.status).toBe(404)
  })

  it('A5は20面を超えると400(LIMIT_EXCEEDED)になる。複数の掲示物の枚数の合計で数える', async () => {
    const { sessionCookie } = await signUp()
    const qrcode = await createQrcode(sessionCookie)
    const first = await createPoster(sessionCookie, qrcode.id, 'A5', '一つ目')
    const second = await createPoster(sessionCookie, qrcode.id, 'A5', '二つ目')

    const response = await batchExport(sessionCookie, {
      size: 'A5',
      items: [
        { posterId: first.id, count: 10 },
        { posterId: second.id, count: 11 },
      ],
    })
    expect(response.status).toBe(400)
    expect(await errorCode(response)).toBe('LIMIT_EXCEEDED')
  })

  it('掲示物の件数そのものが上限の面数を超えるときも400(LIMIT_EXCEEDED)になる(DBを引く前に弾く)', async () => {
    const { sessionCookie } = await signUp()
    const items = Array.from({ length: 21 }, (_, index) => ({ posterId: `poster-${index}`, count: 1 }))
    const response = await batchExport(sessionCookie, { size: 'A5', items })
    expect(response.status).toBe(400)
    expect(await errorCode(response)).toBe('LIMIT_EXCEEDED')
  })
})

describe('POST /api/v1/posters/batch-export の所有者・削除・サイズのチェック', () => {
  it('存在しない掲示物が含まれると404', async () => {
    const { sessionCookie } = await signUp()
    const qrcode = await createQrcode(sessionCookie)
    const poster = await createPoster(sessionCookie, qrcode.id)

    const response = await batchExport(sessionCookie, {
      size: 'A6',
      items: [
        { posterId: poster.id, count: 1 },
        { posterId: 'not-existing', count: 1 },
      ],
    })
    expect(response.status).toBe(404)
    expect(await errorCode(response)).toBe('NOT_FOUND')
  })

  it('他のユーザーの掲示物が含まれると404(存在することを明かさない)', async () => {
    const owner = await signUp()
    const other = await signUp()
    const qrcode = await createQrcode(owner.sessionCookie)
    const poster = await createPoster(owner.sessionCookie, qrcode.id)

    const response = await batchExport(other.sessionCookie, { size: 'A6', items: [{ posterId: poster.id, count: 1 }] })
    expect(response.status).toBe(404)
  })

  it('削除済みの掲示物が含まれると404', async () => {
    const { sessionCookie } = await signUp()
    const qrcode = await createQrcode(sessionCookie)
    const poster = await createPoster(sessionCookie, qrcode.id)
    await drizzle(env.DB).update(posters).set({ deletedAt: new Date() }).where(eq(posters.id, poster.id))

    const response = await batchExport(sessionCookie, { size: 'A6', items: [{ posterId: poster.id, count: 1 }] })
    expect(response.status).toBe(404)
  })

  it('指定サイズと違う掲示物が含まれると400(VALIDATION_ERROR)', async () => {
    const { sessionCookie } = await signUp()
    const qrcode = await createQrcode(sessionCookie)
    const a6 = await createPoster(sessionCookie, qrcode.id, 'A6', 'A6の掲示物')
    const a5 = await createPoster(sessionCookie, qrcode.id, 'A5', 'A5の掲示物')

    const response = await batchExport(sessionCookie, {
      size: 'A6',
      items: [
        { posterId: a6.id, count: 1 },
        { posterId: a5.id, count: 1 },
      ],
    })
    expect(response.status).toBe(400)
    expect(await errorCode(response)).toBe('VALIDATION_ERROR')
  })
})

describe('POST /api/v1/posters/batch-export のキャッシュ', () => {
  // 本体と同じ関数(buildPosterExportHashSource・computePosterBatchExportCacheKey)でキーを求め、R2にダミーのPDFを
  // 事前投入する。キャッシュに当たれば、Browser Renderingを起動せずにそのPDFが返る
  async function cacheKeyFor(userId: string, entries: { poster: ReturnType<typeof posterSchema.parse>; targetUrl: string; count: number }[]) {
    return computePosterBatchExportCacheKey({
      userId,
      size: 'A6',
      templateVersion: POSTER_TEMPLATE_VERSION,
      items: entries.map(({ poster, targetUrl, count }) => ({
        hashSource: buildPosterExportHashSource({
          title: poster.title,
          subtitle: poster.subtitle,
          size: poster.size,
          styleOptions: poster.styleOptions,
          qrCodeSvg: renderQrcodeSvg(targetUrl),
          format: 'pdf',
          paper: 'a4',
        }),
        count,
      })),
    })
  }

  it('同じ組み合わせ(順番・枚数も同じ)でキャッシュに当たると、キャッシュしたPDFが返る', async () => {
    const { sessionCookie, userId } = await signUp()
    const urlA = 'https://example.com/batch-a'
    const urlB = 'https://example.com/batch-b'
    const posterA = await createPoster(sessionCookie, (await createQrcode(sessionCookie, urlA)).id, 'A6', '掲示物A')
    const posterB = await createPoster(sessionCookie, (await createQrcode(sessionCookie, urlB)).id, 'A6', '掲示物B')

    const key = await cacheKeyFor(userId, [
      { poster: posterA, targetUrl: urlA, count: 2 },
      { poster: posterB, targetUrl: urlB, count: 1 },
    ])
    const dummyPdf = new Uint8Array([0x25, 0x50, 0x44, 0x46])
    await env.POSTER_CACHE.put(key, dummyPdf)

    const response = await batchExport(sessionCookie, {
      size: 'A6',
      items: [
        { posterId: posterA.id, count: 2 },
        { posterId: posterB.id, count: 1 },
      ],
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(dummyPdf)
  })

  it('キーはユーザー単位で、他のユーザーが同じ内容でも、そのユーザーのキャッシュは使われない(キーが別になる)', async () => {
    const { userId } = await signUp()
    const poster = posterSchema.parse({
      id: 'p',
      title: 'T',
      subtitle: null,
      layoutTemplate: 'default',
      styleOptions: null,
      size: 'A6',
      qrCodeId: 'q',
      createdAt: '2026-01-01T00:00:00.000Z',
      qrCodeName: null,
      qrCodeCreatedAt: '2026-01-01T00:00:00.000Z',
      targetShortCode: null,
      targetLinkId: null,
      linkExpiresAt: null,
      linkStatus: 'none',
    })
    const keyA = await cacheKeyFor(userId, [{ poster, targetUrl: 'https://example.com/x', count: 1 }])
    const keyB = await cacheKeyFor('other-user', [{ poster, targetUrl: 'https://example.com/x', count: 1 }])
    expect(keyA).not.toBe(keyB)
    expect(keyA.startsWith(`batch/${userId}/v${POSTER_TEMPLATE_VERSION}/A6/`)).toBe(true)
  })
})
