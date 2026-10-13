import { describe, expect, it } from 'vitest'
import { buildLinkClicksSql, getLinkClicksStartDay } from '@/lib/link-clicks-query'

describe('buildLinkClicksSql', () => {
  it('正しい形式のlinkIdとdays(30)を渡すと、日本時間の日付で日別に集計するSQL文字列を返す', () => {
    const linkId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'

    const sql = buildLinkClicksSql(linkId, 30)

    expect(sql).toBe(`SELECT
  formatDateTime(timestamp, '%Y-%m-%d', 'Asia/Tokyo') AS day,
  SUM(_sample_interval) AS clicks
FROM link_clicks
WHERE index1 = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
  AND timestamp > NOW() - INTERVAL '31' DAY
GROUP BY day
ORDER BY day
FORMAT JSON`)
  })

  it('日付はUTC基準のtoDateではなく、タイムゾーン(Asia/Tokyo)を指定したformatDateTimeで求める', () => {
    const sql = buildLinkClicksSql('f47ac10b-58cc-4372-a567-0e02b2c3d479', 7)
    expect(sql).toContain("formatDateTime(timestamp, '%Y-%m-%d', 'Asia/Tokyo') AS day")
    expect(sql).not.toContain('toDate(')
  })

  it.each([7, 30, 90] as const)('daysに%iを渡すと、日本時間の開始日が0時より前に遡る分を見込んで1日広げた期間を取る', (days) => {
    const sql = buildLinkClicksSql('f47ac10b-58cc-4372-a567-0e02b2c3d479', days)
    expect(sql).toContain(`INTERVAL '${days + 1}' DAY`)
  })

  it('不正な形式(SQLインジェクションを試みる文字列等)のlinkIdを渡すと例外になる', () => {
    expect(() => buildLinkClicksSql("' OR '1'='1", 30)).toThrow()
    expect(() => buildLinkClicksSql('abc; DROP TABLE link_clicks;', 30)).toThrow()
    expect(() => buildLinkClicksSql('', 30)).toThrow()
  })

  it('LINK_CLICKS_DAYS_OPTIONS(7/30/90)以外のdaysを渡すと例外になる(文字列を直接埋め込まない防御)', () => {
    const linkId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
    // @ts-expect-error 型では7/30/90に絞っているが、呼び出し元の検証漏れに備えて実行時にも弾く
    expect(() => buildLinkClicksSql(linkId, 31)).toThrow()
    // @ts-expect-error 同上。SQLインジェクションを試みる値
    expect(() => buildLinkClicksSql(linkId, "30' OR '1'='1")).toThrow()
  })
})

describe('getLinkClicksStartDay', () => {
  it('日本時間の今日を含むdays日分の最初の日付を返す', () => {
    // 日本時間 2026-09-25 10:00
    const now = new Date('2026-09-25T01:00:00Z')
    expect(getLinkClicksStartDay(7, now)).toBe('2026-09-19')
    expect(getLinkClicksStartDay(30, now)).toBe('2026-08-27')
  })

  it('UTCではまだ前日でも、日本時間で日付が変わっていれば日本時間の日付で数える(9時の境目)', () => {
    // UTC 2026-09-24 15:30 は日本時間 2026-09-25 00:30
    expect(getLinkClicksStartDay(7, new Date('2026-09-24T15:30:00Z'))).toBe('2026-09-19')
    // UTC 2026-09-24 14:30 は日本時間 2026-09-24 23:30
    expect(getLinkClicksStartDay(7, new Date('2026-09-24T14:30:00Z'))).toBe('2026-09-18')
  })
})
