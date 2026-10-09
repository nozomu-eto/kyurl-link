import { apiClient } from '@/frontend/lib/api-client'

// アカウント削除申請の猶予期間表示に関する共通の計算(docs/architecture.mdの「アカウント削除・データ削除の実装フロー」)。
// AccountDeletionBanner・アカウント設定画面(account-settings-page.tsx)の両方で使うため共通化する

// loadPendingDeletionRequest: 直近のアカウント削除申請のうち、status: 'pending'のものを
// 取得する(無ければnull)。GET /api/v1/account-requestsは申請自体が無い場合404を返す仕様
// (docs/architecture.mdの「API設計」)のため、404は「申請なし」として扱いエラーにはしない。
// 200・404以外(サーバーエラー等)の場合はResponseをthrowする。
// dashboardLoader・accountSettingsLoaderの両方から呼ぶための共通処理。
//
// 呼び出し側での例外の扱いが異なる点に注意: dashboardLoaderでは申請状況はバナー表示のみに
// 使う補助的な情報のため、この関数が投げた例外を握りつぶし短縮URL一覧だけは表示する
// (バナーを出さないだけにする)。accountSettingsLoaderでは申請状況そのものが画面の主目的の
// 情報のため、例外はそのまま投げてエラー画面にする(dashboard-page.tsxのコメントも参照)。
//
// 親のrequireSessionLoader(app-layout.tsx)には入れない: React Routerは画面間の移動では
// 親のloaderを再実行しないため、親に入れてしまうと、取り消し後や別タブでの操作の後に
// 古い申請状況が表示され続けてしまう(各画面のloaderで毎回取り直す必要がある)
export async function loadPendingDeletionRequest() {
  const response = await apiClient.api.v1['account-requests'].$get()

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Response('アカウント削除申請の状況取得に失敗しました', { status: response.status })
  }

  const accountRequest = await response.json()
  return accountRequest.status === 'pending' ? accountRequest : null
}

// calculateRemainingDays: 物理削除予定日時(scheduledDeletionAt)までの残り日数を切り上げで計算する。
// 「あと◯日で完全削除されます」の表示用。0日未満になることは無い想定だが、
// 表示上の安全のため最低0にクランプする
export function calculateRemainingDays(scheduledDeletionAt: string): number {
  const remainingMs = new Date(scheduledDeletionAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)))
}

// formatDateJst: ISO文字列の日時を、日本時間(Asia/Tokyo)のYYYY/MM/DD形式で表示する。
// サーバーから返る日時はUTC基準のISO文字列のため、表示前に必ず日本時間へ変換する
export function formatDateJst(isoString: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoString))
}
