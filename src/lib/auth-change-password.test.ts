import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

const OLD_PASSWORD = 'password1234'
const NEW_PASSWORD = 'new-password5678'

function authFetch(path: string, body: unknown, cookie?: string) {
  return SELF.fetch(`https://example.com/api/auth${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Better AuthはCSRF対策としてOriginを検証するため、BETTER_AUTH_URLと同じ値を付与する
      Origin: env.BETTER_AUTH_URL,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  })
}

function readSessionCookie(response: Response): string {
  const setCookie = response.headers.get('set-cookie')
  if (!setCookie) {
    throw new Error('レスポンスにset-cookieが含まれていません')
  }
  return setCookie.split(';')[0]
}

async function signUp() {
  const email = `change-password-${crypto.randomUUID()}@example.com`
  const response = await authFetch('/sign-up/email', { email, password: OLD_PASSWORD, name: 'Test User', agreeToTerms: true })
  expect(response.status).toBe(200)
  return { email, userId: (await response.json<{ user: { id: string } }>()).user.id, cookie: readSessionCookie(response) }
}

async function isSignedIn(cookie: string): Promise<boolean> {
  const response = await SELF.fetch('https://example.com/api/auth/get-session', { headers: { Cookie: cookie } })
  return (await response.json<{ user?: { id: string } } | null>())?.user !== undefined
}

// パスワード変更画面(ChangePasswordDialog)が呼ぶ /change-password の挙動の確認
describe('POST /api/auth/change-password', () => {
  it('revokeOtherSessions: true で変更すると、他の端末のセッションは無効になり、この端末は新しいセッションで継続し、新しいパスワードでログインできる', async () => {
    const { email, cookie } = await signUp()
    // 別の端末としてもう1つセッションを作る
    const otherDeviceCookie = readSessionCookie(await authFetch('/sign-in/email', { email, password: OLD_PASSWORD }))
    expect(await isSignedIn(otherDeviceCookie)).toBe(true)

    const response = await authFetch('/change-password', { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD, revokeOtherSessions: true }, cookie)
    expect(response.status).toBe(200)

    expect(await isSignedIn(otherDeviceCookie)).toBe(false)
    // この端末には新しいセッションのCookieが発行される
    expect(await isSignedIn(readSessionCookie(response))).toBe(true)
    expect((await authFetch('/sign-in/email', { email, password: NEW_PASSWORD })).status).toBe(200)
    expect((await authFetch('/sign-in/email', { email, password: OLD_PASSWORD })).status).toBe(401)
  })

  it('今のパスワードが違うと400(INVALID_PASSWORD)になり、パスワードは変わらない', async () => {
    const { email, cookie } = await signUp()

    const response = await authFetch('/change-password', { currentPassword: 'wrong-password', newPassword: NEW_PASSWORD, revokeOtherSessions: true }, cookie)

    expect(response.status).toBe(400)
    expect((await response.json<{ code: string }>()).code).toBe('INVALID_PASSWORD')
    expect((await authFetch('/sign-in/email', { email, password: OLD_PASSWORD })).status).toBe(200)
  })

  it('ログインしていないと401になる', async () => {
    const response = await authFetch('/change-password', { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD, revokeOtherSessions: true })

    expect(response.status).toBe(401)
  })

  it('ログインから1日以上経ったセッションでも変更できる(経過時間の条件(freshAge)は無い。better-auth 1.7.5)', async () => {
    const { userId, cookie } = await signUp()
    // セッションの作成日時を2日前に書き換え、Better Authの既定のfreshAge(1日)を超えた状態にする
    await env.DB.prepare('UPDATE session SET created_at = ? WHERE user_id = ?')
      .bind(Date.now() - 2 * 24 * 60 * 60 * 1000, userId)
      .run()

    const response = await authFetch('/change-password', { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD, revokeOtherSessions: true }, cookie)

    expect(response.status).toBe(200)
  })
})
