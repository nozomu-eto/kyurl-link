import { env, SELF } from 'cloudflare:test'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

const originalFetch = globalThis.fetch

// src/lib/auth.tsのTURNSTILE_DISABLED_FOR_TESTS(vitest.config.tsで既定'true')を、
// このテストファイル内でのみ'false'に上書きし、captchaプラグインを実際に有効化して検証する
beforeAll(() => {
  ;(env as unknown as { TURNSTILE_DISABLED_FOR_TESTS: string }).TURNSTILE_DISABLED_FOR_TESTS = 'false'
})

afterEach(() => {
  // テスト後は必ず元のfetchに戻す(urlhaus-client.test.tsと同じパターン)
  globalThis.fetch = originalFetch
})

// Turnstileのsiteverify APIをモックする
function mockTurnstileSiteverify(success: boolean) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ success }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch
}

async function signUp(headers: Record<string, string> = {}) {
  return SELF.fetch('https://example.com/api/auth/sign-up/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: env.BETTER_AUTH_URL,
      ...headers,
    },
    body: JSON.stringify({
      email: `captcha-${crypto.randomUUID()}@example.com`,
      password: 'password1234',
      name: 'Captcha Test User',
      agreeToTerms: true,
    }),
  })
}

// Better Auth公式のcaptchaプラグイン(src/lib/auth.ts)が、/sign-up/emailに対して
// 実際にx-captcha-responseヘッダーを検証していることを確認する
describe('サインアップのbot対策(Better Auth captchaプラグイン)', () => {
  it('x-captcha-responseヘッダーが無い場合、400(MISSING_RESPONSE)になる', async () => {
    const response = await signUp()
    expect(response.status).toBe(400)
    const body = await response.json<{ code?: string }>()
    expect(body.code).toBe('MISSING_RESPONSE')
  })

  it('トークンが不正(siteverifyがsuccess: falseを返す)場合、403になる', async () => {
    mockTurnstileSiteverify(false)
    const response = await signUp({ 'x-captcha-response': 'invalid-test-token' })
    expect(response.status).toBe(403)
  })

  it('トークンが有効(siteverifyがsuccess: trueを返す)場合、サインアップが成功する', async () => {
    mockTurnstileSiteverify(true)
    const response = await signUp({ 'x-captcha-response': 'valid-test-token' })
    expect(response.status).toBe(200)
  })
})
