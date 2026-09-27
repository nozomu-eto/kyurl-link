/** @jsxImportSource react */
import { type FormEvent, useState } from 'react'
import { type LoaderFunctionArgs, useLoaderData, useNavigate } from 'react-router'
import { AlertMessage } from '@/frontend/components/alert-message'
import { apiClient, bypassPatchInputTypeCheck } from '@/frontend/lib/api-client'
import { Button } from '@/frontend/components/button'
import { Card } from '@/frontend/components/card'
import { FormField } from '@/frontend/components/form-field'
import { Page } from '@/frontend/components/page'
import { QRCODE_NAME_MAX_LENGTH } from '@/shared/constants/input-limits'

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

// QrCodeEditorPage: QRコード1件の詳細・カスタマイズ画面。
// 画像プレビュー(GET /qrcodes/:id/imageのSVGをそのまま<img>で表示)、
// 管理用の名前の保存、削除、掲示物作成への導線を持つ。
// QRコードは読み取りやすさを優先し、白地に黒で出力する方針(docs/architecture.md 第6.7節)のため、
// 色の変更機能(前景色・背景色)は提供しない
export function QrCodeEditorPage() {
  const { qrcode } = useLoaderData<typeof qrcodeEditorLoader>()
  const navigate = useNavigate()

  const [name, setName] = useState(qrcode.name ?? '')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleNameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)
    setIsSaving(true)

    const response = await apiClient.api.v1.qrcodes[':id'].$patch(bypassPatchInputTypeCheck({ param: { id: qrcode.id }, json: { name } }))

    setIsSaving(false)

    if (!response.ok) {
      // 作成画面(qrcode-create-page.tsx等)と同様、サーバーが返す{ error: { message } }を
      // そのまま表示する(429時の「リクエストが多すぎます…」等もこのmessageに含まれるため、
      // 個別のステータスコード分岐は不要)。JSONでない・messageが無い場合のみ固定文言にする
      const body = await response.json().catch(() => null)
      setErrorMessage(body && 'error' in body && body.error?.message ? body.error.message : '名前の保存に失敗しました')
      return
    }

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

      <Card title="名前・スタイル">
        <p className="field__hint">QRコードは読み取りやすさを優先し、白地に黒で出力します。</p>
        <form onSubmit={handleNameSubmit}>
          <FormField
            fieldId="qrcode-editor-name"
            label="名前(任意)"
            hint="一覧などで表示する管理用の名前です。QR画像には表示されません。"
            inputProps={{ value: name, maxLength: QRCODE_NAME_MAX_LENGTH, onChange: (e) => setName(e.target.value) }}
          />
          <Button type="submit" disabled={isSaving}>
            {isSaving ? '保存中…' : '名前を保存'}
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
