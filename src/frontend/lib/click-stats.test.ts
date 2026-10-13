import { describe, expect, it } from 'vitest'
import { buildDailyClickSeries, calculateAverageClicks, formatMonthDay, parseClickStatsDays, pickChartMax } from '@/frontend/lib/click-stats'

describe('click-stats', () => {
  it('parseClickStatsDays: 7/30/90以外は30日にする', () => {
    expect(parseClickStatsDays('7')).toBe(7)
    expect(parseClickStatsDays('90')).toBe(90)
    expect(parseClickStatsDays('14')).toBe(30)
    expect(parseClickStatsDays(null)).toBe(30)
  })

  it('buildDailyClickSeries: 直近days日分を日付順に並べ、クリックの無い日は0にする', () => {
    const now = new Date('2026-09-25T10:00:00Z')
    const series = buildDailyClickSeries(
      [
        { day: '2026-09-25', clicks: 3 },
        { day: '2026-09-23 00:00:00', clicks: 2 },
        { day: '2026-01-01', clicks: 9 },
      ],
      7,
      now,
    )

    expect(series.map((item) => item.day)).toEqual([
      '2026-09-19',
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
    ])
    expect(series.map((item) => item.clicks)).toEqual([0, 0, 0, 0, 2, 0, 3])
  })

  it('buildDailyClickSeries: 「今日」は日本時間の日付で数える(UTCではまだ前日の15時以降でも、日本時間の翌日になる)', () => {
    // UTC 2026-09-24 15:30 = 日本時間 2026-09-25 00:30
    const series = buildDailyClickSeries([{ day: '2026-09-25', clicks: 4 }], 3, new Date('2026-09-24T15:30:00Z'))
    expect(series).toEqual([
      { day: '2026-09-23', clicks: 0 },
      { day: '2026-09-24', clicks: 0 },
      { day: '2026-09-25', clicks: 4 },
    ])
  })

  it('pickChartMax: 最大値以上の切りのよい値(最小5)を返す', () => {
    expect(pickChartMax(0)).toBe(5)
    expect(pickChartMax(5)).toBe(5)
    expect(pickChartMax(6)).toBe(10)
    expect(pickChartMax(11)).toBe(20)
    expect(pickChartMax(21)).toBe(50)
    expect(pickChartMax(51)).toBe(100)
    expect(pickChartMax(101)).toBe(200)
  })

  it('calculateAverageClicks: 小数第1位まで', () => {
    expect(calculateAverageClicks(145, 30)).toBe(4.8)
    expect(calculateAverageClicks(0, 7)).toBe(0)
  })

  it('formatMonthDay: 月/日にする', () => {
    expect(formatMonthDay('2026-09-05')).toBe('9/5')
  })
})
