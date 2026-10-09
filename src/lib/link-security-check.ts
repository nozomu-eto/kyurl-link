import { checkUrlHeuristics } from '@/lib/url-heuristics'
import { checkUrlAgainstUrlhaus } from '@/lib/urlhaus-client'

// 悪意あるURL検知(docs/architecture.md 第4節)の結果を表す型。links.securityStatusと対応する
export type LinkSecurityStatus = 'unscanned' | 'clean' | 'flagged'

// ヒューリスティックチェック→(必要なら)URLhaus照合、の順で1件のURLを検査し、
// links.securityStatusに保存する値を決定する。POST /links(作成時チェック)と
// 日次の全件スキャンの両方から共通で呼び出される。
//
// - ヒューリスティックで不審と判定された場合、URLhaus照会は行わずflaggedを返す
//   (既に不審と判定済みのため、追加のネットワーク呼び出しでリクエストを遅延させる必要がない)
// - ヒューリスティックを通過した場合のみURLhausに照会する。urlhausApiKeyが未設定(空文字・
//   undefined)の場合は照会自体を試みずunscannedを返す(fail-open。Auth-Key未登録のローカル
//   開発環境でも動作させるため)
// - URLhaus照会が'listed'ならflagged、'not_listed'ならclean、'unknown'(タイムアウト・
//   エラー)なら制約により必ずfail-openし、unscannedを返す
export async function determineLinkSecurityStatus(url: string, urlhausApiKey: string | undefined): Promise<LinkSecurityStatus> {
  const heuristicResult = checkUrlHeuristics(url)
  if (heuristicResult.flagged) {
    console.log(`ヒューリスティックにより不審と判定しました: ${url} (理由: ${heuristicResult.reasons.join(', ')})`)
    return 'flagged'
  }

  if (!urlhausApiKey) {
    console.log('URLHAUS_API_KEYが未設定のため、URLhaus照会をスキップしfail-openします')
    return 'unscanned'
  }

  const urlhausResult = await checkUrlAgainstUrlhaus(url, urlhausApiKey)
  if (urlhausResult === 'listed') {
    return 'flagged'
  }
  if (urlhausResult === 'not_listed') {
    return 'clean'
  }
  // 'unknown'(タイムアウト・エラー、失敗自体はcheckUrlAgainstUrlhaus内でログ済み)
  return 'unscanned'
}
