import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

// src/lib/auth.tsのrevokeSessionsOnPasswordReset・resetPasswordTokenExpiresInの検証

async function signUp(email: string) {
  const response = await SELF.fetch('https://example.com/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: env.BETTER_AUTH_URL },
    body: JSON.stringify({ email, password: 'password1234', name: 'Test User', agreeToTerms: true }),
  })
  const setCookie = response.headers.get('set-cookie')
  if (!setCookie) {
    throw new Error('サインアップのレスポンスにset-cookieが含まれていません')
  }
  return setCookie.split(';')[0]
}

async function signIn(email: string) {
  const response = await SELF.fetch('https://example.com/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: env.BETTER_AUTH_URL },
    body: JSON.stringify({ email, password: 'password1234' }),
  })
  expect(response.status).toBe(200)
  const setCookie = response.headers.get('set-cookie')
  if (!setCookie) {
    throw new Error('サインインのレスポンスにset-cookieが含まれていません')
  }
  return setCookie.split(';')[0]
}

// パスワード再設定申請を行い、送信されたメール本文からトークンを取り出す。
// urlは`${baseURL}/reset-password/<token>?callbackURL=...`の形式(password.mjs参照)のため、
// パス部分からトークンを正規表現で取り出す
async function requestPasswordResetAndGetToken(email: string): Promise<string> {
  let capturedUrl: string | undefined
  env.EMAIL.send = async (message) => {
    const text = (message as { text?: string }).text ?? ''
    const match = text.match(/\/reset-password\/([^?\s]+)\?/)
    capturedUrl = match?.[1]
    return { messageId: 'test-message-id' }
  }

  const response = await SELF.fetch('https://example.com/api/auth/request-password-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: env.BETTER_AUTH_URL },
    body: JSON.stringify({ email, redirectTo: '/reset-password/confirm' }),
  })
  expect(response.status).toBe(200)

  if (!capturedUrl) {
    throw new Error('パスワード再設定メールからトークンを取り出せませんでした')
  }
  return capturedUrl
}

function resetPassword(token: string, newPassword: string) {
  return SELF.fetch('https://example.com/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: env.BETTER_AUTH_URL },
    body: JSON.stringify({ token, newPassword }),
  })
}

async function getSession(sessionCookie: string) {
  return SELF.fetch('https://example.com/api/auth/get-session', {
    headers: { Cookie: sessionCookie },
  })
}

describe('パスワード再設定後の他端末ログアウト(revokeSessionsOnPasswordReset)', () => {
  it('パスワード再設定の後、同じユーザーの別のセッションが無効になる', async () => {
    const email = `reset-revoke-${crypto.randomUUID()}@example.com`
    const sessionA = await signUp(email)
    const sessionB = await signIn(email)

    // 再設定前は両方のセッションが有効であることを確認しておく
    expect((await getSession(sessionA)).status).toBe(200)
    expect((await getSession(sessionB)).status).toBe(200)

    const token = await requestPasswordResetAndGetToken(email)
    const resetResponse = await resetPassword(token, 'newpassword1234')
    expect(resetResponse.status).toBe(200)

    // 両方のセッションが無効になっている(get-sessionがdata: nullを返す)
    const sessionAAfter = await getSession(sessionA)
    const sessionBAfter = await getSession(sessionB)
    expect(await sessionAAfter.json()).toBeNull()
    expect(await sessionBAfter.json()).toBeNull()
  })
})

describe('パスワード再設定トークンの使い回し', () => {
  it('同じトークンを2回使うと、2回目は失敗する(INVALID_TOKEN)', async () => {
    const email = `reset-reuse-${crypto.randomUUID()}@example.com`
    await signUp(email)
    const token = await requestPasswordResetAndGetToken(email)

    const firstResponse = await resetPassword(token, 'firstpassword1234')
    expect(firstResponse.status).toBe(200)

    const secondResponse = await resetPassword(token, 'secondpassword1234')
    expect(secondResponse.status).toBe(400)
    const body = await secondResponse.json<{ code?: string }>()
    expect(body.code).toBe('INVALID_TOKEN')
  })
})

describe('確認メール・パスワード再設定メールの有効期限の案内(1時間)', () => {
  it('確認メールの本文に「1時間」が含まれる', async () => {
    let capturedText: string | undefined
    env.EMAIL.send = async (message) => {
      capturedText = (message as { text?: string }).text
      return { messageId: 'test-message-id' }
    }

    await signUp(`verify-expiry-${crypto.randomUUID()}@example.com`)

    expect(capturedText).toContain('1時間')
  })

  it('パスワード再設定メールの本文に「1時間」が含まれる', async () => {
    const email = `reset-expiry-${crypto.randomUUID()}@example.com`
    await signUp(email)

    let capturedText: string | undefined
    env.EMAIL.send = async (message) => {
      capturedText = (message as { text?: string }).text
      return { messageId: 'test-message-id' }
    }

    const response = await SELF.fetch('https://example.com/api/auth/request-password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: env.BETTER_AUTH_URL },
      body: JSON.stringify({ email, redirectTo: '/reset-password/confirm' }),
    })
    expect(response.status).toBe(200)

    expect(capturedText).toContain('1時間')
  })
})
