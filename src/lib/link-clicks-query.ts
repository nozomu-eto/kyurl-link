// linkIdの形式チェック用正規表現。crypto.randomUUID()が生成するUUID形式(英数字とハイフンのみ)を想定する
const LINK_ID_PATTERN = /^[a-zA-Z0-9-]+$/

// GET /api/v1/links/:id/clicksのクエリdaysで指定できる値(docs/architecture.md 第6.7節
// 「7日・30日・90日の切り替え(初期値30日)」)
export const LINK_CLICKS_DAYS_OPTIONS = [7, 30, 90] as const
export type LinkClicksDays = (typeof LINK_CLICKS_DAYS_OPTIONS)[number]

// GET /api/v1/links/:id/clicksで使う、Analytics Engine SQL API向けのクエリ文字列を組み立てる。
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

  return `SELECT
  toDate(timestamp) AS day,
  SUM(_sample_interval) AS clicks
FROM link_clicks
WHERE index1 = '${linkId}'
  AND timestamp > NOW() - INTERVAL '${days}' DAY
GROUP BY day
ORDER BY day
FORMAT JSON`
}
