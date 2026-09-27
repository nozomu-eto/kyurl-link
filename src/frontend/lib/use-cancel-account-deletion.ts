import { useState } from 'react'
import { useRevalidator } from 'react-router'
import { apiClient } from '@/frontend/lib/api-client'

export type CancelAccountDeletionResult =
  | { outcome: 'cancelled' }
  | { outcome: 'already-cancelled' }
  | { outcome: 'grace-period-expired' }
  | { outcome: 'error' }

// useCancelAccountDeletion: 「削除を取り消す」ボタン(AccountDeletionBanner・
// アカウント設定画面の「アカウントの削除」欄の両方)が共有する取り消し処理
// (docs/architecture.md 第7.1節)。POST /api/v1/account-requests/cancelを呼び出し、
// 結果を呼び出し元が文言に変換できるよう、discriminated unionで返す
export function useCancelAccountDeletion() {
  const revalidator = useRevalidator()
  const [isCancelling, setIsCancelling] = useState(false)

  async function cancel(): Promise<CancelAccountDeletionResult> {
    setIsCancelling(true)
    const response = await apiClient.api.v1['account-requests'].cancel.$post()
    setIsCancelling(false)

    if (response.ok) {
      // 取り消し後は画面の表示(バナー等)を最新にするため、loaderを再実行する
      revalidator.revalidate()
      return { outcome: 'cancelled' }
    }

    if (response.status === 404) {
      // 別タブ等で既に取り消し済みの場合。エラーではなく、最新の状態(申請なし)に
      // 合わせて画面を更新するだけでよい
      revalidator.revalidate()
      return { outcome: 'already-cancelled' }
    }

    if (response.status === 409) {
      return { outcome: 'grace-period-expired' }
    }

    return { outcome: 'error' }
  }

  return { cancel, isCancelling }
}
