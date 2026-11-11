/** @jsxImportSource react */
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { type LoaderFunctionArgs, Link, useLoaderData, useLocation, useNavigate, useRevalidator } from 'react-router'
import { AlertMessage } from '@/frontend/components/alert-message'
import { Button, ButtonLink } from '@/frontend/components/button'
import { Card, FormCard } from '@/frontend/components/card'
import { EmptyState } from '@/frontend/components/empty-state'
import { Field, FormField, SelectField } from '@/frontend/components/form-field'
import { Page } from '@/frontend/components/page'
import { PosterPrintGuide } from '@/frontend/components/poster-print-guide'
import { PosterExportStoppedDialog } from '@/frontend/components/poster-export-stopped-dialog'
import { PosterExportStatus } from '@/frontend/components/poster-export-status'
import { PosterPreview } from '@/frontend/components/poster-preview'
import { RadioCardGroup } from '@/frontend/components/radio-card-group'
import { apiClient } from '@/frontend/lib/api-client'
import { downloadPosterExport } from '@/frontend/lib/poster-export'
import { getQrcodeDisplayName } from '@/frontend/lib/qrcode-display'
import { useQrcodeSvg } from '@/frontend/lib/use-qrcode-svg'
import { POSTER_SUBTITLE_MAX_LENGTH, POSTER_TITLE_MAX_LENGTH } from '@/shared/constants/input-limits'
import { getA4SheetMaxFaces, getPosterShortUrlText } from '@/shared/poster-template'

type PosterSize = 'A6' | 'A5'

// posterEditorLoader: 掲示物の作成・編集画面に必要な情報を取得するloader。
// - 編集(/app/posters/:posterId): 掲示物1件
// - 作成(/app/posters/new、/app/qrcodes/:qrCodeId/posters/new): 使うQRコードの初期値(URLのパラメータまたは?qrCodeId=)と、
//   用紙サイズの初期値(?size=A6|A5)
// どちらもQRコードの一覧(「使うQRコード」の選択肢)を取得する。
// 掲示物のリンクが期限切れ・停止中の場合は、書き出しの確認ダイアログに出す短縮URLの情報も取得する
export async function posterEditorLoader({ params, request }: LoaderFunctionArgs) {
  const searchParams = new URL(request.url).searchParams

  const [posterResponse, qrcodeListResponse] = await Promise.all([
    params.posterId ? apiClient.api.v1.posters[':id'].$get({ param: { id: params.posterId } }) : Promise.resolve(null),
    apiClient.api.v1.qrcodes.$get(),
  ])

  if (posterResponse && !posterResponse.ok) {
    throw new Response('指定された掲示物が見つかりません', { status: posterResponse.status })
  }
  if (!qrcodeListResponse.ok) {
    throw new Response('QRコード一覧の取得に失敗しました', { status: qrcodeListResponse.status })
  }

  const poster = posterResponse ? await posterResponse.json() : null
  const { items: qrcodes } = await qrcodeListResponse.json()

  let stoppedLink: { id: string; shortCode: string; expiresAt: string | null } | null = null
  if (poster && (poster.linkStatus === 'expired' || poster.linkStatus === 'suspended')) {
    const targetId = qrcodes.find((qrcode) => qrcode.id === poster.qrCodeId)?.targetId
    const linkResponse = targetId ? await apiClient.api.v1.links[':id'].$get({ param: { id: targetId } }) : null
    if (linkResponse?.ok) {
      const link = await linkResponse.json()
      stoppedLink = { id: link.id, shortCode: link.shortCode, expiresAt: link.expiresAt }
    }
  }

  const initialQrCodeId = params.qrCodeId ?? searchParams.get('qrCodeId') ?? qrcodes[0]?.id ?? ''
  const initialSize: PosterSize = searchParams.get('size') === 'A5' ? 'A5' : 'A6'

  return { poster, qrcodes, stoppedLink, initialQrCodeId, initialSize }
}

const SIZE_OPTIONS = [
  { value: 'A6', label: 'A6', description: 'はがきサイズ・卓上POP向け' },
  { value: 'A5', label: 'A5', description: 'A6の2倍・壁や入口向け' },
] as const

// PosterEditorPage: 掲示物の作成・編集画面(docs/mocks/PosterEditor.html・MobilePosterEdit.html・MobilePosterPreview.html)。
// 使うQRコード・タイトル・ひとことメッセージ・用紙サイズ(A6/A5)を入力し、プレビューで確認して、PDF/PNGで書き出す。
// プレビューは書き出しと同じテンプレート(shared/poster-template.ts)を画面で描画するため、Browser Renderingは使わない。
// PCは入力とプレビューを並べて表示し、スマホは「入力」「プレビュー・書き出し」のタブで切り替える
// (docs/architecture.mdの「画面ごとの確定仕様」)。
// 書き出しは保存済みの内容で行われるため、未保存の変更がある間は書き出せない
export function PosterEditorPage() {
  const { poster, qrcodes, stoppedLink, initialQrCodeId, initialSize } = useLoaderData<typeof posterEditorLoader>()
  const location = useLocation()
  const navigate = useNavigate()
  const revalidator = useRevalidator()

  const [qrCodeId, setQrCodeId] = useState(poster?.qrCodeId ?? initialQrCodeId)
  const [title, setTitle] = useState(poster?.title ?? '')
  const [subtitle, setSubtitle] = useState(poster?.subtitle ?? '')
  const [size, setSize] = useState<PosterSize>(poster?.size ?? initialSize)
  const [paper, setPaper] = useState<'a4' | 'fit'>('a4')
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>(() => new URLSearchParams(location.search).get('tab') === 'preview' ? 'preview' : 'edit')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // メール未確認(EMAIL_NOT_VERIFIED)・アカウント削除申請中(ACCOUNT_DELETION_PENDING)の場合のみ、導線を追加で出す
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const saveInProgress = useRef(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [exportingFormat, setExportingFormat] = useState<'pdf' | 'png' | null>(null)
  const [exportErrorMessage, setExportErrorMessage] = useState<string | null>(null)
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null)
  const [pendingStoppedExportFormat, setPendingStoppedExportFormat] = useState<'pdf' | 'png' | null>(null)

  const qrCodeSvg = useQrcodeSvg(qrCodeId)

  // 作成成功時は同じルート部品が再利用される場合もあるため、URLのタブ状態を反映する
  useEffect(() => {
    if (new URLSearchParams(location.search).get('tab') === 'preview') {
      setActiveTab('preview')
    }
  }, [location.pathname, location.search])

  // 掲示物に出す短縮URL。書き出し(サーバー)と同じく、QRコードに埋め込む内容(`{origin}/{shortCode}`)から
  // 共通の関数で作る。短縮URL経由でないQRコードでは出さない
  const selectedQrcode = qrcodes.find((qrcode) => qrcode.id === qrCodeId)
  const shortUrlText =
    selectedQrcode?.targetType === 'link' && selectedQrcode.targetShortCode
      ? getPosterShortUrlText('link', `${window.location.origin}/${selectedQrcode.targetShortCode}`)
      : null

  // 入力欄の内容と保存済みの内容が違う(=書き出しに反映されていない)かどうか。作成前は常に未保存
  const isDirty = poster === null || poster.qrCodeId !== qrCodeId || poster.title !== title || (poster.subtitle ?? '') !== subtitle || poster.size !== size
  const stoppedStatus = poster && (poster.linkStatus === 'expired' || poster.linkStatus === 'suspended') ? poster.linkStatus : null

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saveInProgress.current) return
    saveInProgress.current = true
    setErrorMessage(null)
    setErrorCode(null)
    setSuccessMessage(null)
    setIsSaving(true)

    const input = { qrCodeId, title, subtitle: subtitle || null, size }
    try {
      const response = poster
        ? await apiClient.api.v1.posters[':id'].$patch({ param: { id: poster.id }, json: input })
        : await apiClient.api.v1.posters.$post({ json: input })

      if (!response.ok) {
        // サーバーが返す{ error: { code, message } }をそのまま表示する
        const body = await response.json().catch(() => null)
        setErrorMessage(body && 'error' in body && body.error?.message ? body.error.message : '保存に失敗しました')
        setErrorCode(body && 'error' in body ? (body.error?.code ?? null) : null)
        return
      }

      if (!poster) {
        const created = await response.json()
        setActiveTab('preview')
        await navigate(`/app/posters/${created.id}?tab=preview`, { replace: true })
        return
      }

      setSuccessMessage('保存しました。PDFをダウンロードできます。')
      setExportSuccessMessage(null)
      setActiveTab('preview')
      revalidator.revalidate()
    } catch {
      setErrorMessage('保存に失敗しました。通信状況を確認して、もう一度お試しください')
    } finally {
      saveInProgress.current = false
      setIsSaving(false)
    }
  }

  async function handleDeleteClick() {
    if (!poster || !window.confirm('この掲示物を削除しますか?この操作は取り消せません。')) {
      return
    }

    setIsDeleting(true)
    const response = await apiClient.api.v1.posters[':id'].$delete({ param: { id: poster.id } })
    setIsDeleting(false)

    if (!response.ok) {
      setErrorMessage('削除に失敗しました')
      return
    }

    await navigate('/app/posters')
  }

  async function runExport(format: 'pdf' | 'png') {
    if (!poster) {
      return
    }
    setExportErrorMessage(null)
    setExportSuccessMessage(null)
    setExportingFormat(format)
    try {
      const result = await downloadPosterExport({ posterId: poster.id, format, paper, fileName: poster.title })
      if (!result.ok) {
        setExportErrorMessage(result.message)
      } else {
        setExportSuccessMessage(format === 'pdf' ? 'PDFをダウンロードしました。' : 'PNGをダウンロードしました。')
      }
    } catch {
      setExportErrorMessage('書き出しに失敗しました。時間をおいて、もう一度お試しください')
    } finally {
      setExportingFormat(null)
    }
  }

  // リンクが期限切れ・停止中の掲示物は、書き出す前に確認する
  function handleExportClick(format: 'pdf' | 'png') {
    if (stoppedStatus) {
      setPendingStoppedExportFormat(format)
      return
    }
    void runExport(format)
  }

  const paperOptions = [
    { value: 'a4', label: `A4用紙に${getA4SheetMaxFaces(size)}枚並べる(おすすめ)`, description: '切り取り線付き。家庭のプリンターやコンビニでそのまま印刷できます' },
    { value: 'fit', label: `${size}用紙にそのまま`, description: `${size}の用紙をお持ちの場合` },
  ] as const

  const exportDisabled = poster === null || isDirty || exportingFormat !== null

  // QRコードがない新規作成では、入力内容を持つフォームを出さず、先に必要な操作だけ案内する
  if (!poster && qrcodes.length === 0) {
    return (
      <Page title="掲示物を作成">
        <EmptyState
          title="QRコードを先に作成しましょう"
          description="掲示物に入れるQRコードを、先に作成しましょう。"
          action={<ButtonLink to="/app/qrcodes/new?from=poster" variant="cta">URLからQRコードを作る</ButtonLink>}
        />
      </Page>
    )
  }

  return (
    <Page title={poster ? `掲示物の編集(${poster.size}縦)` : '掲示物を作成'}>
      {errorMessage && (
        <AlertMessage tone="error">
          {errorMessage}
          {errorCode === 'EMAIL_NOT_VERIFIED' && (
            <>
              {' '}
              <Link to="/verify-email">メールアドレスの確認はこちら</Link>
            </>
          )}
          {errorCode === 'ACCOUNT_DELETION_PENDING' && (
            <>
              {' '}
              <Link to="/app/account">アカウント設定はこちら</Link>
            </>
          )}
        </AlertMessage>
      )}
      {successMessage && <AlertMessage tone="success">{successMessage}</AlertMessage>}

      {/* スマホ用のタブ。PCではCSSで隠し、入力とプレビューを並べて表示する */}
      <div className="poster-editor-tabs" role="tablist" aria-label="表示の切り替え" aria-orientation="horizontal" onKeyDown={(event) => {
        const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
        const currentIndex = tabs.indexOf(event.target as HTMLButtonElement)
        const nextIndex = event.key === 'ArrowRight' ? (currentIndex + 1) % tabs.length : event.key === 'ArrowLeft' ? (currentIndex - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1
        if (nextIndex >= 0) {
          event.preventDefault()
          tabs[nextIndex].focus()
          setActiveTab(nextIndex === 0 ? 'edit' : 'preview')
        }
      }}>
        <button type="button" role="tab" tabIndex={activeTab === 'edit' ? 0 : -1} id="poster-editor-tab-edit" aria-selected={activeTab === 'edit'} aria-controls="poster-editor-panel-edit" className="poster-editor-tabs__tab" onClick={() => setActiveTab('edit')}>
          入力
        </button>
        <button type="button" role="tab" tabIndex={activeTab === 'preview' ? 0 : -1} id="poster-editor-tab-preview" aria-selected={activeTab === 'preview'} aria-controls="poster-editor-panel-preview" className="poster-editor-tabs__tab" onClick={() => setActiveTab('preview')}>
          プレビュー・書き出し
        </button>
      </div>

      <div className="poster-editor-layout">
        <div className="poster-editor" data-active-tab={activeTab}>
        <div id="poster-editor-panel-edit" role="tabpanel" tabIndex={0} aria-labelledby="poster-editor-tab-edit" className="poster-editor__panel poster-editor__panel--edit">
          <FormCard onSubmit={handleSubmit}>
            {/* スマホでは、入力の合間に小さなプレビューを見せ、タップでプレビュー側のタブへ移る */}
            <button type="button" className="poster-editor__thumbnail" onClick={() => setActiveTab('preview')}>
              <span className="poster-editor__thumbnail-label">{size}・縦</span>
              <span>タップして大きく確認</span>
            </button>
            <SelectField
              fieldId="poster-editor-qrcode"
              label="使うQRコード"
              options={qrcodes.length === 0 ? [{ value: '', label: 'QRコードがありません' }] : qrcodes.map((qrcode) => ({ value: qrcode.id, label: getQrcodeDisplayName(qrcode) }))}
              hint={qrcodes.length === 0 ? '先にQRコードを作成してください' : undefined}
              selectProps={{ value: qrCodeId, required: true, onChange: (e) => setQrCodeId(e.target.value) }}
            />
            <FormField
              fieldId="poster-editor-title"
              label="タイトル(必須)"
              hint={`12文字以内だと遠くからでも読みやすくなります。(${title.length} / ${POSTER_TITLE_MAX_LENGTH})`}
              inputProps={{ type: 'text', required: true, maxLength: POSTER_TITLE_MAX_LENGTH, value: title, onChange: (e) => setTitle(e.target.value) }}
            />
            <Field fieldId="poster-editor-subtitle" label="ひとことメッセージ(任意)" hint={`${subtitle.length} / ${POSTER_SUBTITLE_MAX_LENGTH}`}>
              <textarea
                id="poster-editor-subtitle"
                className="field__input"
                rows={2}
                maxLength={POSTER_SUBTITLE_MAX_LENGTH}
                value={subtitle}
                // 掲示物ではひとことメッセージは1つの文として扱うため、改行は入れない
                onChange={(e) => setSubtitle(e.target.value.replace(/\r?\n/g, ''))}
              />
            </Field>
            <RadioCardGroup legend="用紙サイズ(縦向き)" name="poster-editor-size" options={SIZE_OPTIONS} value={size} onChange={setSize} />
            {isSaving && <p className="field__hint" role="status" aria-live="polite">保存しています。</p>}
            <div className="button-group">
              <Button type="submit" disabled={isSaving || qrcodes.length === 0}>
                {isSaving ? '保存中…' : poster ? '保存する' : '掲示物を作成'}
              </Button>
            </div>
          </FormCard>
          <div className="poster-editor__to-preview">
            <Button variant="secondary" onClick={() => setActiveTab('preview')}>
              プレビューで確認する
            </Button>
          </div>
        </div>

        <div id="poster-editor-panel-preview" role="tabpanel" tabIndex={0} aria-labelledby="poster-editor-tab-preview" className="poster-editor__panel poster-editor__panel--preview">
          <Card title={`プレビュー(${size}・縦)`}>
            <PosterPreview title={title} subtitle={subtitle} size={size} qrCodeSvg={qrCodeSvg} shortUrlText={shortUrlText} />
            <p className="field__hint">書き出しと同じ配置で表示しています。文字の書体は、書き出したPDF・PNGと少し異なることがあります。</p>
          </Card>

          <Card title="書き出し">
            <AlertMessage tone="warning">コンビニで印刷する場合は「A4用紙に並べる」を選んでください。コンビニのネットプリントで選べる普通紙はA3・A4・B4・B5だけで、サイズが違うと自動で拡大されてしまいます。</AlertMessage>
            <RadioCardGroup legend="PDFの用紙" name="poster-editor-paper" options={paperOptions} value={paper} onChange={setPaper} />
            {poster === null && <div className="poster-editor__save-guidance"><p className="field__hint">まだ保存されていないためPDFを作成できません。入力に戻って保存してください。</p><Button variant="secondary" onClick={() => setActiveTab('edit')}>入力に戻って保存する</Button></div>}
            {poster !== null && isDirty && <div className="poster-editor__save-guidance"><p className="field__hint">未保存の変更があるためPDFを作成できません。保存した内容で書き出します。</p><Button variant="secondary" onClick={() => setActiveTab('edit')}>入力に戻って保存する</Button></div>}
            {poster !== null && !isDirty && <p className="field__hint">保存済みです。PDFをダウンロードできます。</p>}
            {exportErrorMessage && <AlertMessage tone="error">{exportErrorMessage}</AlertMessage>}
            {exportSuccessMessage && <AlertMessage tone="success">{exportSuccessMessage}</AlertMessage>}
            {exportingFormat && <PosterExportStatus format={exportingFormat} />}
            <div className="button-group">
              <Button disabled={exportDisabled} onClick={() => handleExportClick('pdf')}>
                {exportingFormat === 'pdf' ? 'PDF生成中…' : 'PDFをダウンロード(印刷用)'}
              </Button>
              <Button variant="secondary" disabled={exportDisabled} onClick={() => handleExportClick('png')}>
                {exportingFormat === 'png' ? 'PNG生成中…' : 'PNGをダウンロード(SNS用)'}
              </Button>
            </div>
            <p className="field__hint">書き出しには数秒かかることがあります。PNGは用紙の指定に関係なく、掲示物1枚分の画像になります。</p>
            <PosterPrintGuide />
          </Card>

          {poster && (
            <div>
              <Button variant="danger-outline" disabled={isDeleting} onClick={handleDeleteClick}>
                {isDeleting ? '削除中…' : 'この掲示物を削除'}
              </Button>
            </div>
          )}
        </div>
        </div>
      </div>

      {stoppedStatus && (
        <PosterExportStoppedDialog
          isOpen={pendingStoppedExportFormat !== null}
          onClose={() => setPendingStoppedExportFormat(null)}
          link={stoppedLink}
          linkStatus={stoppedStatus}
          onExportAnyway={() => {
            const format = pendingStoppedExportFormat
            setPendingStoppedExportFormat(null)
            if (format) {
              void runExport(format)
            }
          }}
        />
      )}
    </Page>
  )
}
