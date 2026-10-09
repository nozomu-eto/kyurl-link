import { describe, expect, it, vi } from 'vitest'
import { shouldSendResendLimitedEmail } from '@/lib/email-resend-limit'

// RateLimitのlimit()呼び出しを記録するだけの最小のフェイク。
// 実際のCloudflare Rate Limiting bindingの挙動(60秒に1回まで等)自体は
// wrangler.jsoncのEMAIL_RESEND_RATE_LIMITER設定とsrc/lib/auth-resend-limit.test.tsの
// 実バインディングを使った検証に委ね、ここではキーの組み立て(用途の接頭辞+ハッシュ)だけを検証する
function createFakeRateLimiter(successForKeys: Set<string>) {
  const calls: string[] = []
  const limiter: RateLimit = {
    limit: async ({ key }: { key: string }) => {
      calls.push(key)
      return { success: successForKeys.has(key) }
    },
  }
  return { limiter, calls }
}

describe('shouldSendResendLimitedEmail', () => {
  it('制限に達していなければtrueを返し、送信してよいと判定する', async () => {
    const limiter: RateLimit = { limit: async () => ({ success: true }) }
    const result = await shouldSendResendLimitedEmail(limiter, 'verify', 'user@example.com')
    expect(result).toBe(true)
  })

  it('制限に当たっていればfalseを返す(送信しない)', async () => {
    const limiter: RateLimit = { limit: async () => ({ success: false }) }
    const result = await shouldSendResendLimitedEmail(limiter, 'reset', 'user@example.com')
    expect(result).toBe(false)
  })

  it('キーは用途の接頭辞(verify:/reset:)を含み、メールアドレスの前後の空白除去・小文字化後にハッシュ化する', async () => {
    const { limiter, calls } = createFakeRateLimiter(new Set())
    await shouldSendResendLimitedEmail(limiter, 'verify', '  User@Example.com  ')
    await shouldSendResendLimitedEmail(limiter, 'reset', 'user@example.com')

    expect(calls[0].startsWith('verify:')).toBe(true)
    expect(calls[1].startsWith('reset:')).toBe(true)
    // 前後の空白除去・小文字化により、大文字混じり・空白付きでも同じハッシュ(同一キー本体)になる
    expect(calls[0].slice('verify:'.length)).toBe(calls[1].slice('reset:'.length))
  })

  it('用途(verify/reset)が違えば、同じメールアドレスでもキーが異なる(互いに制限し合わない)', async () => {
    const { limiter, calls } = createFakeRateLimiter(new Set())
    await shouldSendResendLimitedEmail(limiter, 'verify', 'user@example.com')
    await shouldSendResendLimitedEmail(limiter, 'reset', 'user@example.com')

    expect(calls[0]).not.toBe(calls[1])
  })

  it('メールアドレス変更の承認(change-email)も用途の接頭辞を持ち、確認メール・パスワード再設定とはキーが異なる', async () => {
    const { limiter, calls } = createFakeRateLimiter(new Set())
    await shouldSendResendLimitedEmail(limiter, 'verify', 'user@example.com')
    await shouldSendResendLimitedEmail(limiter, 'reset', 'user@example.com')
    await shouldSendResendLimitedEmail(limiter, 'change-email', 'user@example.com')

    expect(calls[2].startsWith('change-email:')).toBe(true)
    expect(new Set(calls).size).toBe(3)
  })

  it('制限に当たった場合、メールアドレスを含まない警告ログを出す', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const limiter: RateLimit = { limit: async () => ({ success: false }) }

    await shouldSendResendLimitedEmail(limiter, 'verify', 'secret-user@example.com')

    expect(warnSpy).toHaveBeenCalledTimes(1)
    const loggedMessage = warnSpy.mock.calls[0][0] as string
    expect(loggedMessage).not.toContain('secret-user@example.com')

    warnSpy.mockRestore()
  })
})
