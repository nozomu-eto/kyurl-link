// URLhaus SQL APIへの照会を打ち切るまでのデフォルトタイムアウト(ミリ秒)。
// POST /links(作成時チェック)がこの照会の完了を待つため、リクエスト全体が長時間
// ブロックされないよう短めに設定する
const DEFAULT_TIMEOUT_MS = 3000

// URLhaus(abuse.ch)が運営する悪意あるURLデータベースに、指定したURLが登録されているかを
// 照会する。docs/architecture.mdの「悪意あるURLの検知」・第11条2項の「外部の脅威データベースとの照合」に対応する。
//
// 戻り値:
// - 'listed': URLhausに登録されている(既知の悪意あるURL)
// - 'not_listed': URLhausに登録されていない
// - 'unknown': 照会自体が失敗・タイムアウトした(Auth-Key未設定・ネットワークエラー・
//   HTTPエラー・想定外のレスポンス形状等)。呼び出し元はこの場合、制約により必ずfail-open
//   (「不審」とはしない)として扱うこと。失敗自体はここでログに残す
export async function checkUrlAgainstUrlhaus(
  url: string,
  apiKey: string,
  options?: { timeoutMs?: number },
): Promise<'listed' | 'not_listed' | 'unknown'> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS

  // AbortControllerでタイムアウトを実装する。URLhaus側の応答が遅延・無応答の場合でも、
  // 呼び出し元(POST /links等)を長時間ブロックしないようにするため
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch('https://urlhaus-api.abuse.ch/v1/url/', {
      method: 'POST',
      headers: {
        'Auth-Key': apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ url }),
      signal: controller.signal,
    })

    if (!response.ok) {
      console.error(`URLhaus照会がHTTPエラーを返しました: status=${response.status}`)
      return 'unknown'
    }

    const result = await response.json<{ query_status: string }>()

    // query_status: 'ok'=登録あり(悪意あるURL) / 'no_results'=登録なし(問題なし) /
    // それ以外('invalid_url'・'http_post_expected'等)は想定外の応答としてfail-open扱いにする
    if (result.query_status === 'ok') {
      return 'listed'
    }
    if (result.query_status === 'no_results') {
      return 'not_listed'
    }

    console.error(`URLhaus照会が想定外のquery_statusを返しました: ${result.query_status}`)
    return 'unknown'
  } catch (error) {
    // AbortControllerによるタイムアウト、ネットワークエラー等はここに到達する。
    // 制約により必ずfail-openとするため例外を投げ直さず、失敗をログに残した上でunknownを返す
    console.error('URLhaus照会に失敗しました(タイムアウトまたはネットワークエラー)', error)
    return 'unknown'
  } finally {
    clearTimeout(timeoutId)
  }
}
