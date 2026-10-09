import { describe, expect, it } from 'vitest'
import { addMonthsToJstDateString, getTodayJstDateString, resolveExpiresAt, toExpiresAt } from '@/frontend/lib/link-expiry'

describe('link-expiry', () => {
  it('getTodayJstDateString: UTCでは前日でも、日本時間の日付を返す', () => {
    // 2026-10-08T16:00:00Z は日本時間の2026-10-09 01:00
    expect(getTodayJstDateString(new Date('2026-10-08T16:00:00Z'))).toBe('2026-10-09')
  })

  it('addMonthsToJstDateString: 1か月後・3か月後を日本時間の日付で返す', () => {
    const now = new Date('2026-10-09T03:00:00Z')
    expect(addMonthsToJstDateString(1, now)).toBe('2026-11-09')
    expect(addMonthsToJstDateString(3, now)).toBe('2027-01-09')
  })

  it('addMonthsToJstDateString: 翌月に同じ日が無い場合は末日にそろえる', () => {
    expect(addMonthsToJstDateString(1, new Date('2026-01-31T03:00:00Z'))).toBe('2026-02-28')
    expect(addMonthsToJstDateString(1, new Date('2028-01-31T03:00:00Z'))).toBe('2028-02-29')
  })

  it('toExpiresAt: 指定日の23:59:59.999(日本時間)をUTCのISO文字列にする', () => {
    expect(toExpiresAt('2026-12-31')).toBe('2026-12-31T14:59:59.999Z')
  })

  it('resolveExpiresAt: 無期限はnull、日付指定は指定日の23:59(日本時間)', () => {
    const now = new Date('2026-10-09T03:00:00Z')
    expect(resolveExpiresAt('none', '', now)).toBeNull()
    expect(resolveExpiresAt('oneMonth', '', now)).toBe('2026-11-09T14:59:59.999Z')
    expect(resolveExpiresAt('threeMonths', '', now)).toBe('2027-01-09T14:59:59.999Z')
    expect(resolveExpiresAt('custom', '2026-12-31', now)).toBe('2026-12-31T14:59:59.999Z')
    expect(resolveExpiresAt('custom', '', now)).toBeNull()
  })
})
