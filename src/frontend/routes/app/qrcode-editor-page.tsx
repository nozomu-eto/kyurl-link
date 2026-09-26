/** @jsxImportSource react */
import { type FormEvent, useState } from 'react'
import { type LoaderFunctionArgs, useLoaderData, useNavigate } from 'react-router'
import { AlertMessage } from '@/frontend/components/alert-message'
import { apiClient, bypassPatchInputTypeCheck } from '@/frontend/lib/api-client'
import { Button } from '@/frontend/components/button'
import { Card } from '@/frontend/components/card'
import { FormField } from '@/frontend/components/form-field'
import { Page } from '@/frontend/components/page'

// qrcodeEditorLoader: QRコード編集画面の表示に必要なqrcode1件分を取得するloader
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

// styleOptionsのうち、このフォームで編集する2項目(前景色・背景色)の型
type QrCodeStyleOptions = { foregroundColor?: string; backgroundColor?: string }

// QrCodeEditorPage: QRコード1件の詳細・カスタマイズ画面。
// 画像プレビュー(GET /qrcodes/:id/imageのSVGをそのまま<img>で表示)、
// スタイル設定(前景色・背景色)の保存、削除、掲示物作成への導線を持つ。
// 注意: styleOptionsは現時点ではDBへの保存のみ行われ、実際に生成されるQR画像には
// まだ反映されない(qrcodes.tsの実装コメント「今回は保存のみで画像生成には未使用、
// 将来のカスタマイズ機能用の受け皿」の通り)。画面上にもその旨を明記し、利用者に
// 誤解を与えないようにする
export function QrCodeEditorPage() {
  const { qrcode } = useLoaderData<typeof qrcodeEditorLoader>()
  const navigate = useNavigate()

  const currentStyleOptions = (qrcode.styleOptions ?? {}) as QrCodeStyleOptions
  const [foregroundColor, setForegroundColor] = useState(currentStyleOptions.foregroundColor ?? '#000000')
  const [backgroundColor, setBackgroundColor] = useState(currentStyleOptions.backgroundColor ?? '#ffffff')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleStyleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)
    setIsSaving(true)

    const response = await apiClient.api.v1.qrcodes[':id'].$patch(
      bypassPatchInputTypeCheck({ param: { id: qrcode.id }, json: { styleOptions: { foregroundColor, backgroundColor } } }),
    )

    setIsSaving(false)

    if (!response.ok) {
      // 作成画面(qrcode-create-page.tsx等)と同様、サーバーが返す{ error: { message } }を
      // そのまま表示する(429時の「リクエストが多すぎます…」等もこのmessageに含まれるため、
      // 個別のステータスコード分岐は不要)。JSONでない・messageが無い場合のみ固定文言にする
      const body = await response.json().catch(() => null)
      setErrorMessage(body && 'error' in body && body.error?.message ? body.error.message : 'スタイル設定の保存に失敗しました')
      return
    }

    setSuccessMessage('スタイル設定を保存しました')
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

    await navigate('/app')
  }

  return (
    <Page title="QRコードの詳細">
      {errorMessage && <AlertMessage tone="error">{errorMessage}</AlertMessage>}
      {successMessage && <AlertMessage tone="success">{successMessage}</AlertMessage>}

      <Card>
        {/* GET /api/v1/qrcodes/:id/imageは認証不要の公開エンドポイントなので、
            そのまま<img src>に指定してSVGを表示できる */}
        <img src={`/api/v1/qrcodes/${qrcode.id}/image`} alt="QRコード" width={200} height={200} />
        <p className="field__hint">対象種別: {qrcode.targetType === 'link' ? '短縮URL' : '直接URL'}</p>
      </Card>

      <Card title="スタイル設定">
        <p className="field__hint">※現在はスタイル設定の保存のみ対応しており、QR画像自体への反映は今後対応予定です。</p>
        <form onSubmit={handleStyleSubmit}>
          <FormField
            fieldId="qrcode-editor-foreground-color"
            label="前景色"
            inputProps={{ type: 'color', value: foregroundColor, onChange: (e) => setForegroundColor(e.target.value) }}
          />
          <FormField
            fieldId="qrcode-editor-background-color"
            label="背景色"
            inputProps={{ type: 'color', value: backgroundColor, onChange: (e) => setBackgroundColor(e.target.value) }}
          />
          <Button type="submit" disabled={isSaving}>
            {isSaving ? '保存中…' : 'スタイル設定を保存'}
          </Button>
        </form>
      </Card>

      <Card className="button-group">
        <Button variant="secondary" onClick={() => navigate(`/app/qrcodes/${qrcode.id}/posters/new`)}>
          この QR コードで掲示物を作成
        </Button>
        <Button variant="danger" disabled={isDeleting} onClick={handleDeleteClick}>
          {isDeleting ? '削除中…' : 'このQRコードを削除'}
        </Button>
      </Card>
    </Page>
  )
}
