/** @jsxImportSource react */
import { Link, useLoaderData } from 'react-router'
import type { z } from 'zod'
import { ButtonLink, buttonClassName } from '@/frontend/components/button'
import { Card } from '@/frontend/components/card'
import { Page } from '@/frontend/components/page'
import { ShortUrl } from '@/frontend/components/short-url'
import { apiClient } from '@/frontend/lib/api-client'
import { formatDateJst } from '@/frontend/lib/account-deletion'
import { getQrcodeDisplayName, getQrcodeImageUrl } from '@/frontend/lib/qrcode-display'
import type { qrcodeSchema } from '@/shared/schemas/qrcode'

type QrcodeListItem = z.infer<typeof qrcodeSchema>

// qrcodeListLoader: QRコード一覧画面の表示に必要な、ログインユーザーのQRコード一覧を取得するloader
export async function qrcodeListLoader() {
  const response = await apiClient.api.v1.qrcodes.$get()

  if (!response.ok) {
    throw new Response('QRコード一覧の取得に失敗しました', { status: response.status })
  }

  const body = await response.json()
  return { qrcodeListItems: body.items }
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v11" />
      <path d="M7 11l5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  )
}

// QrcodeTarget: 読み取り先の表示。短縮URL経由ならkyurl.link/コード、直接指定ならそのURL(長いときは省略)
function QrcodeTarget({ qrcode }: { qrcode: QrcodeListItem }) {
  if (qrcode.targetType === 'link' && qrcode.targetShortCode) {
    return <ShortUrl shortCode={qrcode.targetShortCode} />
  }
  // 紐づく短縮URLが見つからない場合も、読み取り先は不明として「-」を出す
  return qrcode.targetUrl ? (
    <span className="qrcode-target__url" title={qrcode.targetUrl}>
      {qrcode.targetUrl}
    </span>
  ) : (
    <span>-</span>
  )
}

// QrcodeKind: 種類(短縮URL経由=変更・集計できる / 元URLを直接=変更・集計できない)
function QrcodeKind({ qrcode }: { qrcode: QrcodeListItem }) {
  const isLink = qrcode.targetType === 'link'
  return (
    <span className="qrcode-kind">
      <span className="qrcode-kind__name">{isLink ? '短縮URL経由' : '元URLを直接'}</span>
      <span className="qrcode-kind__note">{isLink ? '変更・集計できる' : '変更・集計できない'}</span>
    </span>
  )
}

function PosterCount({ count }: { count: number }) {
  return <span>{count > 0 ? `${count}件` : 'なし'}</span>
}

// QrcodeDownloadLinks: PNG(1024px)・SVGのダウンロードリンク。一覧から画像だけをすぐ取りたい場面向けで、
// サイズを選びたい場合は詳細画面を使う
function QrcodeDownloadLinks({ qrcode }: { qrcode: QrcodeListItem }) {
  const displayName = getQrcodeDisplayName(qrcode)
  return (
    <>
      <a
        className={buttonClassName({ variant: 'secondary' })}
        href={getQrcodeImageUrl(qrcode.id, { format: 'png', size: 1024 })}
        download={`qrcode-${qrcode.id}.png`}
        aria-label={`${displayName}をPNGでダウンロード`}
      >
        <DownloadIcon />
        PNG
      </a>
      <a
        className={buttonClassName({ variant: 'secondary' })}
        href={getQrcodeImageUrl(qrcode.id, { format: 'svg' })}
        download={`qrcode-${qrcode.id}.svg`}
        aria-label={`${displayName}をSVGでダウンロード`}
      >
        <DownloadIcon />
        SVG
      </a>
    </>
  )
}

// QrCodeListPage: QRコード一覧画面(docs/mocks/QrList.html)。
// サムネイル・名前・読み取り先・種類・掲示物の件数・作成日を表示し、各行からPNG/SVGのダウンロードと詳細へ進める。
// 幅の広い画面は表、スマホ(768px以下)はカードの縦並びで表示する(切り替えはglobal.cssのメディアクエリ)
export function QrCodeListPage() {
  const { qrcodeListItems } = useLoaderData<typeof qrcodeListLoader>()

  const createButton = (
    <ButtonLink to="/app/qrcodes/new" variant="cta">
      <PlusIcon />
      新しいQRコードを作成
    </ButtonLink>
  )

  return (
    <Page title="QRコード一覧" description="短縮URL経由のQRと、元のURLを直接読み取るQRの両方を表示します。" actions={createButton}>
      {qrcodeListItems.length === 0 ? (
        <Card>
          <p>まだQRコードがありません。「新しいQRコードを作成」から作成してください。</p>
        </Card>
      ) : (
        <Card>
          <p className="list-summary">全{qrcodeListItems.length}件</p>
          <div className="qrcode-table">
            <div className="data-table__scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="visually-hidden">画像</span>
                    </th>
                    <th scope="col">名前</th>
                    <th scope="col">読み取り先</th>
                    <th scope="col">種類</th>
                    <th scope="col">掲示物</th>
                    <th scope="col">作成日</th>
                    <th scope="col">
                      <span className="visually-hidden">操作</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {qrcodeListItems.map((qrcodeListItem: QrcodeListItem) => (
                    <tr key={qrcodeListItem.id}>
                      <td>
                        <img className="qrcode-thumbnail" src={getQrcodeImageUrl(qrcodeListItem.id)} alt="" width={56} height={56} loading="lazy" />
                      </td>
                      <td>{getQrcodeDisplayName(qrcodeListItem)}</td>
                      <td className="data-table__cell--truncate">
                        <QrcodeTarget qrcode={qrcodeListItem} />
                      </td>
                      <td>
                        <QrcodeKind qrcode={qrcodeListItem} />
                      </td>
                      <td>
                        <PosterCount count={qrcodeListItem.posterCount} />
                      </td>
                      <td className="data-table__cell--number">{formatDateJst(qrcodeListItem.createdAt)}</td>
                      <td>
                        <div className="button-group">
                          <QrcodeDownloadLinks qrcode={qrcodeListItem} />
                          <Link to={`/app/qrcodes/${qrcodeListItem.id}`} className="detail-link">
                            詳細
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <ul className="qrcode-cards">
            {qrcodeListItems.map((qrcodeListItem: QrcodeListItem) => (
              <li key={qrcodeListItem.id} className="qrcode-card">
                <img className="qrcode-thumbnail" src={getQrcodeImageUrl(qrcodeListItem.id)} alt="" width={56} height={56} loading="lazy" />
                <div className="qrcode-card__body">
                  <p className="qrcode-card__name">{getQrcodeDisplayName(qrcodeListItem)}</p>
                  <QrcodeTarget qrcode={qrcodeListItem} />
                  <p className="qrcode-card__meta">
                    <QrcodeKind qrcode={qrcodeListItem} />
                    <span>掲示物 {qrcodeListItem.posterCount > 0 ? `${qrcodeListItem.posterCount}件` : 'なし'}</span>
                    <span>作成日 {formatDateJst(qrcodeListItem.createdAt)}</span>
                  </p>
                  <div className="button-group">
                    <QrcodeDownloadLinks qrcode={qrcodeListItem} />
                    <Link to={`/app/qrcodes/${qrcodeListItem.id}`} className="detail-link">
                      詳細
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Page>
  )
}
