/** @jsxImportSource react */
import { useState } from 'react'
import { Link, useLoaderData, useNavigate } from 'react-router'
import type { z } from 'zod'
import { AlertMessage } from '@/frontend/components/alert-message'
import { Button, ButtonLink } from '@/frontend/components/button'
import { Card } from '@/frontend/components/card'
import { EmptyState } from '@/frontend/components/empty-state'
import { FormField } from '@/frontend/components/form-field'
import { Page } from '@/frontend/components/page'
import { PosterThumbnail } from '@/frontend/components/poster-thumbnail'
import { apiClient } from '@/frontend/lib/api-client'
import { formatDateJst } from '@/frontend/lib/account-deletion'
import { downloadPosterExport } from '@/frontend/lib/poster-export'
import { getCopiedPosterTitle } from '@/frontend/lib/poster-copy'
import { getQrcodeDisplayName } from '@/frontend/lib/qrcode-display'
import type { posterSchema } from '@/shared/schemas/poster'

type PosterListItem = z.infer<typeof posterSchema>

// 一度に表示する件数。続きは「さらに表示」で増やす(サムネイルの描画が多くなりすぎないようにする)
const PAGE_SIZE = 12

// posterListLoader: 掲示物一覧の表示に必要な、ログインユーザーの掲示物一覧を取得するloader
export async function posterListLoader() {
  const response = await apiClient.api.v1.posters.$get()

  if (!response.ok) {
    throw new Response('掲示物一覧の取得に失敗しました', { status: response.status })
  }

  const body = await response.json()
  return { posterListItems: body.items }
}

// リンクが使えない掲示物に添える注意書き(掲示してもQRコードが開けないため、一覧でも気づけるようにする)
const LINK_WARNING_TEXT: Partial<Record<PosterListItem['linkStatus'], string>> = {
  expired: 'リンクが期限切れです',
  suspended: 'リンクが停止中です',
  deleted: 'リンクが削除されています',
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

// PosterListPage: 掲示物一覧画面(docs/mocks/PosterList.html)。
// サムネイル・タイトル・サイズ・使っているQRコード・作成日を表示し、各掲示物からPDF/PNGの再ダウンロード・編集・複製ができる。
// 並びは作成日が新しい順(APIが並べて返す)。タイトル・QRコード名でキーワード絞り込みができる。
// サムネイルは画面に近づいたものだけ描画し(PosterThumbnail)、表示件数も一定数ずつ増やす
export function PosterListPage() {
  const { posterListItems } = useLoaderData<typeof posterListLoader>()
  const navigate = useNavigate()

  const [keyword, setKeyword] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  // 処理中の操作(例: `${掲示物のid}:pdf`・`${掲示物のid}:copy`)。同じ操作の二重実行を防ぐ
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const normalizedKeyword = keyword.trim().toLowerCase()
  const filteredItems = posterListItems.filter(
    (item: PosterListItem) =>
      normalizedKeyword === '' || item.title.toLowerCase().includes(normalizedKeyword) || getQrcodeDisplayName({ name: item.qrCodeName, createdAt: item.qrCodeCreatedAt }).toLowerCase().includes(normalizedKeyword),
  )
  const visibleItems = filteredItems.slice(0, visibleCount)

  async function handleExport(item: PosterListItem, format: 'pdf' | 'png') {
    // リンクが使えない掲示物は、編集画面と同じく書き出す前に確認する
    if (LINK_WARNING_TEXT[item.linkStatus] && !window.confirm(`${LINK_WARNING_TEXT[item.linkStatus]}。このまま書き出しますか?`)) {
      return
    }
    setErrorMessage(null)
    setBusyKey(`${item.id}:${format}`)
    // PDFは編集画面の既定と同じA4用紙に並べる形式で書き出す
    const result = await downloadPosterExport({ posterId: item.id, format, paper: 'a4', fileName: item.title })
    setBusyKey(null)
    if (!result.ok) {
      setErrorMessage(result.message)
    }
  }

  // 複製: 既存の掲示物と同じ内容(サイズ・QRコード・ひとことメッセージ)で、タイトルに「のコピー」を付けた掲示物を作り、
  // その編集画面へ移る(タイトルなどをすぐ直せるようにする)
  async function handleDuplicate(item: PosterListItem) {
    setErrorMessage(null)
    setBusyKey(`${item.id}:copy`)
    const response = await apiClient.api.v1.posters.$post({
      json: { title: getCopiedPosterTitle(item.title), subtitle: item.subtitle, size: item.size, qrCodeId: item.qrCodeId },
    })
    setBusyKey(null)

    if (!response.ok) {
      const body = await response.json().catch(() => null)
      setErrorMessage(body && 'error' in body && body.error?.message ? body.error.message : '複製に失敗しました')
      return
    }

    const created = await response.json()
    await navigate(`/app/posters/${created.id}`)
  }

  const createButton = (
    <ButtonLink to="/app/posters/new" variant="cta">
      <PlusIcon />
      新しい掲示物を作成
    </ButtonLink>
  )

  if (posterListItems.length === 0) {
    return (
      <Page title="掲示物一覧" description="作成した掲示物をもう一度ダウンロードしたり、複製して新しく作ったりできます。">
        <EmptyState
          title="まだ掲示物がありません"
          description="QRコードを選んで、店頭に貼れる掲示物を作成できます。"
          action={createButton}
        />
      </Page>
    )
  }

  return (
    <Page title="掲示物一覧" description="作成した掲示物をもう一度ダウンロードしたり、複製して新しく作ったりできます。" actions={createButton}>
      {errorMessage && <AlertMessage tone="error">{errorMessage}</AlertMessage>}
      <Card>
        <div className="poster-list__search">
          <FormField
            fieldId="poster-list-search"
            label="キーワードで絞り込み"
            inputProps={{ type: 'search', placeholder: 'タイトル・QRコード名', value: keyword, onChange: (e) => { setKeyword(e.target.value); setVisibleCount(PAGE_SIZE) } }}
          />
        </div>
        <p className="list-summary">
          全{filteredItems.length}件(作成日が新しい順)
        </p>
        {filteredItems.length === 0 ? (
          <p>条件に合う掲示物がありません。</p>
        ) : (
          <ul className="poster-grid">
            {visibleItems.map((item: PosterListItem) => (
              <li key={item.id} className="poster-card">
                <div className="poster-card__thumbnail">
                  <PosterThumbnail title={item.title} subtitle={item.subtitle} size={item.size} qrCodeId={item.qrCodeId} />
                </div>
                <div className="poster-card__body">
                  <p className="poster-card__title">{item.title}</p>
                  {item.subtitle && <p className="poster-card__subtitle">{item.subtitle}</p>}
                  <p className="poster-card__meta">
                    <span>{item.size}</span>
                    <span>QR:{getQrcodeDisplayName({ name: item.qrCodeName, createdAt: item.qrCodeCreatedAt })}</span>
                    <span>作成 {formatDateJst(item.createdAt)}</span>
                  </p>
                  {LINK_WARNING_TEXT[item.linkStatus] && <p className="poster-card__warning">{LINK_WARNING_TEXT[item.linkStatus]}</p>}
                  <div className="button-group">
                    <Button variant="outline" disabled={busyKey !== null} onClick={() => handleExport(item, 'pdf')} aria-label={`${item.title}をPDFでダウンロード`}>
                      PDF
                    </Button>
                    <Button variant="outline" disabled={busyKey !== null} onClick={() => handleExport(item, 'png')} aria-label={`${item.title}をPNGでダウンロード`}>
                      PNG
                    </Button>
                    <Link to={`/app/posters/${item.id}`} className="detail-link">
                      編集
                    </Link>
                    <Button variant="text" disabled={busyKey !== null} onClick={() => handleDuplicate(item)} aria-label={`${item.title}を複製して作る`}>
                      複製して作る
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {visibleItems.length < filteredItems.length && (
          <div className="poster-list__more">
            <Button variant="secondary" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
              さらに表示({filteredItems.length - visibleItems.length}件)
            </Button>
          </div>
        )}
      </Card>
    </Page>
  )
}
