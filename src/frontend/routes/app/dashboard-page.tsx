/** @jsxImportSource react */
import { useState } from 'react'
import { Link, useLoaderData } from 'react-router'
import { AccountDeletionBanner } from '@/frontend/components/account-deletion-banner'
import { apiClient } from '@/frontend/lib/api-client'
import { loadPendingDeletionRequest } from '@/frontend/lib/account-deletion'
import type { linkSchema } from '@/shared/schemas/link'
import type { z } from 'zod'
import { ButtonLink } from '@/frontend/components/button'
import { LinkStatusBadge } from '@/frontend/components/link-status-badge'
import { Page } from '@/frontend/components/page'
import { Toast } from '@/frontend/components/toast'

type LinkListItem = z.infer<typeof linkSchema>

// dashboardLoader: ダッシュボード表示に必要なlink一覧と、アカウント削除申請の状況
// (猶予期間中ならバナー表示に使う)を取得するloader。
//
// 申請状況(loadPendingDeletionRequest)の取得失敗は握りつぶし、null(バナーを出さない)
// として扱う。ダッシュボードでは申請状況はバナー表示のみに使う補助的な情報であり、
// これの取得に失敗しただけで本来の目的(短縮URL一覧の表示)まで巻き添えでエラーになるのは
// 適切ではないため。一方、アカウント設定画面(accountSettingsLoader)では申請状況そのものが
// 画面の主目的の情報のため、そちらは例外をそのまま投げてエラー画面にする(握りつぶさない)
export async function dashboardLoader() {
  const [linksResponse, pendingDeletionRequest] = await Promise.all([
    apiClient.api.v1.links.$get(),
    loadPendingDeletionRequest().catch((error: unknown) => {
      console.error('アカウント削除申請の状況取得に失敗しました', error)
      return null
    }),
  ])

  if (!linksResponse.ok) {
    throw new Response('短縮URL一覧の取得に失敗しました', { status: linksResponse.status })
  }

  const body = await linksResponse.json()
  return { linkListItems: body.items, pendingDeletionRequest }
}

// DashboardPage: ログインユーザーが作成した短縮URLの一覧画面(docs/architecture.md 第6.1節)。
// 各行から詳細画面(クリック統計・紐づくQRコード)へ遷移できる。アカウント削除の猶予期間中は
// 上部にAccountDeletionBannerを表示する(docs/architecture.md 第7.1節)。
//
// トーストはこの画面(バナーの親)側で持つ。取り消し成功後はloaderの再実行で申請が
// pendingでなくなりバナーごと取り除かれるため、トーストをバナーの中に持つと
// バナーが消えると同時にトーストまで消えてしまい、「取り消しました」が伝わらなくなる
export function DashboardPage() {
  const { linkListItems, pendingDeletionRequest } = useLoaderData<typeof dashboardLoader>()
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  return (
    <Page title="短縮URL一覧" actions={<ButtonLink to="/app/links/new" variant="cta">新しい短縮URLを作成</ButtonLink>}>
      {pendingDeletionRequest && (
        <AccountDeletionBanner
          scheduledDeletionAt={pendingDeletionRequest.scheduledDeletionAt}
          onCancelled={() => setToastMessage('削除を取り消しました')}
        />
      )}
      {linkListItems.length === 0 ? (
        <p>まだ短縮URLがありません。「新しい短縮URLを作成」から作成してください。</p>
      ) : (
        <div className="data-table__scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>短縮URL</th>
                <th>元URL</th>
                <th>状態</th>
                <th>有効期限</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {linkListItems.map((linkListItem: LinkListItem) => (
                <tr key={linkListItem.id}>
                  <td>{`${window.location.origin}/${linkListItem.shortCode}`}</td>
                  <td className="data-table__cell--truncate">{linkListItem.originalUrl}</td>
                  <td>
                    <LinkStatusBadge status={linkListItem.displayStatus} />
                  </td>
                  <td>{linkListItem.expiresAt ? new Date(linkListItem.expiresAt).toLocaleDateString('ja-JP') : '無期限'}</td>
                  <td>
                    <Link to={`/app/links/${linkListItem.id}`}>詳細</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {toastMessage && <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />}
    </Page>
  )
}
