import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { markEmailVerified } from '../../test/mark-email-verified'

const TEST_PASSWORD = 'password1234'

async function signUp() {
  const response = await SELF.fetch('https://example.com/api/auth/sign-up/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: env.BETTER_AUTH_URL,
    },
    body: JSON.stringify({
      email: `deletion-pending-${crypto.randomUUID()}@example.com`,
      password: TEST_PASSWORD,
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

async function requestAccountDeletion(sessionCookie: string) {
  const response = await SELF.fetch('https://example.com/api/v1/account-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({ password: TEST_PASSWORD }),
  })
  expect(response.status).toBe(201)
}

async function cancelAccountDeletion(sessionCookie: string) {
  const response = await SELF.fetch('https://example.com/api/v1/account-requests/cancel', {
    method: 'POST',
    headers: { Cookie: sessionCookie },
  })
  expect(response.status).toBe(200)
}

describe('blockAccountDeletionPendingミドルウェア', () => {
  it('削除申請中(status: pending)は、POST /api/v1/links・qrcodes・postersが403(ACCOUNT_DELETION_PENDING)になる', async () => {
    const sessionCookie = await signUp()
    await requestAccountDeletion(sessionCookie)

    const linkResponse = await SELF.fetch('https://example.com/api/v1/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ originalUrl: 'https://example.com/deletion-pending-test' }),
    })
    expect(linkResponse.status).toBe(403)
    expect((await linkResponse.json<{ error: { code: string } }>()).error.code).toBe('ACCOUNT_DELETION_PENDING')

    const qrcodeResponse = await SELF.fetch('https://example.com/api/v1/qrcodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ targetType: 'rawUrl', targetUrl: 'https://example.com/deletion-pending-test' }),
    })
    expect(qrcodeResponse.status).toBe(403)
    expect((await qrcodeResponse.json<{ error: { code: string } }>()).error.code).toBe('ACCOUNT_DELETION_PENDING')

    const posterResponse = await SELF.fetch('https://example.com/api/v1/posters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ title: 'テスト', size: 'A6', qrCodeId: 'dummy-id' }),
    })
    expect(posterResponse.status).toBe(403)
    expect((await posterResponse.json<{ error: { code: string } }>()).error.code).toBe('ACCOUNT_DELETION_PENDING')
  })

  it('取り消し後は、通常どおり作成できる', async () => {
    const sessionCookie = await signUp()
    await requestAccountDeletion(sessionCookie)
    await cancelAccountDeletion(sessionCookie)

    const linkResponse = await SELF.fetch('https://example.com/api/v1/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ originalUrl: 'https://example.com/deletion-cancelled-test' }),
    })
    expect(linkResponse.status).toBe(201)
  })
})
