/** @jsxImportSource react */
import { Link, useLoaderData } from 'react-router'
import { apiClient } from '@/frontend/lib/api-client'
import type { linkSchema } from '@/shared/schemas/link'
import type { z } from 'zod'

type LinkListItem = z.infer<typeof linkSchema>

// dashboardLoader: ダッシュボード表示に必要なlink一覧を取得するloader。
// GET /api/v1/links(認証必須、ログインユーザー自身のlinkのみ)を呼び出す
export async function dashboardLoader() {
  const response = await apiClient.api.v1.links.$get()

  if (!response.ok) {
    throw new Response('短縮URL一覧の取得に失敗しました', { status: response.status })
  }

  const body = await response.json()
  return { linkListItems: body.items }
}

// linkのstatusを、一覧画面でそのまま表示するための日本語ラベルに変換する
function statusLabel(status: LinkListItem['status']): string {
  switch (status) {
    case 'active':
      return '有効'
    case 'expired':
      return '期限切れ'
    case 'suspended':
      return '停止中'
  }
}

// DashboardPage: ログインユーザーが作成した短縮URLの一覧画面(docs/architecture.md 第6.1節)。
// 各行から詳細画面(クリック統計・紐づくQRコード)へ遷移できる
export function DashboardPage() {
  const { linkListItems } = useLoaderData<typeof dashboardLoader>()

  return (
    <div className="page">
      <div className="page-header">
        <h1>短縮URL一覧</h1>
        <Link to="/app/links/new" className="button button--primary">
          新しい短縮URLを作成
        </Link>
      </div>

      {linkListItems.length === 0 ? (
        <p>まだ短縮URLがありません。「新しい短縮URLを作成」から作成してください。</p>
      ) : (
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
                  <span className={`status-badge status-badge--${linkListItem.status}`}>{statusLabel(linkListItem.status)}</span>
                </td>
                <td>{linkListItem.expiresAt ? new Date(linkListItem.expiresAt).toLocaleDateString('ja-JP') : '無期限'}</td>
                <td>
                  <Link to={`/app/links/${linkListItem.id}`}>詳細</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
