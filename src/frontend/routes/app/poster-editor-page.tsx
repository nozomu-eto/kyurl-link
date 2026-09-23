/** @jsxImportSource react */
import { type FormEvent, useState } from 'react'
import { type LoaderFunctionArgs, useLoaderData, useNavigate } from 'react-router'
import { AlertMessage } from '@/frontend/components/alert-message'
import { apiClient, bypassPatchInputTypeCheck } from '@/frontend/lib/api-client'
import { Button, buttonClassName } from '@/frontend/components/button'
import { Card, FormCard } from '@/frontend/components/card'
import { FormField } from '@/frontend/components/form-field'
import { Page } from '@/frontend/components/page'
import { POSTER_SUBTITLE_MAX_LENGTH, POSTER_TITLE_MAX_LENGTH } from '@/shared/constants/input-limits'

// posterEditorLoader: 掲示物編集画面の表示に必要なposter1件分を取得するloader
export async function posterEditorLoader({ params }: LoaderFunctionArgs) {
  const posterId = params.posterId
  if (!posterId) {
    throw new Response('posterIdが指定されていません', { status: 400 })
  }

  const response = await apiClient.api.v1.posters[':id'].$get({ param: { id: posterId } })
  if (!response.ok) {
    throw new Response('指定された掲示物が見つかりません', { status: response.status })
  }

  return { poster: await response.json() }
}

// A6縦・A5縦のプレビュー表示用の縦横比(mm単位、poster-template.tsのPAGE_SIZESと一致させる)
const PREVIEW_SIZE_MM: Record<'A6' | 'A5', { width: number; height: number }> = {
  A6: { width: 105, height: 148 },
  A5: { width: 148, height: 210 },
}

// PosterEditorPage: 掲示物1件の編集画面(A6/A5)。
// タイトル・サブタイトルの編集、簡易プレビュー、PDF/PNG書き出し、削除ができる。
// サイズ(A6/A5)は作成後変更不可(posterUpdateInputSchemaの対象外)なので編集フォームには含めない。
// プレビューはBrowser Renderingによる実際のPDF/PNG生成(数秒かかる可能性がある処理)を
// 都度呼び出すのではなく、QRコード画像+タイトル/サブタイトルをA6/A5の比率で
// クライアント側に簡易再現したものを表示する(実際の書き出し結果と完全一致はしない)
export function PosterEditorPage() {
  const { poster } = useLoaderData<typeof posterEditorLoader>()
  const navigate = useNavigate()

  const [title, setTitle] = useState(poster.title)
  const [subtitle, setSubtitle] = useState(poster.subtitle ?? '')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)
    setIsSaving(true)

    const response = await apiClient.api.v1.posters[':id'].$patch(
      bypassPatchInputTypeCheck({ param: { id: poster.id }, json: { title, subtitle: subtitle || null } }),
    )

    setIsSaving(false)

    if (!response.ok) {
      // 作成画面(poster-create-page.tsx等)と同様、サーバーが返す{ error: { message } }を
      // そのまま表示する(429時の「リクエストが多すぎます…」等もこのmessageに含まれるため、
      // 個別のステータスコード分岐は不要)。JSONでない・messageが無い場合のみ固定文言にする
      const body = await response.json().catch(() => null)
      setErrorMessage(body && 'error' in body && body.error?.message ? body.error.message : '保存に失敗しました')
      return
    }

    setSuccessMessage('保存しました')
  }

  async function handleDeleteClick() {
    if (!window.confirm('この掲示物を削除しますか?この操作は取り消せません。')) {
      return
    }

    setIsDeleting(true)
    const response = await apiClient.api.v1.posters[':id'].$delete({ param: { id: poster.id } })
    setIsDeleting(false)

    if (!response.ok) {
      setErrorMessage('削除に失敗しました')
      return
    }

    await navigate('/app')
  }

  const previewSize = PREVIEW_SIZE_MM[poster.size]
  // mm単位の寸法を、そのままpx換算のCSS幅として使う(実寸ではなく画面上の縮尺プレビュー用途のため、
  // 1mm=1pxとして比率だけ正しく再現する簡易対応)
  const previewScale = 2

  return (
    <Page title={<>掲示物の編集({poster.size}縦)</>}>
      {errorMessage && <AlertMessage tone="error">{errorMessage}</AlertMessage>}
      {successMessage && <AlertMessage tone="success">{successMessage}</AlertMessage>}

      <div className="editor-layout">
        <FormCard className="editor-layout__form" onSubmit={handleSubmit}>
          <FormField
            fieldId="poster-editor-title"
            label="タイトル"
            inputProps={{ type: 'text', required: true, maxLength: POSTER_TITLE_MAX_LENGTH, value: title, onChange: (e) => setTitle(e.target.value) }}
          />
          <FormField
            fieldId="poster-editor-subtitle"
            label="サブタイトル(任意)"
            inputProps={{ type: 'text', maxLength: POSTER_SUBTITLE_MAX_LENGTH, value: subtitle, onChange: (e) => setSubtitle(e.target.value) }}
          />
          <Button type="submit" disabled={isSaving}>
            {isSaving ? '保存中…' : '保存する'}
          </Button>
        </FormCard>

        {/* 簡易プレビュー。A6/A5の縦横比をmm値そのままpx換算(previewScale倍)して再現する。
            幅・高さは掲示物サイズから計算する動的な値のため、例外的にインラインstyleで指定する */}
        <div
          className="card poster-preview"
          style={{
            width: previewSize.width * previewScale,
            height: previewSize.height * previewScale,
          }}
        >
          <img src={`/api/v1/qrcodes/${poster.qrCodeId}/image`} alt="QRコード" width={120} height={120} />
          <strong>{title}</strong>
          {subtitle && <span>{subtitle}</span>}
        </div>
      </div>

      <Card title="書き出し">
        <p className="field__hint">PDF/PNGの生成には数秒かかる場合があります。別タブで開きます。</p>
        <div className="button-group">
          <a href={`/api/v1/posters/${poster.id}/export?format=pdf`} target="_blank" rel="noreferrer" className={buttonClassName({ variant: 'secondary' })}>
            PDFで書き出す
          </a>
          <a href={`/api/v1/posters/${poster.id}/export?format=png`} target="_blank" rel="noreferrer" className={buttonClassName({ variant: 'secondary' })}>
            PNGで書き出す
          </a>
        </div>
      </Card>

      <Button variant="danger" disabled={isDeleting} onClick={handleDeleteClick}>
        {isDeleting ? '削除中…' : 'この掲示物を削除'}
      </Button>
    </Page>
  )
}
