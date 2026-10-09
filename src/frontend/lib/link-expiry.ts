// 短縮URLの有効期限を、画面の選択肢(無期限・1か月後・3か月後・日付を指定)から
// APIに送る値へ変換する処理。
// 「指定日の23:59(日本時間)に期限切れ」にする(docs/architecture.mdの「画面ごとの確定仕様」・「API設計」)。
// ブラウザのタイムゾーンに依存しないよう、日付の計算はすべて日本時間(UTC+9)で行う

export type ExpiryChoice = 'none' | 'oneMonth' | 'threeMonths' | 'custom'

// 日本時間はUTC+9で夏時間が無いため、固定のオフセットで換算できる
const JST_OFFSET_MS = 9 * 60 * 60 * 1000

type JstDate = { year: number; month: number; day: number }

// toJstDate: 現在時刻を日本時間の年月日に直す(monthは1〜12)
function toJstDate(now: Date): JstDate {
  const jst = new Date(now.getTime() + JST_OFFSET_MS)
  return { year: jst.getUTCFullYear(), month: jst.getUTCMonth() + 1, day: jst.getUTCDate() }
}

function formatDateString({ year, month, day }: JstDate): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// getTodayJstDateString: 日本時間の今日をYYYY-MM-DDで返す(日付入力のmin属性に使う)。
// 今日を指定した場合も、その日の23:59は未来なので有効期限として選べる
export function getTodayJstDateString(now: Date = new Date()): string {
  return formatDateString(toJstDate(now))
}

// addMonthsToJstDateString: 日本時間の今日からnか月後の日付をYYYY-MM-DDで返す。
// 翌月に同じ日が無い場合(1/31の1か月後など)は、その月の末日にそろえる
export function addMonthsToJstDateString(months: number, now: Date = new Date()): string {
  const today = toJstDate(now)
  const monthIndex = today.year * 12 + (today.month - 1) + months
  const year = Math.floor(monthIndex / 12)
  const month = (monthIndex % 12) + 1
  // 翌月の0日=その月の末日
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return formatDateString({ year, month, day: Math.min(today.day, lastDayOfMonth) })
}

// toExpiresAt: YYYY-MM-DDを、その日の23:59:59.999(日本時間)を表すISO 8601文字列に変換する。
// APIのexpiresAtはオフセット付きISO 8601が必須のため、UTCのISO文字列にして送る
export function toExpiresAt(dateString: string): string {
  return new Date(`${dateString}T23:59:59.999+09:00`).toISOString()
}

// resolveExpiresAt: 選択肢と(日付を指定した場合の)日付から、APIに送るexpiresAtを決める。
// 無期限はnull。日付を指定が選ばれているのに日付が空の場合もnull(呼び出し側で必須入力にして防ぐ)
export function resolveExpiresAt(choice: ExpiryChoice, customDate: string, now: Date = new Date()): string | null {
  switch (choice) {
    case 'none':
      return null
    case 'oneMonth':
      return toExpiresAt(addMonthsToJstDateString(1, now))
    case 'threeMonths':
      return toExpiresAt(addMonthsToJstDateString(3, now))
    case 'custom':
      return customDate ? toExpiresAt(customDate) : null
  }
}
