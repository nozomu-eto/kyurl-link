import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getRemainingResendSeconds, RESEND_INTERVAL_SECONDS, recordVerificationEmailSentAt } from '@/frontend/lib/verify-email-resend-timer'

const USER_ID = 'user-1'

describe('recordVerificationEmailSentAt / getRemainingResendSeconds', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-26T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('記録が無ければ残り秒数は0(すぐ再送できる)', () => {
    expect(getRemainingResendSeconds(USER_ID)).toBe(0)
  })

  it('記録した直後はRESEND_INTERVAL_SECONDS(60)秒になる', () => {
    recordVerificationEmailSentAt(USER_ID)
    expect(getRemainingResendSeconds(USER_ID)).toBe(RESEND_INTERVAL_SECONDS)
  })

  it('30秒経過すると残りは30秒になる', () => {
    recordVerificationEmailSentAt(USER_ID)
    vi.advanceTimersByTime(30_000)
    expect(getRemainingResendSeconds(USER_ID)).toBe(30)
  })

  it('60秒経過すると残りは0になる(押せるようになる)', () => {
    recordVerificationEmailSentAt(USER_ID)
    vi.advanceTimersByTime(60_000)
    expect(getRemainingResendSeconds(USER_ID)).toBe(0)
  })

  it('60秒を過ぎても0未満にはならない', () => {
    recordVerificationEmailSentAt(USER_ID)
    vi.advanceTimersByTime(120_000)
    expect(getRemainingResendSeconds(USER_ID)).toBe(0)
  })

  it('ユーザーIDが異なれば、別の記録として扱う(他人の待ち時間を引き継がない)', () => {
    recordVerificationEmailSentAt(USER_ID)
    expect(getRemainingResendSeconds('another-user')).toBe(0)
  })

  it('sessionStorageが使えない場合は、待ち時間なし(0)として扱う', () => {
    const originalSessionStorage = window.sessionStorage
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('sessionStorage is not available')
      },
    })

    expect(() => recordVerificationEmailSentAt(USER_ID)).not.toThrow()
    expect(getRemainingResendSeconds(USER_ID)).toBe(0)

    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: originalSessionStorage })
  })
})
