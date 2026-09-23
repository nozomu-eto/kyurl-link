/** @jsxImportSource react */
import { type FormEvent, useState } from 'react'
import { type LoaderFunctionArgs, useLoaderData, useNavigate } from 'react-router'
import { AlertMessage } from '@/frontend/components/alert-message'
import { apiClient } from '@/frontend/lib/api-client'

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
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
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
      return
    }

    const created = await response.json()
    await navigate(`/app/posters/${created.id}`)
  }

  return (
    <div className="page">
      <h1>掲示物を作成</h1>
      {errorMessage && <AlertMessage tone="error">{errorMessage}</AlertMessage>}
      <form className="card" onSubmit={handleSubmit}>
        <div className="field">
          <label className="field__label" htmlFor="poster-create-title">
            タイトル
          </label>
          <input id="poster-create-title" className="field__input" type="text" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="poster-create-subtitle">
            サブタイトル(任意)
          </label>
          <input id="poster-create-subtitle" className="field__input" type="text" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="poster-create-size">
            サイズ
          </label>
          <select id="poster-create-size" className="field__input" value={size} onChange={(e) => setSize(e.target.value as 'A6' | 'A5')}>
            <option value="A6">A6縦</option>
            <option value="A5">A5縦</option>
          </select>
        </div>
        <button type="submit" className="button button--primary" disabled={isSubmitting}>
          {isSubmitting ? '作成中…' : '掲示物を作成'}
        </button>
      </form>
    </div>
  )
}
