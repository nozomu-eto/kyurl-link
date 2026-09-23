/** @jsxImportSource react */
import { type ChangeEvent, useState } from 'react'
import { Link, type LoaderFunctionArgs, useLoaderData, useNavigate, useRevalidator } from 'react-router'
import { AlertMessage } from '@/frontend/components/alert-message'
import { apiClient, bypassPatchInputTypeCheck } from '@/frontend/lib/api-client'

// linkDetailLoader: link詳細画面の表示に必要な3種類の情報をまとめて取得するloader。
// 1) link本体(GET /links/:id) 2) クリック統計(GET /links/:id/clicks)
// 3) このlinkに紐づくQRコード一覧。qrcodesにはlink単位で絞り込むエンドポイントが無いため、
// ログインユーザーの全QRコード一覧を取得した上でフロント側でtargetId一致のものだけに絞る
// (バックエンドAPIは変更不可のスコープのため、この絞り込みはクライアント側で行う)
export async function linkDetailLoader({ params }: LoaderFunctionArgs) {
  const linkId = params.linkId
  if (!linkId) {
    throw new Response('linkIdが指定されていません', { status: 400 })
  }

  const [linkResponse, clicksResponse, qrcodeListResponse] = await Promise.all([
    apiClient.api.v1.links[':id'].$get({ param: { id: linkId } }),
    apiClient.api.v1.links[':id'].clicks.$get({ param: { id: linkId } }),
    apiClient.api.v1.qrcodes.$get(),
  ])

  if (!linkResponse.ok) {
    throw new Response('指定された短縮URLが見つかりません', { status: linkResponse.status })
  }

  const link = await linkResponse.json()
  const clicks = clicksResponse.ok ? await clicksResponse.json() : { totalClicks: 0, dailyClicks: [] }
  const qrcodeListBody = qrcodeListResponse.ok ? await qrcodeListResponse.json() : { items: [] }
  const relatedQrcodeItems = qrcodeListBody.items.filter((qrcodeItem) => qrcodeItem.targetType === 'link' && qrcodeItem.targetId === linkId)

  return { link, clicks, relatedQrcodeItems }
}

// LinkDetailPage: 短縮URL1件分の詳細画面。クリック統計・紐づくQRコード一覧の確認、
// 状態(有効/期限切れ/停止)の変更、削除ができる
export function LinkDetailPage() {
  const { link, clicks, relatedQrcodeItems } = useLoaderData<typeof linkDetailLoader>()
  const navigate = useNavigate()
  // useRevalidator: PATCH成功後に画面を再描画するため、loaderを再実行してloaderDataを
  // 更新する。useNavigateでの遷移を伴わない「同じ画面のデータだけ更新したい」場面で使う
  const revalidator = useRevalidator()

  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // 状態(active/expired/suspended)のセレクトボックス変更ハンドラ。
  // 変更内容を即座にPATCH /links/:idへ送信する(保存ボタンを別途設けない、その場で反映する方式)
  async function handleStatusChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextStatus = event.target.value as 'active' | 'expired' | 'suspended'
    setErrorMessage(null)
    setIsUpdatingStatus(true)

    const response = await apiClient.api.v1.links[':id'].$patch(
      bypassPatchInputTypeCheck({ param: { id: link.id }, json: { status: nextStatus } }),
    )

    setIsUpdatingStatus(false)

    if (!response.ok) {
      setErrorMessage('状態の更新に失敗しました')
      return
    }

    revalidator.revalidate()
  }

  // 削除ボタンのクリックハンドラ。ソフトデリート(DELETE /links/:id)を行い、
  // 完了したらダッシュボードへ戻る。取り消せない操作のため、ブラウザ標準のconfirmで確認する
  async function handleDeleteClick() {
    if (!window.confirm('この短縮URLを削除しますか?この操作は取り消せません。')) {
      return
    }

    setIsDeleting(true)
    const response = await apiClient.api.v1.links[':id'].$delete({ param: { id: link.id } })
    setIsDeleting(false)

    if (!response.ok) {
      setErrorMessage('削除に失敗しました')
      return
    }

    await navigate('/app')
  }

  return (
    <div className="page">
      <h1>短縮URLの詳細</h1>
      {errorMessage && <AlertMessage tone="error">{errorMessage}</AlertMessage>}

      <section className="card">
        <p>
          <strong>短縮URL:</strong> {`${window.location.origin}/${link.shortCode}`}
        </p>
        <p>
          <strong>元URL:</strong> {link.originalUrl}
        </p>
        <p>
          <strong>有効期限:</strong> {link.expiresAt ? new Date(link.expiresAt).toLocaleDateString('ja-JP') : '無期限'}
        </p>
        <div className="field field--narrow">
          <label className="field__label" htmlFor="link-detail-status">
            状態
          </label>
          <select id="link-detail-status" className="field__input" value={link.status} disabled={isUpdatingStatus} onChange={handleStatusChange}>
            <option value="active">有効</option>
            <option value="expired">期限切れ</option>
            <option value="suspended">停止中</option>
          </select>
        </div>
        <button type="button" className="button button--danger" disabled={isDeleting} onClick={handleDeleteClick}>
          {isDeleting ? '削除中…' : 'この短縮URLを削除'}
        </button>
      </section>

      <section className="card">
        <h2 className="card__title">クリック統計</h2>
        <p>
          合計クリック数: <strong>{clicks.totalClicks}</strong>
        </p>
        {clicks.dailyClicks.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>日付</th>
                <th>クリック数</th>
              </tr>
            </thead>
            <tbody>
              {clicks.dailyClicks.map((dailyClickItem) => (
                <tr key={dailyClickItem.day}>
                  <td>{dailyClickItem.day}</td>
                  <td>{dailyClickItem.clicks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <div className="card__header">
          <h2 className="card__title">紐づくQRコード</h2>
          <button type="button" className="button button--secondary" onClick={() => navigate(`/app/links/${link.id}/qrcodes/new`)}>
            QRコードを作成
          </button>
        </div>
        {relatedQrcodeItems.length === 0 ? (
          <p className="field__hint">まだQRコードがありません。</p>
        ) : (
          <ul>
            {relatedQrcodeItems.map((qrcodeItem) => (
              <li key={qrcodeItem.id}>
                <Link to={`/app/qrcodes/${qrcodeItem.id}`}>QRコード({qrcodeItem.id.slice(0, 8)})</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
