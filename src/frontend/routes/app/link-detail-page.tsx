/** @jsxImportSource react */
import { useState } from 'react'
import { Link, type LoaderFunctionArgs, useLoaderData, useNavigate, useRevalidator, useSearchParams } from 'react-router'
import { AlertMessage } from '@/frontend/components/alert-message'
import { Button, ButtonLink, buttonClassName } from '@/frontend/components/button'
import { Card } from '@/frontend/components/card'
import { ChoiceButtonGroup } from '@/frontend/components/choice-button-group'
import { ClickChart } from '@/frontend/components/click-chart'
import { CopyButton } from '@/frontend/components/copy-button'
import { LinkDeleteDialog } from '@/frontend/components/link-delete-dialog'
import { LinkExpiryDialog } from '@/frontend/components/link-expiry-dialog'
import { LinkStatusBadge } from '@/frontend/components/link-status-badge'
import { Page } from '@/frontend/components/page'
import { ShortUrl } from '@/frontend/components/short-url'
import { SwitchField } from '@/frontend/components/switch-field'
import { Toast } from '@/frontend/components/toast'
import { formatDateJst } from '@/frontend/lib/account-deletion'
import { apiClient } from '@/frontend/lib/api-client'
import {
  buildDailyClickSeries,
  CLICK_STATS_DAYS_OPTIONS,
  calculateAverageClicks,
  type ClickStatsDays,
  parseClickStatsDays,
} from '@/frontend/lib/click-stats'

// linkDetailLoader: link詳細画面の表示に必要な3種類の情報をまとめて取得するloader。
// 1) link本体(GET /links/:id) 2) クリック統計(GET /links/:id/clicks。期間はURLの?days=で指定、初期値30日)
// 3) このlinkに紐づくQRコード一覧。qrcodesにはlink単位で絞り込むエンドポイントが無いため、
// ログインユーザーの全QRコード一覧を取得した上でフロント側でtargetId一致のものだけに絞る
// (バックエンドAPIは変更不可のスコープのため、この絞り込みはクライアント側で行う)
export async function linkDetailLoader({ params, request }: LoaderFunctionArgs) {
  const linkId = params.linkId
  if (!linkId) {
    throw new Response('linkIdが指定されていません', { status: 400 })
  }

  const days = parseClickStatsDays(new URL(request.url).searchParams.get('days'))

  const [linkResponse, clicksResponse, qrcodeListResponse] = await Promise.all([
    apiClient.api.v1.links[':id'].$get({ param: { id: linkId } }),
    // クリック統計のdaysクエリは、サーバー側がzodバリデータを通さず直接読んでいるため、
    // Hono RPCの型にはqueryが現れない。実行時は渡した値がそのままクエリ文字列になるので、型だけ合わせる
    apiClient.api.v1.links[':id'].clicks.$get({ param: { id: linkId }, query: { days: String(days) } } as { param: { id: string } }),
    apiClient.api.v1.qrcodes.$get(),
  ])

  if (!linkResponse.ok) {
    throw new Response('指定された短縮URLが見つかりません', { status: linkResponse.status })
  }

  const link = await linkResponse.json()
  // クリック統計の取得だけが失敗しても、画面全体はエラーにしない(統計欄でその旨を案内する)
  const clicks = clicksResponse.ok ? await clicksResponse.json() : null
  const qrcodeListBody = qrcodeListResponse.ok ? await qrcodeListResponse.json() : { items: [] }
  const relatedQrcodeItems = qrcodeListBody.items.filter((qrcodeItem) => qrcodeItem.targetType === 'link' && qrcodeItem.targetId === linkId)

  return { link, clicks, days, relatedQrcodeItems }
}

const CLICK_STATS_DAYS_CHOICES = CLICK_STATS_DAYS_OPTIONS.map((days) => ({ value: String(days), label: `${days}日` }))

function ExternalLinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
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

// LinkDetailPage: 短縮URL1件分の詳細画面(docs/mocks/LinkDetail.html・MobileLinkDetail.html)。
// 公開状態の切り替え(保存するのはstatusのactive/suspended、表示するのはdisplayStatus)・
// 有効期限の変更・クリック統計(7/30/90日)・紐づくQRコード・削除ができる
export function LinkDetailPage() {
  const { link, clicks, days, relatedQrcodeItems } = useLoaderData<typeof linkDetailLoader>()
  const navigate = useNavigate()
  const [, setSearchParams] = useSearchParams()
  // useRevalidator: PATCH成功後に画面を再描画するため、loaderを再実行してloaderDataを
  // 更新する。useNavigateでの遷移を伴わない「同じ画面のデータだけ更新したい」場面で使う
  const revalidator = useRevalidator()

  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [isExpiryDialogOpen, setIsExpiryDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isClickTableShown, setIsClickTableShown] = useState(false)

  const shortUrl = `${window.location.origin}/${link.shortCode}`
  // 運営により停止(moderationStatus === 'suspended')された場合、所有者は自分では公開状態を
  // 変更できないようにする(強制停止の解除を防ぐ仕様。docs/architecture.mdの「運営によるlinkの強制停止」)
  const isLockedByModeration = link.moderationStatus === 'suspended'

  // 公開状態のスイッチの変更ハンドラ。保存するのはstatus(active/suspended)で、
  // 期限切れ(displayStatus === 'expired')は有効期限から自動的に決まるため手動では選べない。
  // 変更内容を即座にPATCH /links/:idへ送信する(保存ボタンを別途設けない、その場で反映する方式)
  async function updateStatus(nextStatus: 'active' | 'suspended') {
    setErrorMessage(null)
    setIsUpdatingStatus(true)

    const response = await apiClient.api.v1.links[':id'].$patch({ param: { id: link.id }, json: { status: nextStatus } })

    setIsUpdatingStatus(false)

    if (!response.ok) {
      setErrorMessage('公開状態の更新に失敗しました')
      return
    }

    setToastMessage(nextStatus === 'active' ? '公開をオンにしました' : '公開をオフにしました')
    revalidator.revalidate()
  }

  // 有効期限の保存。ダイアログに失敗理由を表示させるため、失敗時はエラー文言を返す
  async function saveExpiresAt(expiresAt: string | null): Promise<string | null> {
    const response = await apiClient.api.v1.links[':id'].$patch({ param: { id: link.id }, json: { expiresAt } })

    if (!response.ok) {
      const body = await response.json()
      return 'error' in body ? body.error.message : '有効期限の変更に失敗しました'
    }

    setIsExpiryDialogOpen(false)
    setToastMessage('有効期限を変更しました')
    revalidator.revalidate()
    return null
  }

  // 削除(ソフトデリート。DELETE /links/:id)。確認ダイアログで承諾された後に呼ばれ、
  // 完了したらダッシュボードへ戻る
  async function handleDelete() {
    setDeleteErrorMessage(null)
    setIsDeleting(true)
    const response = await apiClient.api.v1.links[':id'].$delete({ param: { id: link.id } })
    setIsDeleting(false)

    if (!response.ok) {
      setDeleteErrorMessage('削除に失敗しました')
      return
    }

    await navigate('/app')
  }

  function handleDaysChange(value: string) {
    setSearchParams({ days: value }, { replace: true, preventScrollReset: true })
  }

  const clickSeries = clicks ? buildDailyClickSeries(clicks.dailyClicks, days) : []

  return (
    <Page title="短縮URLの詳細">
      {errorMessage && <AlertMessage tone="error">{errorMessage}</AlertMessage>}

      <Card>
        <div className="link-summary">
          <div className="link-summary__url">
            <span className="link-summary__label">短縮URL</span>
            <div className="link-summary__url-row">
              <ShortUrl shortCode={link.shortCode} />
              <LinkStatusBadge status={link.displayStatus} />
            </div>
          </div>
          <div className="button-group">
            <CopyButton value={shortUrl} />
            <ButtonLink variant="secondary" to={`/app/links/${link.id}/qrcodes/new`}>
              QRコードを作成
            </ButtonLink>
          </div>
        </div>
        <dl className="detail-list">
          <div className="detail-list__row">
            <dt>元URL</dt>
            <dd>
              <a href={link.originalUrl} target="_blank" rel="noopener noreferrer" className="detail-list__external-link">
                {link.originalUrl}
                <ExternalLinkIcon />
              </a>
            </dd>
          </div>
          <div className="detail-list__row">
            <dt>有効期限</dt>
            <dd>
              {link.expiresAt ? formatDateJst(link.expiresAt) : '無期限'}
              <Button variant="text" onClick={() => setIsExpiryDialogOpen(true)}>
                変更
              </Button>
            </dd>
          </div>
        </dl>
      </Card>

      <Card title="公開状態">
        <SwitchField
          label="リダイレクトを有効にする"
          checked={link.status === 'active'}
          disabled={isUpdatingStatus || isLockedByModeration}
          onChange={(checked) => updateStatus(checked ? 'active' : 'suspended')}
          description={
            <>
              オフにすると、このURLやQRコードを開いた人には「現在ご利用いただけません」と表示されます。いつでも再開できます。
              {isLockedByModeration ? (
                <strong className="switch-field__note">運営により停止されているため、変更できません。</strong>
              ) : link.displayStatus === 'expired' && link.status === 'active' ? (
                <strong className="switch-field__note">有効期限を過ぎているため、現在は「期限切れ」です。</strong>
              ) : (
                <span className="switch-field__note">有効期限を過ぎると、自動で「期限切れ」になります。</span>
              )}
            </>
          }
        />
      </Card>

      <Card
        title="クリック統計"
        actions={
          <ChoiceButtonGroup
            legend="集計期間"
            hideLegend
            options={CLICK_STATS_DAYS_CHOICES}
            value={String(days)}
            onChange={handleDaysChange}
          />
        }
      >
        {clicks === null ? (
          <p className="field__hint">クリック統計を取得できませんでした。時間をおいて開き直してください。</p>
        ) : (
          <>
            <div className="stats-summary">
              <div className="stats-summary__item">
                <span className="stats-summary__label">直近{days}日の合計</span>
                <span className="stats-summary__value">
                  <span className="stats-summary__number">{clicks.totalClicks}</span>回
                </span>
              </div>
              <div className="stats-summary__item">
                <span className="stats-summary__label">1日あたり平均</span>
                <span className="stats-summary__value">
                  <span className="stats-summary__number">{calculateAverageClicks(clicks.totalClicks, days)}</span>回
                </span>
              </div>
            </div>
            <ClickChart series={clickSeries} label={`直近${days}日の日別クリック数の棒グラフ`} />
            <p className="field__hint">
              クリック数は、おおむね90日分まで確認できます。
              <Button variant="text" aria-expanded={isClickTableShown} onClick={() => setIsClickTableShown((shown) => !shown)}>
                {isClickTableShown ? '表を閉じる' : '表形式で見る'}
              </Button>
            </p>
            {isClickTableShown && (
              <div className="data-table__scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">日付</th>
                      <th scope="col">クリック数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clicks.dailyClicks.map((dailyClickItem) => (
                      <tr key={dailyClickItem.day}>
                        <td>{dailyClickItem.day.slice(0, 10)}</td>
                        <td>{dailyClickItem.clicks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Card>

      <Card
        title={`紐づくQRコード(${relatedQrcodeItems.length}件)`}
        actions={
          <ButtonLink variant="secondary" to={`/app/links/${link.id}/qrcodes/new`}>
            QRコードを作成
          </ButtonLink>
        }
      >
        {relatedQrcodeItems.length === 0 ? (
          <p className="field__hint">まだQRコードがありません。</p>
        ) : (
          <ul className="qrcode-items">
            {relatedQrcodeItems.map((qrcodeItem) => {
              const qrcodeName = qrcodeItem.name ?? '名前なし'
              const imageUrl = `/api/v1/qrcodes/${qrcodeItem.id}/image`
              return (
                <li key={qrcodeItem.id} className="qrcode-item">
                  <img className="qrcode-item__image" src={imageUrl} alt="" width={72} height={72} />
                  <div className="qrcode-item__body">
                    <h3 className="qrcode-item__name">{qrcodeName}</h3>
                    <div className="button-group">
                      <a
                        className={buttonClassName({ variant: 'secondary' })}
                        href={`${imageUrl}?format=png&size=1024`}
                        download={`qrcode-${link.shortCode}.png`}
                        aria-label={`${qrcodeName}をPNGでダウンロード`}
                      >
                        <DownloadIcon />
                        PNG
                      </a>
                      <a
                        className={buttonClassName({ variant: 'secondary' })}
                        href={`${imageUrl}?format=svg`}
                        download={`qrcode-${link.shortCode}.svg`}
                        aria-label={`${qrcodeName}をSVGでダウンロード`}
                      >
                        <DownloadIcon />
                        SVG
                      </a>
                      <ButtonLink variant="outline" to={`/app/qrcodes/${qrcodeItem.id}/posters/new`}>
                        掲示物を作成
                      </ButtonLink>
                    </div>
                    <Link to={`/app/qrcodes/${qrcodeItem.id}`}>名前の変更・詳細</Link>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <div>
        <Button
          variant="danger-outline"
          onClick={() => {
            setDeleteErrorMessage(null)
            setIsDeleteDialogOpen(true)
          }}
        >
          この短縮URLを削除
        </Button>
      </div>

      {/* ダイアログは開くたびに初期状態から始めたいので、開いている間だけ描画する */}
      {isExpiryDialogOpen && (
        <LinkExpiryDialog isOpen onClose={() => setIsExpiryDialogOpen(false)} link={link} onSave={saveExpiresAt} />
      )}
      <LinkDeleteDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        link={link}
        qrcodeCount={relatedQrcodeItems.length}
        canSuspendInstead={link.status === 'active' && !isLockedByModeration}
        isDeleting={isDeleting}
        errorMessage={deleteErrorMessage}
        onDelete={handleDelete}
        onSuspendInstead={() => {
          setIsDeleteDialogOpen(false)
          void updateStatus('suspended')
        }}
      />
      {toastMessage && <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />}
    </Page>
  )
}
