// クリック統計(GET /api/v1/links/:id/clicks)の表示用の整形処理。
// 画面のグラフ・平均値の計算を、描画から切り離してテストできるようにここに置く

export type DailyClick = { day: string; clicks: number }

// 集計期間の選択肢(APIのdaysクエリと同じ。docs/architecture.md 第6.7節。初期値は30日)
export const CLICK_STATS_DAYS_OPTIONS = [7, 30, 90] as const
export type ClickStatsDays = (typeof CLICK_STATS_DAYS_OPTIONS)[number]
export const DEFAULT_CLICK_STATS_DAYS: ClickStatsDays = 30

// parseClickStatsDays: URLのクエリ(?days=)の値を集計期間に直す。不正な値は初期値(30日)にする
export function parseClickStatsDays(value: string | null): ClickStatsDays {
  const days = Number(value)
  return CLICK_STATS_DAYS_OPTIONS.find((option) => option === days) ?? DEFAULT_CLICK_STATS_DAYS
}

// buildDailyClickSeries: APIが返す「クリックがあった日だけ」の配列を、直近days日分の
// 連続した日付の配列に広げる(クリックが無い日は0)。グラフで日付の抜けが出ないようにするため。
// APIはAnalytics EngineのtoDate(UTC基準)で日別に集計しているため、日付もUTCで数える。
// dayは'2026-09-25'または'2026-09-25 00:00:00'のどちらの形式でも先頭10文字(日付)で照合する
export function buildDailyClickSeries(dailyClicks: DailyClick[], days: number, now: Date = new Date()): DailyClick[] {
  const clicksByDay = new Map<string, number>()
  for (const { day, clicks } of dailyClicks) {
    const key = day.slice(0, 10)
    clicksByDay.set(key, (clicksByDay.get(key) ?? 0) + clicks)
  }

  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const series: DailyClick[] = []
  for (let offset = days - 1; offset >= 0; offset--) {
    const day = new Date(todayUtc - offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    series.push({ day, clicks: clicksByDay.get(day) ?? 0 })
  }
  return series
}

// pickChartMax: グラフの縦軸の上限を、最大値以上の「切りのよい値」(5, 10, 20, 50, 100, 200…)に決める。
// 最小は5(クリックが少ない・0件のときも目盛りが潰れないようにする)
export function pickChartMax(maxClicks: number): number {
  let magnitude = 1
  for (;;) {
    for (const base of [1, 2, 5]) {
      const candidate = base * magnitude
      if (candidate >= maxClicks && candidate >= 5) {
        return candidate
      }
    }
    magnitude *= 10
  }
}

// calculateAverageClicks: 1日あたりの平均クリック数(小数第1位まで)
export function calculateAverageClicks(totalClicks: number, days: number): number {
  return Math.round((totalClicks / days) * 10) / 10
}

// formatMonthDay: '2026-09-25'を'9/25'にする(グラフの横軸ラベル用)
export function formatMonthDay(day: string): string {
  const [, month, date] = day.slice(0, 10).split('-')
  return `${Number(month)}/${Number(date)}`
}
