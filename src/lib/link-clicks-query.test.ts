import { describe, expect, it } from 'vitest'
import { buildLinkClicksSql } from '@/lib/link-clicks-query'

describe('buildLinkClicksSql', () => {
  it('正しい形式のlinkIdを渡すと、期待通りのSQL文字列を返す', () => {
    const linkId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'

    const sql = buildLinkClicksSql(linkId)

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

  it('不正な形式(SQLインジェクションを試みる文字列等)のlinkIdを渡すと例外になる', () => {
    expect(() => buildLinkClicksSql("' OR '1'='1")).toThrow()
    expect(() => buildLinkClicksSql('abc; DROP TABLE link_clicks;')).toThrow()
    expect(() => buildLinkClicksSql('')).toThrow()
  })
})
