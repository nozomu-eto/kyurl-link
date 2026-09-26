/** @jsxImportSource react */
import { Link, useLoaderData, useOutletContext } from 'react-router'
import { AlertMessage } from '@/frontend/components/alert-message'
import type { AuthUser } from '@/frontend/lib/auth-client'
import { apiClient } from '@/frontend/lib/api-client'
import { ButtonLink } from '@/frontend/components/button'
import { Card } from '@/frontend/components/card'
import { Page } from '@/frontend/components/page'

// accountSettingsLoader: アカウント設定画面の表示に必要な、直近のアカウント削除申請状況を取得する。
// GET /api/v1/account-requestsは、申請が無い場合404を返す仕様(docs/architecture.md 第7節)なので、
// 404は「申請なし」として扱い、エラーにはしない
export async function accountSettingsLoader() {
  const response = await apiClient.api.v1['account-requests'].$get()

  if (response.status === 404) {
    return { pendingDeletionRequest: null }
  }

  if (!response.ok) {
    throw new Response('アカウント削除申請の状況取得に失敗しました', { status: response.status })
  }

  const accountRequest = await response.json()
  return { pendingDeletionRequest: accountRequest.status === 'pending' ? accountRequest : null }
}

// 物理削除予定日時までの残り日数を、切り上げで計算する
// (「あと◯日で完全削除されます」の表示用。0日未満になることは無い想定だが、
// 表示上の安全のため最低0にクランプする)
function calculateRemainingDays(scheduledDeletionAt: string): number {
  const remainingMs = new Date(scheduledDeletionAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)))
}

// AccountSettingsPage: アカウント設定画面。ログイン中のメールアドレス表示と、
// アカウント削除申請の状態確認(申請中なら猶予期間の残り日数を表示)、
// 削除申請画面への導線を持つ
export function AccountSettingsPage() {
  const { pendingDeletionRequest } = useLoaderData<typeof accountSettingsLoader>()
  // AppLayoutのOutlet contextからログイン中ユーザー情報を受け取る(再度APIを呼ばずに済む)
  const { currentUser } = useOutletContext<{ currentUser: AuthUser }>()

  return (
    <Page title="アカウント設定">

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
            <AlertMessage tone="error">
              アカウント削除を申請中です。あと{calculateRemainingDays(pendingDeletionRequest.scheduledDeletionAt)}
              日でアカウントおよびすべてのデータが完全に削除されます。
            </AlertMessage>
            <p className="field__hint">
              削除を希望しない場合は、一度ログアウトしてから再度ログインしてください。ログインした時点で削除の申請が自動的に取り消されます。
            </p>
          </>
        ) : (
          <>
            <p className="field__hint">
              アカウントを削除すると、短縮URL・QRコード・掲示物を含むすべてのデータが利用できなくなります。7日間の猶予期間中はログインすることで取り消せます。
            </p>
            <ButtonLink to="/app/account/delete" variant="danger">
              アカウントを削除する
            </ButtonLink>
          </>
        )}
      </Card>
    </Page>
  )
}
