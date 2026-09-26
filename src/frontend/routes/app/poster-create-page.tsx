/** @jsxImportSource react */
import { type FormEvent, useState } from 'react'
import { type LoaderFunctionArgs, Link, useLoaderData, useNavigate } from 'react-router'
import { AlertMessage } from '@/frontend/components/alert-message'
import { apiClient } from '@/frontend/lib/api-client'
import { Button } from '@/frontend/components/button'
import { FormCard } from '@/frontend/components/card'
import { FormField, SelectField } from '@/frontend/components/form-field'
import { Page } from '@/frontend/components/page'
import { POSTER_SUBTITLE_MAX_LENGTH, POSTER_TITLE_MAX_LENGTH } from '@/shared/constants/input-limits'

// posterCreateLoader: 掲示物作成フォームの表示前に、対象となるQRコードが実在するかを
// 確認するloader(存在しない・他人のqrCodeIdでフォームだけ表示されてしまうのを防ぐ)
export async function posterCreateLoader({ params }: LoaderFunctionArgs) {
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

// PosterCreatePage: 掲示物(ポスター)の新規作成フォーム。
// タイトル・サブタイトル(任意)・サイズ(A6縦/A5縦)を入力し、対象QRコードは
// URL(/app/qrcodes/:qrCodeId/posters/new)から固定で受け取る
export function PosterCreatePage() {
  const { qrcode } = useLoaderData<typeof posterCreateLoader>()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [size, setSize] = useState<'A6' | 'A5'>('A6')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // メール未確認によるエラー(EMAIL_NOT_VERIFIED)の場合のみ、「メール確認待ち」画面への
  // 導線を追加で表示するために、エラーコードも別途保持する
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setErrorCode(null)
    setIsSubmitting(true)

    const response = await apiClient.api.v1.posters.$post({
      json: {
        title,
        subtitle: subtitle || null,
        size,
        qrCodeId: qrcode.id,
      },
    })

    setIsSubmitting(false)

    if (!response.ok) {
      const body = await response.json()
      setErrorMessage('error' in body ? body.error.message : '掲示物の作成に失敗しました')
      setErrorCode('error' in body ? body.error.code : null)
      return
    }

    const created = await response.json()
    await navigate(`/app/posters/${created.id}`)
  }

  return (
    <Page title="掲示物を作成">
      {errorMessage && (
        <AlertMessage tone="error">
          {errorMessage}
          {errorCode === 'EMAIL_NOT_VERIFIED' && (
            <>
              {' '}
              <Link to="/verify-email">メールアドレスの確認はこちら</Link>
            </>
          )}
        </AlertMessage>
      )}
      <FormCard onSubmit={handleSubmit}>
        <FormField
          fieldId="poster-create-title"
          label="タイトル"
          inputProps={{
            type: 'text',
            required: true,
            // サーバー側スキーマ(posterCreateInputSchema)の上限と揃える
            maxLength: POSTER_TITLE_MAX_LENGTH,
            value: title,
            onChange: (e) => setTitle(e.target.value),
          }}
        />
        <FormField
          fieldId="poster-create-subtitle"
          label="サブタイトル(任意)"
          inputProps={{ type: 'text', maxLength: POSTER_SUBTITLE_MAX_LENGTH, value: subtitle, onChange: (e) => setSubtitle(e.target.value) }}
        />
        <SelectField
          fieldId="poster-create-size"
          label="サイズ"
          options={[
            { value: 'A6', label: 'A6縦' },
            { value: 'A5', label: 'A5縦' },
          ]}
          selectProps={{ value: size, onChange: (e) => setSize(e.target.value as 'A6' | 'A5') }}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '作成中…' : '掲示物を作成'}
        </Button>
      </FormCard>
    </Page>
  )
}
