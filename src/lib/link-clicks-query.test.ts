import { describe, expect, it } from 'vitest'
import { buildLinkClicksSql } from '@/lib/link-clicks-query'

describe('buildLinkClicksSql', () => {
  it('正しい形式のlinkIdとdays(30)を渡すと、期待通りのSQL文字列を返す', () => {
    const linkId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'

    const sql = buildLinkClicksSql(linkId, 30)

    expect(sql).toBe(`SELECT
  toDate(timestamp) AS day,
  SUM(_sample_interval) AS clicks
FROM link_clicks
WHERE index1 = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
  AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY day
ORDER BY day
FORMAT JSON`)
  })

  it.each([7, 30, 90] as const)('daysに%iを渡すと、INTERVAL句にその値が使われる', (days) => {
    const sql = buildLinkClicksSql('f47ac10b-58cc-4372-a567-0e02b2c3d479', days)
    expect(sql).toContain(`INTERVAL '${days}' DAY`)
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
