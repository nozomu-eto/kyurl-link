import { env, SELF } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { RATE_LIMIT_TEST_TIMEOUT_MS, waitForFreshRateLimitWindow } from '../../test/wait-for-rate-limit-window'

// src/lib/auth.tsのsendVerificationEmail・sendResetPasswordに設けた、
// 同じメールアドレスにつき60秒に1回までの再送制限(EMAIL_RESEND_RATE_LIMITER、
// docs/architecture.mdの「API設計」)を、実際のBindingとBetter Authのエンドポイント経由で検証する。
// キーの組み立て自体(ハッシュ化・接頭辞)の単体テストはsrc/lib/email-resend-limit.test.ts参照

type SentEmail = { to?: string; subject?: string }

let sentEmails: SentEmail[]

beforeEach(() => {
  sentEmails = []
  env.EMAIL.send = async (message) => {
    sentEmails.push(message as SentEmail)
    return { messageId: 'test-message-id' }
  }
})

function sentTo(email: string) {
  return sentEmails.filter((m) => m.to === email)
}

async function signUp(email: string) {
  const response = await SELF.fetch('https://example.com/api/auth/sign-up/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: env.BETTER_AUTH_URL,
    },
    body: JSON.stringify({ email, password: 'password1234', name: 'Test User', agreeToTerms: true }),
  })
  expect(response.status).toBe(200)
}

function sendVerificationEmail(email: string) {
  return SELF.fetch('https://example.com/api/auth/send-verification-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: env.BETTER_AUTH_URL,
    },
    body: JSON.stringify({ email, callbackURL: '/app' }),
  })
}

function requestPasswordReset(email: string) {
  return SELF.fetch('https://example.com/api/auth/request-password-reset', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: env.BETTER_AUTH_URL,
    },
    body: JSON.stringify({ email, redirectTo: '/reset-password/confirm' }),
  })
}

// 60秒に1回までの制限はRate Limiting bindingの窓(時計に揃えた60秒)で数えられ、窓が切り替わると
// 数え直される。1回目と2回目のあいだで窓が切り替わると制限に当たらず失敗するため、
// 2回続けて呼ぶテストは最初にwaitForFreshRateLimitWindow()を呼ぶ(test/wait-for-rate-limit-window.ts参照)
describe('確認メール・パスワード再設定メールの再送制限(60秒に1回まで)', () => {
  it('新規登録直後(sendOnSignUpによる自動送信)の60秒以内に確認メールの再送を呼んでも、メールは1通しか送られない', async () => {
    await waitForFreshRateLimitWindow()
    const email = `resend-verify-${crypto.randomUUID()}@example.com`
    await signUp(email)
    // signUp自体でsendOnSignUp: trueにより既に1通送信されている
    expect(sentTo(email)).toHaveLength(1)

    const response = await sendVerificationEmail(email)
    // 429は返さず、送信せずに200のまま終える
    expect(response.status).toBe(200)
    expect(sentTo(email)).toHaveLength(1)
  }, RATE_LIMIT_TEST_TIMEOUT_MS)

  it('パスワード再設定申請を60秒以内に2回行っても、メールは1通しか送られない', async () => {
    await waitForFreshRateLimitWindow()
    const email = `resend-reset-${crypto.randomUUID()}@example.com`
    await signUp(email)
    sentEmails = [] // サインアップ時の確認メール送信をリセットし、以降はパスワード再設定のみを見る

    const first = await requestPasswordReset(email)
    expect(first.status).toBe(200)
    expect(sentTo(email)).toHaveLength(1)

    const second = await requestPasswordReset(email)
    expect(second.status).toBe(200)
    expect(sentTo(email)).toHaveLength(1)
  }, RATE_LIMIT_TEST_TIMEOUT_MS)

  it('未登録のメールアドレスでも、制限に当たった場合でも、応答(ステータス)は同じになる(登録の有無を明かさない)', async () => {
    const unregisteredEmail = `resend-unregistered-${crypto.randomUUID()}@example.com`
    const firstResponse = await requestPasswordReset(unregisteredEmail)
    const secondResponse = await requestPasswordReset(unregisteredEmail)

    expect(firstResponse.status).toBe(secondResponse.status)
    // 未登録アドレスにはそもそもメールが送信されない(Better Auth側の既定の挙動)
    expect(sentTo(unregisteredEmail)).toHaveLength(0)
  })

  it('確認メールの制限とパスワード再設定の制限は互いに影響しない(用途ごとに別キー)', async () => {
    const email = `resend-independent-${crypto.randomUUID()}@example.com`
    await signUp(email)
    // サインアップ直後の確認メール送信により、確認メール用の制限キーは既に消費されている
    expect(sentTo(email)).toHaveLength(1)

    // パスワード再設定は別キーのため、直後でも送信される
    const resetResponse = await requestPasswordReset(email)
    expect(resetResponse.status).toBe(200)
    expect(sentTo(email).filter((m) => m.subject?.includes('パスワード再設定'))).toHaveLength(1)
  })
})
