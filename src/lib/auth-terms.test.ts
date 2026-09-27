import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { user } from '@/db/auth-schema'
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from '@/shared/constants/legal-versions'

// docs/architecture.md 第7節: サインアップ時に規約同意(agreeToTerms)が無ければ拒否し、
// 同意した場合はサーバー側でtermsAcceptedAt・termsVersion・privacyPolicyVersionを記録する。
// src/lib/auth.tsのhooks.before・databaseHooks.user.create.beforeの検証
function signUp(body: Record<string, unknown>) {
  return SELF.fetch('https://example.com/api/auth/sign-up/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: env.BETTER_AUTH_URL,
    },
    body: JSON.stringify(body),
  })
}

describe('サインアップ時の規約同意の記録', () => {
  it('agreeToTermsが無い場合、400(TERMS_NOT_ACCEPTED)になりユーザーは作られない', async () => {
    const email = `terms-missing-${crypto.randomUUID()}@example.com`
    const response = await signUp({ email, password: 'password1234', name: 'Test User' })

    expect(response.status).toBe(400)
    const body = await response.json<{ code?: string }>()
    expect(body.code).toBe('TERMS_NOT_ACCEPTED')

    const db = drizzle(env.DB)
    const [created] = await db.select().from(user).where(eq(user.email, email))
    expect(created).toBeUndefined()
  })

  it('agreeToTermsがfalseの場合も400(TERMS_NOT_ACCEPTED)になる', async () => {
    const email = `terms-false-${crypto.randomUUID()}@example.com`
    const response = await signUp({ email, password: 'password1234', name: 'Test User', agreeToTerms: false })

    expect(response.status).toBe(400)
    const body = await response.json<{ code?: string }>()
    expect(body.code).toBe('TERMS_NOT_ACCEPTED')
  })

  it('agreeToTerms: trueの場合、termsAcceptedAtと2つの版がサーバー側の値で保存される', async () => {
    const email = `terms-ok-${crypto.randomUUID()}@example.com`
    const beforeSignUp = Date.now()
    const response = await signUp({ email, password: 'password1234', name: 'Test User', agreeToTerms: true })

    expect(response.status).toBe(200)

    const db = drizzle(env.DB)
    const [created] = await db.select().from(user).where(eq(user.email, email))
    expect(created).toBeDefined()
    expect(created.termsAcceptedAt).toBeInstanceOf(Date)
    expect(created.termsAcceptedAt!.getTime()).toBeGreaterThanOrEqual(beforeSignUp)
    expect(created.termsVersion).toBe(TERMS_VERSION)
    expect(created.privacyPolicyVersion).toBe(PRIVACY_POLICY_VERSION)
  })

  it('bodyでtermsAcceptedAtやtermsVersionを直接指定しようとすると、Better Auth自身がinput: falseを理由に拒否する(400 FIELD_NOT_ALLOWED)', async () => {
    // additionalFieldsをinput: falseにすると、Better Auth自身がparseUserInputの時点で
    // 「クライアントが指定してよい項目ではない」として拒否する(サイレントな無視ではなく400)。
    // 「利用者が送った値では上書きされない」という要件を、値の上書きより一段階厳しい形
    // (そもそも指定を許さない)で満たしていることの確認
    const email = `terms-override-${crypto.randomUUID()}@example.com`
    const response = await signUp({
      email,
      password: 'password1234',
      name: 'Test User',
      agreeToTerms: true,
      termsVersion: 'malicious-version',
    })

    expect(response.status).toBe(400)
    const body = await response.json<{ code?: string }>()
    expect(body.code).toBe('FIELD_NOT_ALLOWED')

    const db = drizzle(env.DB)
    const [created] = await db.select().from(user).where(eq(user.email, email))
    expect(created).toBeUndefined()
  })

  it('通常のサインアップ(規約項目を指定しない)では、常にサーバー側の値だけが保存される', async () => {
    const email = `terms-normal-${crypto.randomUUID()}@example.com`
    const response = await signUp({ email, password: 'password1234', name: 'Test User', agreeToTerms: true })

    expect(response.status).toBe(200)

    const db = drizzle(env.DB)
    const [created] = await db.select().from(user).where(eq(user.email, email))
    expect(created.termsVersion).toBe(TERMS_VERSION)
    expect(created.privacyPolicyVersion).toBe(PRIVACY_POLICY_VERSION)
  })

  it('既存ユーザー(更新版11より前)はtermsAcceptedAt等がnullのままである(直接DB挿入で再現)', async () => {
    const db = drizzle(env.DB)
    const legacyUserId = crypto.randomUUID()
    await db.insert(user).values({
      id: legacyUserId,
      name: 'Legacy User',
      email: `legacy-${crypto.randomUUID()}@example.com`,
      emailVerified: false,
    })

    const [legacyUser] = await db.select().from(user).where(eq(user.id, legacyUserId))
    expect(legacyUser.termsAcceptedAt).toBeNull()
    expect(legacyUser.termsVersion).toBeNull()
    expect(legacyUser.privacyPolicyVersion).toBeNull()
  })
})
