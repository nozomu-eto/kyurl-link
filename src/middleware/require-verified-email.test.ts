import { drizzle } from 'drizzle-orm/d1'
import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { links } from '@/db/schema'
import { markEmailVerified } from '../../test/mark-email-verified'

// requireVerifiedEmailミドルウェアのテストでは、既存のsignUpヘルパー(他のテストファイル)と
// 異なり、あえてemailVerifiedを更新せず未確認のままのユーザーを作る
async function signUpUnverified() {
  const response = await SELF.fetch('https://example.com/api/auth/sign-up/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: env.BETTER_AUTH_URL,
    },
    body: JSON.stringify({
      email: `unverified-${crypto.randomUUID()}@example.com`,
      password: 'password1234',
      name: 'Unverified User',
      agreeToTerms: true,
    }),
  })
  const setCookie = response.headers.get('set-cookie')
  if (!setCookie) {
    throw new Error('サインアップのレスポンスにset-cookieが含まれていません')
  }
  const body = await response.json<{ user: { id: string } }>()
  return { sessionCookie: setCookie.split(';')[0], userId: body.user.id }
}

describe('requireVerifiedEmailミドルウェア', () => {
  it('未確認ユーザーがPOST /api/v1/linksを呼ぶと403(EMAIL_NOT_VERIFIED)になる', async () => {
    const { sessionCookie } = await signUpUnverified()

    const response = await SELF.fetch('https://example.com/api/v1/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ originalUrl: 'https://example.com/unverified-test' }),
    })
    expect(response.status).toBe(403)
    const body = await response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('EMAIL_NOT_VERIFIED')
  })

  it('未確認ユーザーがPOST /api/v1/qrcodesを呼ぶと403(EMAIL_NOT_VERIFIED)になる', async () => {
    const { sessionCookie } = await signUpUnverified()

    const response = await SELF.fetch('https://example.com/api/v1/qrcodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ targetType: 'rawUrl', targetUrl: 'https://example.com/unverified-test' }),
    })
    expect(response.status).toBe(403)
    const body = await response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('EMAIL_NOT_VERIFIED')
  })

  it('未確認ユーザーがPOST /api/v1/postersを呼ぶと403(EMAIL_NOT_VERIFIED)になる', async () => {
    const { sessionCookie } = await signUpUnverified()

    const response = await SELF.fetch('https://example.com/api/v1/posters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ title: 'テスト', size: 'A6', qrCodeId: 'dummy-id' }),
    })
    expect(response.status).toBe(403)
    const body = await response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('EMAIL_NOT_VERIFIED')
  })

  it('未確認ユーザーでも一覧取得(GET /api/v1/links)・削除(DELETE)は引き続き利用できる', async () => {
    const { sessionCookie, userId } = await signUpUnverified()

    // 一覧取得は未確認でも利用できることを確認する
    const listResponse = await SELF.fetch('https://example.com/api/v1/links', {
      headers: { Cookie: sessionCookie },
    })
    expect(listResponse.status).toBe(200)

    // DELETEも未確認で利用できることを確認する。POST /linksはrequireVerifiedEmailの対象で
    // 未確認のままでは作れないため、対象のlinkはDBへ直接insertして用意する
    // (requireVerifiedEmail自体の検証が目的で、link作成の正常系は他のテストで確認済みのため)
    const db = drizzle(env.DB)
    const linkId = crypto.randomUUID()
    await db.insert(links).values({
      id: linkId,
      userId,
      originalUrl: 'https://example.com/unverified-delete-test',
      shortCode: `ut${crypto.randomUUID().slice(0, 5)}`,
      status: 'active',
      expiresAt: null,
      securityStatus: 'unscanned',
      lastScannedAt: new Date(),
    })

    const deleteResponse = await SELF.fetch(`https://example.com/api/v1/links/${linkId}`, {
      method: 'DELETE',
      headers: { Cookie: sessionCookie },
    })
    expect(deleteResponse.status).toBe(204)
  })

  it('確認済みユーザーは従来どおりPOST /api/v1/linksを利用できる', async () => {
    const { sessionCookie, userId } = await signUpUnverified()
    await markEmailVerified(userId)

    const response = await SELF.fetch('https://example.com/api/v1/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ originalUrl: 'https://example.com/verified-test' }),
    })
    expect(response.status).toBe(201)
  })
})
