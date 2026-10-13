// 日本時間(Asia/Tokyo、UTC+9。夏時間なし)の日付を扱う共通処理。
// アクセス数の日別集計(サーバーのSQL・画面のグラフ)を日本時間の日付でそろえるために使う

const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

// getJstDay: 指定時刻の日本時間での日付を'YYYY-MM-DD'で返す(offsetDaysで何日前・後かをずらせる)。
// 日本時間は夏時間が無く常にUTC+9のため、9時間足してからUTCの暦で数えれば日本時間の暦になる
export function getJstDay(now: Date, offsetDays = 0): string {
  return new Date(now.getTime() + JST_OFFSET_MS + offsetDays * DAY_MS).toISOString().slice(0, 10)
}
