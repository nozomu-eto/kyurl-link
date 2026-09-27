/** @jsxImportSource react */
import { useState } from 'react'
import { Link, useLoaderData, useOutletContext } from 'react-router'
import { AccountDeletionBanner } from '@/frontend/components/account-deletion-banner'
import { AlertMessage } from '@/frontend/components/alert-message'
import type { AuthUser } from '@/frontend/lib/auth-client'
import { formatDateJst, loadPendingDeletionRequest } from '@/frontend/lib/account-deletion'
import { useCancelAccountDeletion } from '@/frontend/lib/use-cancel-account-deletion'
import { Button, ButtonLink } from '@/frontend/components/button'
import { Card } from '@/frontend/components/card'
import { Page } from '@/frontend/components/page'
import { Toast } from '@/frontend/components/toast'

// accountSettingsLoader: アカウント設定画面の表示に必要な、直近のアカウント削除申請状況を取得する
export async function accountSettingsLoader() {
  const pendingDeletionRequest = await loadPendingDeletionRequest()
  return { pendingDeletionRequest }
}

// AccountSettingsPage: アカウント設定画面。ログイン中のメールアドレス表示と、
// アカウント削除申請の状態確認(申請中なら完全削除予定日・申請日と取り消しボタンを表示)、
// 削除申請画面への導線を持つ(docs/architecture.md 第7.1節、docs/mocks/AccountSettings.html)
export function AccountSettingsPage() {
  const { pendingDeletionRequest } = useLoaderData<typeof accountSettingsLoader>()
  // AppLayoutのOutlet contextからログイン中ユーザー情報を受け取る(再度APIを呼ばずに済む)
  const { currentUser } = useOutletContext<{ currentUser: AuthUser }>()

  const { cancel, isCancelling } = useCancelAccountDeletion()
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [cancelErrorMessage, setCancelErrorMessage] = useState<string | null>(null)

  // 「アカウントの削除」欄の取り消しボタンのクリックハンドラ。バナー側のボタンと
  // 同じuseCancelAccountDeletion(フック)を使い、処理内容を共有する
  async function handleCancelClick() {
    setCancelErrorMessage(null)
    const result = await cancel()

    if (result.outcome === 'cancelled') {
      setToastMessage('削除を取り消しました')
    } else if (result.outcome === 'grace-period-expired') {
      setCancelErrorMessage('猶予期間を過ぎているため、削除を取り消せません')
    } else if (result.outcome === 'error') {
      setCancelErrorMessage('取り消しに失敗しました。時間をおいて再度お試しください')
    }
  }

  return (
    <Page title="アカウント設定">
      {pendingDeletionRequest && (
        <AccountDeletionBanner
          scheduledDeletionAt={pendingDeletionRequest.scheduledDeletionAt}
          onCancelled={() => setToastMessage('削除を取り消しました')}
        />
      )}

      <Card>
        <p>
          <strong>メールアドレス:</strong> {currentUser.email}
        </p>
        <p>
          <strong>メール確認状況:</strong> {currentUser.emailVerified ? '確認済み' : <Link to="/verify-email">未確認(確認する)</Link>}
        </p>
      </Card>

      <Card title="アカウントの削除">
        {pendingDeletionRequest ? (
          <>
            <p>
              <span className="status-badge status-badge--suspended">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 6v12" />
                  <path d="M15 6v12" />
                </svg>
                削除予定
              </span>
              {' '}
              {formatDateJst(pendingDeletionRequest.scheduledDeletionAt)} に完全削除
            </p>
            <p className="field__hint">
              申請日:{formatDateJst(pendingDeletionRequest.requestedAt)}。完全に削除されると、短縮URL・QRコード・掲示物は元に戻せません。
            </p>
            {cancelErrorMessage && <AlertMessage tone="error">{cancelErrorMessage}</AlertMessage>}
            <Button variant="secondary" onClick={handleCancelClick} disabled={isCancelling}>
              {isCancelling ? '取り消し中…' : '削除を取り消す'}
            </Button>
          </>
        ) : (
          <>
            <p className="field__hint">
              アカウントを削除すると、短縮URL・QRコード・掲示物を含むすべてのデータが利用できなくなります。7日間の猶予期間中は、この画面から削除を取り消せます。
            </p>
            <ButtonLink to="/app/account/delete" variant="danger-outline">
              アカウントを削除する
            </ButtonLink>
          </>
        )}
      </Card>

      {toastMessage && <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />}
    </Page>
  )
}
