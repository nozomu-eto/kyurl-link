import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { accountRequests } from '@/db/schema'
import { linkSchema } from '@/shared/schemas/link'
import { posterSchema } from '@/shared/schemas/poster'
import { qrcodeSchema } from '@/shared/schemas/qrcode'
import { markEmailVerified } from '../../test/mark-email-verified'

const TEST_PASSWORD = 'password1234'

// サインアップし、セッションCookie・userId・emailを取得する(emailは再サインインに使う)。
// requireVerifiedEmailミドルウェアを通すため、作成直後にemailVerifiedをtrueにしておく
async function signUp() {
  const email = `test-${crypto.randomUUID()}@example.com`
  const response = await SELF.fetch('https://example.com/api/auth/sign-up/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Better AuthはCSRF対策としてOriginを検証するため、BETTER_AUTH_URLと同じ値を付与する
      Origin: env.BETTER_AUTH_URL,
    },
    body: JSON.stringify({ email, password: TEST_PASSWORD, name: 'Test User', agreeToTerms: true }),
  })

  const setCookie = response.headers.get('set-cookie')
  if (!setCookie) {
    throw new Error('サインアップのレスポンスにset-cookieが含まれていません')
  }
  const sessionCookie = setCookie.split(';')[0]

  const body = await response.json<{ user: { id: string } }>()
  const userId = body.user.id
  await markEmailVerified(userId)
  return { email, sessionCookie, userId }
}

// 再サインインし、新しいセッションCookieを取得する
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

// アカウント削除申請の取り消し(POST /account-requests/cancel)を行う
async function cancelAccountDeletion(sessionCookie: string) {
  return SELF.fetch('https://example.com/api/v1/account-requests/cancel', {
    method: 'POST',
    headers: { Cookie: sessionCookie },
  })
}

describe('ログインだけでは取り消されないこと', () => {
  it('退会申請後に再サインインしても、申請は取り消されずリソースはソフトデリートされたままになる', async () => {
    const { email, sessionCookie } = await signUp()
    const link = await createLink(sessionCookie, 'https://example.com/not-auto-restored')

    await requestAccountDeletion(sessionCookie)

    // 再サインイン(=新規セッション作成)しても、databaseHooks(session.create.after)が
    // 削除されているため自動的には取り消されない
    const newSessionCookie = await signIn(email)

    const linkResponse = await SELF.fetch(`https://example.com/api/v1/links/${link.id}`, {
      headers: { Cookie: newSessionCookie },
    })
    expect(linkResponse.status).toBe(404)

    const accountRequestResponse = await SELF.fetch('https://example.com/api/v1/account-requests', {
      headers: { Cookie: newSessionCookie },
    })
    expect(accountRequestResponse.status).toBe(200)
    expect(await accountRequestResponse.json()).toMatchObject({ status: 'pending' })
  })
})

describe('POST /api/v1/account-requests/cancel(明示的な取り消し)', () => {
  it('取り消すと、申請によってソフトデリートされたリソースが復元される(個別削除済みのものは復元されない)', async () => {
    const { sessionCookie } = await signUp()

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

    // 申請直後は、公開リダイレクトも410(カスケードによるstatus: 'suspended')になっている
    const redirectAfterRequestResponse = await SELF.fetch(`https://example.com/${link.shortCode}`, { redirect: 'manual' })
    expect(redirectAfterRequestResponse.status).toBe(410)

    const cancelResponse = await cancelAccountDeletion(sessionCookie)
    expect(cancelResponse.status).toBe(200)
    expect(await cancelResponse.json()).toMatchObject({ status: 'cancelled' })

    // 申請によって削除されたlink・qrcode・posterは、deletedAtがnullに戻り再び200になる。
    // linkはdeletedAtに加えてstatusも'suspended'から'active'に戻っていることを確認する
    // (このstatusの復元が無いと、deletedAtが復元されても公開リダイレクトが410のまま
    // になってしまう。account-request-cancellation.tsが保証する挙動)
    const linkResponse = await SELF.fetch(`https://example.com/api/v1/links/${link.id}`, {
      headers: { Cookie: sessionCookie },
    })
    expect(linkResponse.status).toBe(200)
    expect(await linkResponse.json()).toMatchObject({ status: 'active' })

    // 公開リダイレクトも302に戻っていることを確認する
    const redirectAfterCancelResponse = await SELF.fetch(`https://example.com/${link.shortCode}`, { redirect: 'manual' })
    expect(redirectAfterCancelResponse.status).toBe(302)

    const qrcodeResponse = await SELF.fetch(`https://example.com/api/v1/qrcodes/${qrcode.id}`, {
      headers: { Cookie: sessionCookie },
    })
    expect(qrcodeResponse.status).toBe(200)

    const posterResponse = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}`, {
      headers: { Cookie: sessionCookie },
    })
    expect(posterResponse.status).toBe(200)

    // 申請より前に個別削除していたlinkは、deletedAtがrequestedAtと一致しないため復元されない
    const individuallyDeletedResponse = await SELF.fetch(`https://example.com/api/v1/links/${individuallyDeletedLink.id}`, {
      headers: { Cookie: sessionCookie },
    })
    expect(individuallyDeletedResponse.status).toBe(404)

    // accountRequestsのstatusがcancelledになっていることを確認する
    const accountRequestResponse = await SELF.fetch('https://example.com/api/v1/account-requests', {
      headers: { Cookie: sessionCookie },
    })
    expect(accountRequestResponse.status).toBe(200)
    expect(await accountRequestResponse.json()).toMatchObject({ status: 'cancelled' })
  })

  it('取り消せる申請が無い場合は404になる', async () => {
    const { sessionCookie } = await signUp()

    const response = await cancelAccountDeletion(sessionCookie)
    expect(response.status).toBe(404)
    const body = await response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('猶予期間(scheduledDeletionAt)を過ぎた申請は取り消せず409になる', async () => {
    const { sessionCookie } = await signUp()
    await requestAccountDeletion(sessionCookie)

    // テストのため、scheduledDeletionAt(通常は申請から7日後)を直接過去の日時に書き換える
    const db = drizzle(env.DB)
    await db.update(accountRequests).set({ scheduledDeletionAt: new Date(Date.now() - 1000) })

    const response = await cancelAccountDeletion(sessionCookie)
    expect(response.status).toBe(409)
    const body = await response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('GRACE_PERIOD_EXPIRED')

    // 取り消されず、pendingのままであること
    const accountRequestResponse = await SELF.fetch('https://example.com/api/v1/account-requests', {
      headers: { Cookie: sessionCookie },
    })
    expect(await accountRequestResponse.json()).toMatchObject({ status: 'pending' })
  })

  it('取り消しを連続で2回呼ぶと、2回目は404(取り消せる申請が無い)になる', async () => {
    // ほぼ同時に2回押された場合、1回目の後でcancelPendingAccountRequestIfAnyがnullを返しても、
    // 500エラーにならず404になることの確認。
    // 実際の競合(2つのリクエストが同時に実行される状況)そのものは再現しないが、
    // 「1回目の成功後、対象が無くなった状態でもう一度呼ぶと404になる」という
    // 最終的に保証したい挙動は連続呼び出しでも検証できる
    const { sessionCookie } = await signUp()
    await requestAccountDeletion(sessionCookie)

    const firstResponse = await cancelAccountDeletion(sessionCookie)
    expect(firstResponse.status).toBe(200)

    const secondResponse = await cancelAccountDeletion(sessionCookie)
    expect(secondResponse.status).toBe(404)
    const body = await secondResponse.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('NOT_FOUND')
  })
})
