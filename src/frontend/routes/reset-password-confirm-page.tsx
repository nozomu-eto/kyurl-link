/** @jsxImportSource react */
import { type FormEvent, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AlertMessage } from '@/frontend/components/alert-message'
import { FormField } from '@/frontend/components/form-field'
import { authClient, translateAuthErrorCode } from '@/frontend/lib/auth-client'

// ResetPasswordConfirmPage: メール内のリセットリンクから遷移してくる、新しいパスワードを
// 入力する画面。Better Authはリンククリック時に/api/auth/reset-password/:tokenで
// トークンを検証した上で、このページ(redirectToに指定したパス)へ
// `?token=<トークン>`を付けてリダイレクトする(トークンが無効・期限切れの場合は
// `?error=INVALID_TOKEN`が付く)。そのためtokenの有無・errorの有無をURLクエリから読み取って
// 画面の出し分けを行う
export function ResetPasswordConfirmPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const hasError = searchParams.get('error') !== null

  const [newPassword, setNewPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) {
      return
    }

    setErrorMessage(null)
    setIsSubmitting(true)

    const { error } = await authClient.resetPassword({ newPassword, token })

    setIsSubmitting(false)

    if (error) {
      setErrorMessage(translateAuthErrorCode(error.code))
      return
    }

    setIsCompleted(true)
  }

  if (hasError || !token) {
    return (
      <div className="page-container">
        <h1>パスワード再設定</h1>
        <AlertMessage tone="error">このリンクは無効か、有効期限が切れています。お手数ですが、もう一度パスワード再設定をお申し込みください。</AlertMessage>
        <Link to="/reset-password">パスワード再設定をやり直す</Link>
      </div>
    )
  }

  if (isCompleted) {
    return (
      <div className="page-container">
        <h1>パスワード再設定</h1>
        <AlertMessage tone="success">パスワードを再設定しました。新しいパスワードでログインしてください。</AlertMessage>
        <Link to="/login" className="button button--primary">
          ログイン画面へ
        </Link>
      </div>
    )
  }

  return (
    <div className="page-container">
      <h1>新しいパスワードを設定</h1>
      {errorMessage && <AlertMessage tone="error">{errorMessage}</AlertMessage>}
      <form className="card" onSubmit={handleSubmit}>
        <FormField
          fieldId="reset-confirm-new-password"
          label="新しいパスワード"
          hint="8文字以上で入力してください"
          inputProps={{
            type: 'password',
            required: true,
            minLength: 8,
            autoComplete: 'new-password',
            value: newPassword,
            onChange: (e) => setNewPassword(e.target.value),
          }}
        />
        <button type="submit" className="button button--primary" disabled={isSubmitting}>
          {isSubmitting ? '設定中…' : 'パスワードを設定する'}
        </button>
      </form>
    </div>
  )
}
