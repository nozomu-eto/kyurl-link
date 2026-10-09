/** @jsxImportSource react */
import { useState } from 'react'
import { Link, useLoaderData } from 'react-router'
import { AccountDeletionBanner } from '@/frontend/components/account-deletion-banner'
import { apiClient } from '@/frontend/lib/api-client'
import { formatDateJst, loadPendingDeletionRequest } from '@/frontend/lib/account-deletion'
import type { linkSchema } from '@/shared/schemas/link'
import type { z } from 'zod'
import { ButtonLink } from '@/frontend/components/button'
import { CopyButton } from '@/frontend/components/copy-button'
import { EmptyState, type EmptyStateStep } from '@/frontend/components/empty-state'
import { LinkStatusBadge } from '@/frontend/components/link-status-badge'
import { Page } from '@/frontend/components/page'
import { ShortUrl } from '@/frontend/components/short-url'
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

// 0件のときに案内する3ステップ(docs/mocks/EmptyDashboard.html)
const EMPTY_STATE_STEPS: EmptyStateStep[] = [
  { label: 'STEP 1', title: 'URLを入力', text: 'お店のページのURLを貼り付けます' },
  { label: 'STEP 2', title: 'QRコードを作成', text: '白黒のQRコードができます' },
  { label: 'STEP 3', title: '掲示物を印刷', text: 'A6・A5のPDFで書き出せます' },
]

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 5l7 7-7 7" />
    </svg>
  )
}

// formatExpiresAt: 有効期限を日本時間のYYYY/MM/DDで表示する。無期限(null)は「無期限」
function formatExpiresAt(expiresAt: string | null): string {
  return expiresAt ? formatDateJst(expiresAt) : '無期限'
}

// DashboardPage: ログインユーザーが作成した短縮URLの一覧画面(docs/architecture.md 第6.1節・第6.7節、
// docs/mocks/Dashboard.html・EmptyDashboard.html・MobileDashboard.html)。
// 全行にコピーボタンと状態バッジ(displayStatus)を表示し、各行から詳細画面へ遷移できる。
// 幅の広い画面は表、スマホ(768px以下)はカードの縦並びで表示する(切り替えはglobal.cssのメディアクエリ)。
// アカウント削除の猶予期間中は上部にAccountDeletionBannerを表示する(docs/architecture.md 第7.1節)。
//
// トーストはこの画面(バナーの親)側で持つ。取り消し成功後はloaderの再実行で申請が
// pendingでなくなりバナーごと取り除かれるため、トーストをバナーの中に持つと
// バナーが消えると同時にトーストまで消えてしまい、「取り消しました」が伝わらなくなる
export function DashboardPage() {
  const { linkListItems, pendingDeletionRequest } = useLoaderData<typeof dashboardLoader>()
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const deletionBanner = pendingDeletionRequest && (
    <AccountDeletionBanner
      scheduledDeletionAt={pendingDeletionRequest.scheduledDeletionAt}
      onCancelled={() => setToastMessage('削除を取り消しました')}
    />
  )
  const toast = toastMessage && <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />

  // 0件のときは見出しの作成ボタンを出さず、案内内のボタンに一本化する
  if (linkListItems.length === 0) {
    return (
      <Page title="短縮URL一覧">
        {deletionBanner}
        <EmptyState
          icon={<LinkIcon />}
          title="まだ短縮URLがありません"
          description={
            <>
              案内したいページのURLを入力して、最初の短縮URLを作りましょう。
              <br />
              QRコードと掲示物も、続けて作成できます。
            </>
          }
          action={
            <ButtonLink to="/app/links/new" variant="cta" size="large">
              <PlusIcon />
              最初の短縮URLを作成
            </ButtonLink>
          }
          steps={EMPTY_STATE_STEPS}
        />
        {toast}
      </Page>
    )
  }

  return (
    <Page
      title="短縮URL一覧"
      description="作成した短縮URLの確認・コピー・状態の管理ができます。"
      actions={
        <ButtonLink to="/app/links/new" variant="cta">
          <PlusIcon />
          新しい短縮URLを作成
        </ButtonLink>
      }
    >
      {deletionBanner}
      <section className="card">
        <p className="list-summary">全{linkListItems.length}件</p>
        <div className="link-table">
          <div className="data-table__scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">短縮URL</th>
                  <th scope="col">元URL</th>
                  <th scope="col">状態</th>
                  <th scope="col">有効期限</th>
                  <th scope="col">
                    <span className="visually-hidden">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {linkListItems.map((linkListItem: LinkListItem) => (
                  <tr key={linkListItem.id}>
                    <td>
                      <div className="link-row__short-url">
                        <ShortUrl shortCode={linkListItem.shortCode} />
                        <CopyButton value={`${window.location.origin}/${linkListItem.shortCode}`} />
                      </div>
                    </td>
                    <td className="data-table__cell--truncate" title={linkListItem.originalUrl}>
                      {linkListItem.originalUrl}
                    </td>
                    <td>
                      <LinkStatusBadge status={linkListItem.displayStatus} />
                    </td>
                    <td className="data-table__cell--number">{formatExpiresAt(linkListItem.expiresAt)}</td>
                    <td className="data-table__cell--action">
                      <Link to={`/app/links/${linkListItem.id}`} className="detail-link">
                        詳細
                        <ChevronRightIcon />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <ul className="link-cards">
          {linkListItems.map((linkListItem: LinkListItem) => (
            <li key={linkListItem.id} className="link-card">
              <div className="link-card__header">
                <ShortUrl shortCode={linkListItem.shortCode} />
                <CopyButton compact value={`${window.location.origin}/${linkListItem.shortCode}`} />
              </div>
              <p className="link-card__original-url">{linkListItem.originalUrl}</p>
              <div className="link-card__footer">
                <div className="link-card__meta">
                  <LinkStatusBadge status={linkListItem.displayStatus} />
                  <span>期限 {formatExpiresAt(linkListItem.expiresAt)}</span>
                </div>
                <Link to={`/app/links/${linkListItem.id}`} className="detail-link">
                  詳細
                  <ChevronRightIcon />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>
      {toast}
    </Page>
  )
}
