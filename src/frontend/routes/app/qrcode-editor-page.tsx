/** @jsxImportSource react */
import { type FormEvent, useState } from 'react'
import { type LoaderFunctionArgs, Link, useLoaderData, useNavigate } from 'react-router'
import { AlertMessage } from '@/frontend/components/alert-message'
import { apiClient } from '@/frontend/lib/api-client'
import { Button, ButtonLink, buttonClassName } from '@/frontend/components/button'
import { Card } from '@/frontend/components/card'
import { FormField, SelectField } from '@/frontend/components/form-field'
import { Page } from '@/frontend/components/page'
import { RadioCardGroup } from '@/frontend/components/radio-card-group'
import { ShortUrl } from '@/frontend/components/short-url'
import { DEFAULT_QRCODE_PNG_SIZE, getQrcodeDisplayName, getQrcodeImageUrl, QRCODE_PNG_SIZE_OPTIONS } from '@/frontend/lib/qrcode-display'
import { QRCODE_NAME_MAX_LENGTH } from '@/shared/constants/input-limits'

// qrcodeEditorLoader: QRコード詳細画面の表示に必要なqrcode1件分を取得するloader
export async function qrcodeEditorLoader({ params }: LoaderFunctionArgs) {
  const qrCodeId = params.qrCodeId
  if (!qrCodeId) {
    throw new Response('qrCodeIdが指定されていません', { status: 400 })
  }

  const response = await apiClient.api.v1.qrcodes[':id'].$get({ param: { id: qrCodeId } })
  if (!response.ok) {
    throw new Response('指定されたQRコードが見つかりません', { status: response.status })
  }

  return { qrcode: await response.json() }
}

// ダウンロード形式の選択肢(docs/mocks/QrDetail.html)
const DOWNLOAD_FORMAT_OPTIONS = [
  { value: 'png', label: 'PNG', description: '画像・SNS向け' },
  { value: 'svg', label: 'SVG', description: '印刷・拡大向け' },
] as const

const PNG_SIZE_SELECT_OPTIONS = QRCODE_PNG_SIZE_OPTIONS.map((size) => ({
  value: String(size),
  label: `${size} × ${size} px${size === DEFAULT_QRCODE_PNG_SIZE ? '(おすすめ)' : ''}`,
}))

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v11" />
      <path d="M7 11l5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  )
}

// QrCodeEditorPage: QRコード1件の詳細画面(docs/mocks/QrDetail.html)。
// 画像のプレビューと読み取り先、ダウンロード(PNG: 512 / 1024 / 2048px、SVG)、
// 管理用の名前の保存、A6/A5での掲示物作成への導線、削除を持つ。
// QRコードは読み取りやすさを優先し、白地に黒で出力する方針(docs/architecture.mdの「画面ごとの確定仕様」)のため、
// 色の変更機能(前景色・背景色)は提供しない
export function QrCodeEditorPage() {
  const { qrcode } = useLoaderData<typeof qrcodeEditorLoader>()
  const navigate = useNavigate()

  const [name, setName] = useState(qrcode.name ?? '')
  // 保存済みの名前。「変更を取り消す」で戻す先と、変更の有無の判定に使う
  const [savedName, setSavedName] = useState(qrcode.name ?? '')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [downloadFormat, setDownloadFormat] = useState<'png' | 'svg'>('png')
  const [pngSize, setPngSize] = useState<number>(DEFAULT_QRCODE_PNG_SIZE)

  const displayName = getQrcodeDisplayName({ name: savedName.trim() === '' ? null : savedName.trim(), createdAt: qrcode.createdAt })
  const isNameChanged = name !== savedName

  async function handleNameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)
    setIsSaving(true)

    const response = await apiClient.api.v1.qrcodes[':id'].$patch({ param: { id: qrcode.id }, json: { name } })

    setIsSaving(false)

    if (!response.ok) {
      // 作成画面(qrcode-create-page.tsx等)と同様、サーバーが返す{ error: { message } }を
      // そのまま表示する(429時の「リクエストが多すぎます…」等もこのmessageに含まれるため、
      // 個別のステータスコード分岐は不要)。JSONでない・messageが無い場合のみ固定文言にする
      const body = await response.json().catch(() => null)
      setErrorMessage(body && 'error' in body && body.error?.message ? body.error.message : '名前の保存に失敗しました')
      return
    }

    // サーバー側で前後の空白の除去・空文字のnull化をしているため、保存後の値で入力欄を揃える
    const saved = await response.json()
    setName(saved.name ?? '')
    setSavedName(saved.name ?? '')
    setSuccessMessage('名前を保存しました')
  }

  async function handleDeleteClick() {
    if (!window.confirm('このQRコードを削除しますか?この操作は取り消せません。')) {
      return
    }

    setIsDeleting(true)
    const response = await apiClient.api.v1.qrcodes[':id'].$delete({ param: { id: qrcode.id } })
    setIsDeleting(false)

    if (!response.ok) {
      setErrorMessage('削除に失敗しました')
      return
    }

    await navigate('/app/qrcodes')
  }

  const downloadUrl = getQrcodeImageUrl(qrcode.id, downloadFormat === 'png' ? { format: 'png', size: pngSize } : { format: 'svg' })

  return (
    <Page title={`${displayName}のQRコード`}>
      {errorMessage && <AlertMessage tone="error">{errorMessage}</AlertMessage>}
      {successMessage && <AlertMessage tone="success">{successMessage}</AlertMessage>}

      <div className="qrcode-detail">
        <Card className="qrcode-detail__preview">
          {/* GET /api/v1/qrcodes/:id/imageは認証不要の公開エンドポイントなので、
              そのまま<img src>に指定してSVGを表示できる */}
          <img className="qrcode-detail__image" src={getQrcodeImageUrl(qrcode.id)} alt={`${displayName}のQRコード`} width={240} height={240} />
          <p className="qrcode-detail__target">
            読み取り先{' '}
            {qrcode.targetType === 'link' && qrcode.targetShortCode ? (
              <Link to={`/app/links/${qrcode.targetId}`}>
                <ShortUrl shortCode={qrcode.targetShortCode} />
              </Link>
            ) : (
              <span className="qrcode-target__url">{qrcode.targetUrl ?? '-'}</span>
            )}
          </p>
          <p className="field__hint">
            {qrcode.targetType === 'link' ? '短縮URL経由(読み取り先の変更・読み取り数の集計ができます)' : '元URLを直接(印刷後の読み取り先の変更・読み取り数の集計はできません)'}
          </p>

          <h2 className="card__title">ダウンロード</h2>
          <RadioCardGroup
            legend="ファイル形式"
            name="qrcode-download-format"
            options={DOWNLOAD_FORMAT_OPTIONS}
            value={downloadFormat}
            onChange={setDownloadFormat}
          />
          {downloadFormat === 'png' && (
            <SelectField
              fieldId="qrcode-download-size"
              label="画像サイズ"
              narrow
              options={PNG_SIZE_SELECT_OPTIONS}
              selectProps={{ value: String(pngSize), onChange: (e) => setPngSize(Number(e.target.value)) }}
            />
          )}
          <a className={buttonClassName({ variant: 'primary' })} href={downloadUrl} download={`qrcode-${qrcode.id}.${downloadFormat}`}>
            <DownloadIcon />
            ダウンロード
          </a>
        </Card>

        <div className="qrcode-detail__side">
          <Card title="基本情報">
            <form onSubmit={handleNameSubmit}>
              <FormField
                fieldId="qrcode-editor-name"
                label="名前(管理用・任意)"
                hint="一覧で見分けるための名前です。QRコードには表示されません。未入力の場合は作成日で表示します。"
                inputProps={{ value: name, maxLength: QRCODE_NAME_MAX_LENGTH, placeholder: '例:店頭ポスター用', onChange: (e) => setName(e.target.value) }}
              />
              <p className="field__hint">QRコードは読み取りやすさを優先し、白地に黒で出力します。</p>
              <div className="button-group">
                <Button type="submit" disabled={isSaving || !isNameChanged}>
                  {isSaving ? '保存中…' : '変更を保存'}
                </Button>
                <Button variant="outline" disabled={isSaving || !isNameChanged} onClick={() => setName(savedName)}>
                  変更を取り消す
                </Button>
              </div>
            </form>
          </Card>

          <Card title="このQRコードで掲示物を作る">
            <p>QRコード入りの掲示物(縦向き)を作成して、PDF・PNGで書き出せます。</p>
            <div className="button-group">
              <ButtonLink variant="secondary" to={`/app/qrcodes/${qrcode.id}/posters/new?size=A6`}>
                A6サイズで作成
              </ButtonLink>
              <ButtonLink variant="secondary" to={`/app/qrcodes/${qrcode.id}/posters/new?size=A5`}>
                A5サイズで作成
              </ButtonLink>
            </div>
            {qrcode.posterCount > 0 && <p className="field__hint">このQRコードを使った掲示物: {qrcode.posterCount}件</p>}
          </Card>

          <div>
            <Button variant="danger-outline" disabled={isDeleting} onClick={handleDeleteClick}>
              {isDeleting ? '削除中…' : 'このQRコードを削除'}
            </Button>
          </div>
        </div>
      </div>
    </Page>
  )
}
