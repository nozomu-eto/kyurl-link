import { env, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'

const TEST_PASSWORD = 'password1234'

// Better Authは既定で開発モード(テスト実行時含む)ではレート制限を無効化するため、
// src/lib/auth.tsが参照するRATE_LIMIT_FORCE_ENABLEDをこのテストファイル内でのみ
// 'true'に書き換え、強制的に有効化する
beforeAll(() => {
  ;(env as unknown as { RATE_LIMIT_FORCE_ENABLED: string }).RATE_LIMIT_FORCE_ENABLED = 'true'
})

// サインインのレート制限テスト用にサインアップする(cf-connecting-ipのテストのため
// IPヘッダーは指定せず、サインアップ自体はレート制限の対象外の別IPになっても問題無い)
async function signUp(email: string) {
  const response = await SELF.fetch('https://example.com/api/auth/sign-up/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: env.BETTER_AUTH_URL,
    },
    body: JSON.stringify({ email, password: TEST_PASSWORD, name: 'Rate Limit Test User' }),
  })
  expect(response.status).toBe(200)
}

// 指定したcf-connecting-ipからサインインを試行する(意図的に誤ったパスワードを使い、
// 失敗しても/sign-in/emailへのリクエスト自体はレート制限のカウント対象になることを利用する)
async function attemptSignIn(email: string, ip: string) {
  return SELF.fetch('https://example.com/api/auth/sign-in/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: env.BETTER_AUTH_URL,
      'cf-connecting-ip': ip,
    },
    body: JSON.stringify({ email, password: 'wrong-password' }),
  })
}

// src/lib/auth.tsのrateLimit.customRules['/sign-in/email']は「60秒あたり5回まで」。
// Better Authのレート制限は既定で開発モード(テスト実行時含む)では無効化されるが、
// auth.tsではenabled: trueを明示しているため、テスト実行時も有効になっている
describe('サインインのレート制限(docs/architecture.md参照)', () => {
  it('同一IPから6回目のサインイン試行は429になる', async () => {
    const email = `rate-limit-${crypto.randomUUID()}@example.com`
    await signUp(email)

    const ip = '203.0.113.1'
    for (let i = 0; i < 5; i++) {
      const response = await attemptSignIn(email, ip)
      // パスワードが誤りのため401だが、レート制限には掛からない
      expect(response.status).toBe(401)
    }

    const sixthResponse = await attemptSignIn(email, ip)
    expect(sixthResponse.status).toBe(429)
  })

  it('別のIPからのサインイン試行は、他のIPの試行回数の影響を受けない', async () => {
    const email = `rate-limit-${crypto.randomUUID()}@example.com`
    await signUp(email)

    const ipA = '203.0.113.10'
    const ipB = '203.0.113.20'

    // ipAを上限まで使い切る
    for (let i = 0; i < 5; i++) {
      const response = await attemptSignIn(email, ipA)
      expect(response.status).toBe(401)
    }
    const blockedResponse = await attemptSignIn(email, ipA)
    expect(blockedResponse.status).toBe(429)

    // ipBはipAのカウントに影響されず、通常どおり401(レート制限には掛からない)
    const otherIpResponse = await attemptSignIn(email, ipB)
    expect(otherIpResponse.status).toBe(401)
  })
})
