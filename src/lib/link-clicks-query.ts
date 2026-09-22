// linkIdの形式チェック用正規表現。crypto.randomUUID()が生成するUUID形式(英数字とハイフンのみ)を想定する
const LINK_ID_PATTERN = /^[a-zA-Z0-9-]+$/

// GET /api/v1/links/:id/clicksで使う、Analytics Engine SQL API向けのクエリ文字列を組み立てる。
// linkIdを直接SQL文字列へ埋め込むため、SQLインジェクション対策としてlinkIdが英数字と
// ハイフンのみで構成されるUUID形式であることを前提とし、念のため正規表現で検証する
// (不正な形式なら例外を投げる)。DB・ネットワーク呼び出しを含まない純粋関数(文字列を
// 組み立てるだけ)にすることで、実際のSQL API呼び出しをせずにテストできるようにしている
export function buildLinkClicksSql(linkId: string): string {
  if (!LINK_ID_PATTERN.test(linkId)) {
    throw new Error(`不正なlinkId形式です: ${linkId}`)
  }

  return `SELECT
  toDate(timestamp) AS day,
  SUM(_sample_interval) AS clicks
FROM link_clicks
WHERE index1 = '${linkId}'
  AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY day
ORDER BY day
FORMAT JSON`
}
