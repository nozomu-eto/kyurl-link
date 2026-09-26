/** @jsxImportSource react */
import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router'
import { AlertMessage } from '@/frontend/components/alert-message'
import { apiClient } from '@/frontend/lib/api-client'
import { Button } from '@/frontend/components/button'
import { FormCard } from '@/frontend/components/card'
import { FormField } from '@/frontend/components/form-field'
import { Page } from '@/frontend/components/page'

// APIから返るerror.codeを、この画面向けの日本語メッセージに変換する。
// docs/architecture.md 第7.1節・account-requests.tsの実装に対応するコードのみを扱う
function translateAccountRequestErrorCode(code: string): string {
  switch (code) {
    case 'INVALID_PASSWORD':
      return 'パスワードが正しくありません'
    case 'ALREADY_REQUESTED':
      return 'すでにアカウント削除の申請が完了しています'
    case 'VALIDATION_ERROR':
      return '入力内容を確認してください'
    default:
      return '削除申請に失敗しました。時間をおいて再度お試しください'
  }
}

// AccountDeletionPage: アカウント削除申請の画面。誤操作防止のため、パスワードの
// 再入力を必須とする(docs/architecture.md 第7.1節「誤操作防止のためパスワード再入力による
// 確認を必須とする」)。送信するとPOST /api/v1/account-requestsを呼び出し、
// 成功すると即座に紐づくlink/qrcode/posterがソフトデリートされ、7日間の猶予期間が始まる
export function AccountDeletionPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setIsSubmitting(true)

    const response = await apiClient.api.v1['account-requests'].$post({ json: { password } })

    setIsSubmitting(false)

    if (!response.ok) {
      const body = await response.json()
      setErrorMessage('error' in body ? translateAccountRequestErrorCode(body.error.code) : '削除申請に失敗しました')
      return
    }

    // 申請後はアカウント設定画面へ戻る。そこで猶予期間の残り日数(pending状態)が
    // 表示される(accountSettingsLoaderが最新の申請状況を取得し直す)
    await navigate('/app/account')
  }

  return (
    <Page title="アカウントを削除">
      <AlertMessage tone="error">
        この操作を行うと、短縮URL・QRコード・掲示物を含むすべてのデータへのアクセスが即座に停止します。7日間の猶予期間中にログインすれば取り消せますが、それ以降は元に戻せません。
      </AlertMessage>
      {errorMessage && <AlertMessage tone="error">{errorMessage}</AlertMessage>}
      <FormCard onSubmit={handleSubmit}>
        <FormField
          fieldId="account-deletion-password"
          label="本人確認のため、パスワードを入力してください"
          inputProps={{
            type: 'password',
            required: true,
            autoComplete: 'current-password',
            value: password,
            onChange: (e) => setPassword(e.target.value),
          }}
        />
        <Button type="submit" variant="danger" disabled={isSubmitting}>
          {isSubmitting ? '送信中…' : 'アカウントを削除する'}
        </Button>
      </FormCard>
    </Page>
  )
}
