import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { linkSchema } from '@/shared/schemas/link'
import { posterSchema } from '@/shared/schemas/poster'
import { qrcodeSchema } from '@/shared/schemas/qrcode'

const TEST_PASSWORD = 'password1234'

// サインアップし、セッションCookie・userId・emailを取得する(emailは再サインインに使う)
async function signUp() {
  const email = `test-${crypto.randomUUID()}@example.com`
  const response = await SELF.fetch('https://example.com/api/auth/sign-up/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Better AuthはCSRF対策としてOriginを検証するため、BETTER_AUTH_URLと同じ値を付与する
      Origin: env.BETTER_AUTH_URL,
    },
    body: JSON.stringify({ email, password: TEST_PASSWORD, name: 'Test User' }),
  })

  const setCookie = response.headers.get('set-cookie')
  if (!setCookie) {
    throw new Error('サインアップのレスポンスにset-cookieが含まれていません')
  }
  const sessionCookie = setCookie.split(';')[0]

  const body = await response.json<{ user: { id: string } }>()
  return { email, sessionCookie, userId: body.user.id }
}

// 再サインインし、新しいセッションCookieを取得する。
// databaseHooks(session.create.after)はここで新規セッションが作成されるタイミングで発火する
async function signIn(email: string) {
  const response = await SELF.fetch('https://example.com/api/auth/sign-in/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: env.BETTER_AUTH_URL,
    },
    body: JSON.stringify({ email, password: TEST_PASSWORD }),
  })
  expect(response.status).toBe(200)

  const setCookie = response.headers.get('set-cookie')
  if (!setCookie) {
    throw new Error('サインインのレスポンスにset-cookieが含まれていません')
  }
  return setCookie.split(';')[0]
}

// 認証済みlinkを1件作成する
async function createLink(sessionCookie: string, originalUrl: string) {
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

// 認証済みqrcodeを1件作成する(targetType='rawUrl')
async function createQrcode(sessionCookie: string) {
  const response = await SELF.fetch('https://example.com/api/v1/qrcodes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify({ targetType: 'rawUrl', targetUrl: 'https://example.com/cancellation-qr' }),
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

// 退会申請を行う
async function requestAccountDeletion(sessionCookie: string) {
  const response = await SELF.fetch('https://example.com/api/v1/account-requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify({ password: TEST_PASSWORD }),
  })
  expect(response.status).toBe(201)
}

describe('猶予期間中の再ログインによる自動取り消し(databaseHooks経由)', () => {
  it('退会申請後に再サインインすると、申請で削除されたリソースは復元され、個別削除済みのリンクは復元されない', async () => {
    const { email, sessionCookie } = await signUp()

    // 申請より前に、利用者自身が個別に削除しておくlink(取り消し後も復元されないことを確認する対象)
    const individuallyDeletedLink = await createLink(sessionCookie, 'https://example.com/individually-deleted')
    const individualDeleteResponse = await SELF.fetch(`https://example.com/api/v1/links/${individuallyDeletedLink.id}`, {
      method: 'DELETE',
      headers: { Cookie: sessionCookie },
    })
    expect(individualDeleteResponse.status).toBe(204)

    // 申請時点ではまだ有効(申請によってソフトデリートされ、取り消し後に復元されることを確認する対象)
    const link = await createLink(sessionCookie, 'https://example.com/restored-target')
    const qrcode = await createQrcode(sessionCookie)
    const poster = await createPoster(sessionCookie, qrcode.id)

    await requestAccountDeletion(sessionCookie)

    // 申請直後は、対象リソースがソフトデリートされ404になっていることを確認する
    const linkAfterRequestResponse = await SELF.fetch(`https://example.com/api/v1/links/${link.id}`, {
      headers: { Cookie: sessionCookie },
    })
    expect(linkAfterRequestResponse.status).toBe(404)

    // 再サインイン(=新規セッション作成)により、databaseHooks経由で自動的に取り消される
    const newSessionCookie = await signIn(email)

    // 申請によって削除されたlink・qrcode・posterは、deletedAtがnullに戻り再び200になる
    const linkResponse = await SELF.fetch(`https://example.com/api/v1/links/${link.id}`, {
      headers: { Cookie: newSessionCookie },
    })
    expect(linkResponse.status).toBe(200)

    const qrcodeResponse = await SELF.fetch(`https://example.com/api/v1/qrcodes/${qrcode.id}`, {
      headers: { Cookie: newSessionCookie },
    })
    expect(qrcodeResponse.status).toBe(200)

    const posterResponse = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}`, {
      headers: { Cookie: newSessionCookie },
    })
    expect(posterResponse.status).toBe(200)

    // 申請より前に個別削除していたlinkは、deletedAtがrequestedAtと一致しないため復元されない
    const individuallyDeletedResponse = await SELF.fetch(`https://example.com/api/v1/links/${individuallyDeletedLink.id}`, {
      headers: { Cookie: newSessionCookie },
    })
    expect(individuallyDeletedResponse.status).toBe(404)

    // accountRequestsのstatusがcancelledになっていることを確認する
    const accountRequestResponse = await SELF.fetch('https://example.com/api/v1/account-requests', {
      headers: { Cookie: newSessionCookie },
    })
    expect(accountRequestResponse.status).toBe(200)
    const accountRequestBody = await accountRequestResponse.json()
    expect(accountRequestBody).toMatchObject({ status: 'cancelled' })
  })
})
