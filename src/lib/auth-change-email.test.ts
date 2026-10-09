import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { user } from '@/db/auth-schema'
import { markEmailVerified } from '../../test/mark-email-verified'

// src/lib/auth.tsのuser.changeEmailの検証。
// - 確認前(emailVerified: false)のユーザー: その場でアドレスが変わり、新しいアドレスに確認メールが送られる(段階4-2)
// - 確認済みのユーザー: 今のアドレスへの承認メール → 承認リンク → 新しいアドレスへの確認メール →
//   確認リンクを開いた時点でアドレスが変わる、の二段階の確認(sendChangeEmailConfirmation)

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
  const body = await response.json<{ user: { id: string } }>()
  return { sessionCookie: setCookie.split(';')[0], userId: body.user.id }
}

type SentEmail = { to?: string; subject?: string; text?: string }

// 送信されたメールを記録する(実際には送らない)
function captureSentEmails() {
  const sentEmails: SentEmail[] = []
  env.EMAIL.send = async (message) => {
    sentEmails.push(message as SentEmail)
    return { messageId: 'test-message-id' }
  }
  return sentEmails
}

function changeEmail(sessionCookie: string, newEmail: string, callbackURL?: string) {
  return SELF.fetch('https://example.com/api/auth/change-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie, Origin: env.BETTER_AUTH_URL },
    body: JSON.stringify({ newEmail, ...(callbackURL ? { callbackURL } : {}) }),
  })
}

// メール本文中のリンク(/api/auth/verify-email?token=...)を取り出し、テスト用のオリジンに付け替えて開く。
// リダイレクト先を確認するため、リダイレクトは追わない
async function openLinkInEmail(email: SentEmail, sessionCookie?: string) {
  const link = email.text?.match(/https?:\/\/\S+\/verify-email\?\S+/)?.[0]
  if (!link) {
    throw new Error('メール本文に確認リンクが含まれていません')
  }
  const url = new URL(link)
  return SELF.fetch(`https://example.com${url.pathname}${url.search}`, {
    redirect: 'manual',
    headers: sessionCookie ? { Cookie: sessionCookie } : {},
  })
}

async function findUser(userId: string) {
  const [found] = await drizzle(env.DB).select().from(user).where(eq(user.id, userId))
  return found
}

describe('POST /api/auth/change-email', () => {
  it('確認前のユーザーは、アドレスが変わり新しいアドレスに確認メールが送られる', async () => {
    const { sessionCookie, userId } = await signUp(`unverified-${crypto.randomUUID()}@example.com`)
    const newEmail = `changed-${crypto.randomUUID()}@example.com`

    const sentEmails: { to?: string; subject?: string }[] = []
    env.EMAIL.send = async (message) => {
      sentEmails.push(message as { to?: string; subject?: string })
      return { messageId: 'test-message-id' }
    }

    const response = await changeEmail(sessionCookie, newEmail)
    expect(response.status).toBe(200)

    const db = drizzle(env.DB)
    const [updatedUser] = await db.select().from(user).where(eq(user.id, userId))
    expect(updatedUser.email).toBe(newEmail)

    expect(sentEmails.some((m) => m.to === newEmail && m.subject === '【kyurl.link】メールアドレスの確認をお願いします')).toBe(true)
  })

  it('確認済みのユーザーも403にならず、まず今のアドレスへ承認メールが送られる(この時点ではアドレスは変わらず、新しいアドレスにはメールが届かない)', async () => {
    const originalEmail = `verified-${crypto.randomUUID()}@example.com`
    const newEmail = `new-${crypto.randomUUID()}@example.com`
    const { sessionCookie, userId } = await signUp(originalEmail)
    await markEmailVerified(userId)
    const sentEmails = captureSentEmails()

    const response = await changeEmail(sessionCookie, newEmail)

    expect(response.status).toBe(200)
    expect((await findUser(userId)).email).toBe(originalEmail)
    const confirmation = sentEmails.find((m) => m.to === originalEmail)
    expect(confirmation?.subject).toBe('【kyurl.link】メールアドレス変更の承認をお願いします')
    // 本文に変更後のアドレスと、心当たりがない場合のパスワード変更の案内がある
    expect(confirmation?.text).toContain(newEmail)
    expect(confirmation?.text).toContain('パスワードを変更してください')
    expect(sentEmails.some((m) => m.to === newEmail)).toBe(false)
  })

  it('二段階の確認: 今のアドレスで承認 → 新しいアドレスへ確認メール → 確認リンクを開いた時点でアドレスが変わる', async () => {
    const originalEmail = `verified-${crypto.randomUUID()}@example.com`
    const newEmail = `new-${crypto.randomUUID()}@example.com`
    const { sessionCookie, userId } = await signUp(originalEmail)
    await markEmailVerified(userId)
    const sentEmails = captureSentEmails()
    const callbackURL = `/app/account?emailChange=${encodeURIComponent(newEmail)}`

    await changeEmail(sessionCookie, newEmail, callbackURL)

    // ①今のアドレスに届いた承認リンクを開く → 新しいアドレスへ確認メールが送られ、callbackURLへリダイレクトされる。
    // まだアドレスは変わらない
    const confirmationResponse = await openLinkInEmail(sentEmails.find((m) => m.to === originalEmail)!, sessionCookie)
    expect(confirmationResponse.status).toBe(302)
    expect(confirmationResponse.headers.get('location')).toBe(callbackURL)
    expect((await findUser(userId)).email).toBe(originalEmail)

    const verification = sentEmails.find((m) => m.to === newEmail)
    expect(verification?.subject).toBe('【kyurl.link】メールアドレスの確認をお願いします')
    // 新規登録の確認メールと共用する文面が、メールアドレス変更の場合も不自然にならない
    expect(verification?.text).toContain('メールアドレスの変更')
    expect(verification?.text).not.toContain('ご登録いただきありがとうございます')

    // ②新しいアドレスの確認リンクを開く → アドレスが変わり、確認済みになる
    const verificationResponse = await openLinkInEmail(verification!, sessionCookie)
    expect(verificationResponse.status).toBe(302)
    expect(verificationResponse.headers.get('location')).toBe(callbackURL)
    const updatedUser = await findUser(userId)
    expect(updatedUser.email).toBe(newEmail)
    expect(updatedUser.emailVerified).toBe(true)
  })

  it('今のアドレスへの承認メールは、同じアドレスにつき60秒に1回まで(連続して申請しても、応答は成功のまま、2通目は送られない)', async () => {
    const originalEmail = `verified-${crypto.randomUUID()}@example.com`
    const { sessionCookie, userId } = await signUp(originalEmail)
    await markEmailVerified(userId)
    const sentEmails = captureSentEmails()

    expect((await changeEmail(sessionCookie, `first-${crypto.randomUUID()}@example.com`)).status).toBe(200)
    expect((await changeEmail(sessionCookie, `second-${crypto.randomUUID()}@example.com`)).status).toBe(200)

    expect(sentEmails.filter((m) => m.to === originalEmail)).toHaveLength(1)
  })

  it('すでに使われているアドレスへの変更は、応答が成功と同じでアドレスが変わらない', async () => {
    const existingEmail = `existing-${crypto.randomUUID()}@example.com`
    await signUp(existingEmail)

    const originalEmail = `requester-${crypto.randomUUID()}@example.com`
    const { sessionCookie, userId } = await signUp(originalEmail)
    const sentEmails = captureSentEmails()

    const response = await changeEmail(sessionCookie, existingEmail)
    // 登録の有無を漏らさないため、成功と同じ応答になる
    expect(response.status).toBe(200)
    const body = await response.json<{ status: boolean }>()
    expect(body.status).toBe(true)

    // 実際にはアドレスは変わっていない
    const db = drizzle(env.DB)
    const [unchangedUser] = await db.select().from(user).where(eq(user.id, userId))
    expect(unchangedUser.email).toBe(originalEmail)
    expect(sentEmails.some((m) => m.to === existingEmail)).toBe(false)
  })

  it('確認済みのユーザーが、すでに使われているアドレスへの変更を申請した場合も、応答は成功と同じで、メールは送られずアドレスも変わらない', async () => {
    const existingEmail = `existing-${crypto.randomUUID()}@example.com`
    await signUp(existingEmail)
    const originalEmail = `verified-requester-${crypto.randomUUID()}@example.com`
    const { sessionCookie, userId } = await signUp(originalEmail)
    await markEmailVerified(userId)
    const sentEmails = captureSentEmails()

    const response = await changeEmail(sessionCookie, existingEmail)

    expect(response.status).toBe(200)
    expect((await response.json<{ status: boolean }>()).status).toBe(true)
    expect((await findUser(userId)).email).toBe(originalEmail)
    expect(sentEmails).toHaveLength(0)
  })
})
