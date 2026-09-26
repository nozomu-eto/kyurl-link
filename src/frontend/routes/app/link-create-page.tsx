/** @jsxImportSource react */
import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AlertMessage } from '@/frontend/components/alert-message'
import { FormField } from '@/frontend/components/form-field'
import { apiClient } from '@/frontend/lib/api-client'
import { URL_MAX_LENGTH } from '@/shared/constants/input-limits'

// LinkCreatePage: 短縮URLの新規作成フォーム。元URLと、任意で有効期限を入力する。
// 送信するとPOST /api/v1/linksを呼び出し、成功したら作成されたlinkの詳細画面へ遷移する
export function LinkCreatePage() {
  const navigate = useNavigate()
  const [originalUrl, setOriginalUrl] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
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

    const response = await apiClient.api.v1.links.$post({
      json: {
        originalUrl,
        // date input(YYYY-MM-DD)の空文字は「無期限」を表すnullとして送る。
        // 値が入っている場合はISO文字列(日付の終わり=23:59:59)として送る
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
      },
    })

    setIsSubmitting(false)

    if (!response.ok) {
      const body = await response.json()
      setErrorMessage('error' in body ? body.error.message : '短縮URLの作成に失敗しました')
      setErrorCode('error' in body ? body.error.code : null)
      return
    }

    const created = await response.json()
    await navigate(`/app/links/${created.id}`)
  }

  return (
    <div className="page">
      <h1>短縮URLを作成</h1>
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
      <form className="card" onSubmit={handleSubmit}>
        <FormField
          fieldId="link-create-original-url"
          label="元URL"
          inputProps={{
            type: 'url',
            required: true,
            // サーバー側スキーマ(httpUrlSchema)の上限と揃え、送信前に気づけるようにする
            maxLength: URL_MAX_LENGTH,
            placeholder: 'https://example.com/menu',
            value: originalUrl,
            onChange: (e) => setOriginalUrl(e.target.value),
          }}
        />
        <FormField
          fieldId="link-create-expires-at"
          label="有効期限(任意)"
          hint="空欄の場合は無期限になります"
          inputProps={{
            type: 'date',
            value: expiresAt,
            onChange: (e) => setExpiresAt(e.target.value),
          }}
        />
        <button type="submit" className="button button--primary" disabled={isSubmitting}>
          {isSubmitting ? '作成中…' : '短縮URLを作成'}
        </button>
      </form>
    </div>
  )
}
