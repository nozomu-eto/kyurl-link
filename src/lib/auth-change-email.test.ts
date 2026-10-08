import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { user } from '@/db/auth-schema'
import { markEmailVerified } from '../../test/mark-email-verified'

// src/lib/auth.tsのuser.changeEmail(段階4-2)の検証。
// 確認前(emailVerified: false)のアドレスに限りその場で変更でき、確認済みの場合は
// hooks.beforeで拒否する(今のアドレスへの確認を実装するまでの暫定措置)

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

function changeEmail(sessionCookie: string, newEmail: string) {
  return SELF.fetch('https://example.com/api/auth/change-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie, Origin: env.BETTER_AUTH_URL },
    body: JSON.stringify({ newEmail }),
  })
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

  it('確認済みのユーザーは403(EMAIL_CHANGE_NOT_AVAILABLE)になり、アドレスが変わらない', async () => {
    const originalEmail = `verified-${crypto.randomUUID()}@example.com`
    const { sessionCookie, userId } = await signUp(originalEmail)
    await markEmailVerified(userId)

    const response = await changeEmail(sessionCookie, `blocked-${crypto.randomUUID()}@example.com`)
    expect(response.status).toBe(403)
    const body = await response.json<{ code?: string }>()
    expect(body.code).toBe('EMAIL_CHANGE_NOT_AVAILABLE')

    const db = drizzle(env.DB)
    const [unchangedUser] = await db.select().from(user).where(eq(user.id, userId))
    expect(unchangedUser.email).toBe(originalEmail)
  })

  it('すでに使われているアドレスへの変更は、応答が成功と同じでアドレスが変わらない', async () => {
    const existingEmail = `existing-${crypto.randomUUID()}@example.com`
    await signUp(existingEmail)

    const originalEmail = `requester-${crypto.randomUUID()}@example.com`
    const { sessionCookie, userId } = await signUp(originalEmail)

    const response = await changeEmail(sessionCookie, existingEmail)
    // 登録の有無を漏らさないため、成功と同じ応答になる
    expect(response.status).toBe(200)
    const body = await response.json<{ status: boolean }>()
    expect(body.status).toBe(true)

    // 実際にはアドレスは変わっていない
    const db = drizzle(env.DB)
    const [unchangedUser] = await db.select().from(user).where(eq(user.id, userId))
    expect(unchangedUser.email).toBe(originalEmail)
  })
})
