import { getJstDay } from '@/shared/jst'

// linkIdの形式チェック用正規表現。crypto.randomUUID()が生成するUUID形式(英数字とハイフンのみ)を想定する
const LINK_ID_PATTERN = /^[a-zA-Z0-9-]+$/

// GET /api/v1/links/:id/clicksのクエリdaysで指定できる値(docs/architecture.mdの「画面ごとの確定仕様」
// 「7日・30日・90日の切り替え(初期値30日)」)
export const LINK_CLICKS_DAYS_OPTIONS = [7, 30, 90] as const
export type LinkClicksDays = (typeof LINK_CLICKS_DAYS_OPTIONS)[number]

// 日別集計の日付の区切りに使うタイムゾーン。日本の利用者にとっての「1日」で数えるため、UTCではなく日本時間にする
export const LINK_CLICKS_TIME_ZONE = 'Asia/Tokyo'

// getLinkClicksStartDay: 直近days日(今日を含む)の最初の日付(日本時間、'YYYY-MM-DD')。
// 画面のグラフ(buildDailyClickSeries)が並べる範囲と同じ。これより前の日は集計に含めない
export function getLinkClicksStartDay(days: LinkClicksDays, now: Date = new Date()): string {
  return getJstDay(now, -(days - 1))
}

// GET /api/v1/links/:id/clicksで使う、Analytics Engine SQL API向けのクエリ文字列を組み立てる。
// 日別集計は日本時間の日付で区切る: formatDateTime(<datetime>, <format>, <timezone>)のタイムゾーン引数に
// 'Asia/Tokyo'を渡す(Cloudflare公式ドキュメント「Analytics Engine > SQL reference > Date and time functions」。
// formatDateTime/toStartOfIntervalだけがタイムゾーン引数を取り、toDate等には無いため、toDateは使わない)。
// timestampはUTC基準のため、日本時間の日付の境目(0時)をまたぐ集計をSQL側で厳密に絞ると書き方が複雑になる。
// そこで、SQLの範囲は実績のある「NOW() - INTERVAL」を1日分広げて取り、日本時間の開始日より前の日は
// 呼び出し元(src/routes/links.ts)が捨てる(getLinkClicksStartDay)。
// linkIdを直接SQL文字列へ埋め込むため、SQLインジェクション対策としてlinkIdが英数字と
// ハイフンのみで構成されるUUID形式であることを前提とし、念のため正規表現で検証する
// (不正な形式なら例外を投げる)。daysも同様にSQLへ直接埋め込むため、呼び出し元
// (src/routes/links.ts)でLINK_CLICKS_DAYS_OPTIONSの3値のいずれかであることを検証済みの値を
// 渡す前提とし、ここでも念のためLinkClicksDays型で制約する(文字列を直接埋め込まない)。
// DB・ネットワーク呼び出しを含まない純粋関数(文字列を組み立てるだけ)にすることで、
// 実際のSQL API呼び出しをせずにテストできるようにしている
export function buildLinkClicksSql(linkId: string, days: LinkClicksDays): string {
  if (!LINK_ID_PATTERN.test(linkId)) {
    throw new Error(`不正なlinkId形式です: ${linkId}`)
  }

  if (!LINK_CLICKS_DAYS_OPTIONS.includes(days)) {
    throw new Error(`不正なdays値です: ${days}`)
  }

  // 日本時間の開始日(0時)はUTCでは前日の15時になり、直近days日より最大1日前まで遡るため、1日広げて取る
  return `SELECT
  formatDateTime(timestamp, '%Y-%m-%d', '${LINK_CLICKS_TIME_ZONE}') AS day,
  SUM(_sample_interval) AS clicks
FROM link_clicks
WHERE index1 = '${linkId}'
  AND timestamp > NOW() - INTERVAL '${days + 1}' DAY
GROUP BY day
ORDER BY day
FORMAT JSON`
}
