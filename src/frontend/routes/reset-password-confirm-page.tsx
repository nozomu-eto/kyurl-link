/** @jsxImportSource react */
import { type FormEvent, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AlertMessage } from '@/frontend/components/alert-message'
import { authClient, translateAuthErrorCode } from '@/frontend/lib/auth-client'
import { Button, ButtonLink } from '@/frontend/components/button'
import { FormCard } from '@/frontend/components/card'
import { FormField } from '@/frontend/components/form-field'
import { Page } from '@/frontend/components/page'

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
      <Page contained title="パスワード再設定">
        <AlertMessage tone="error">このリンクは無効か、有効期限が切れています。お手数ですが、もう一度パスワード再設定をお申し込みください。</AlertMessage>
        <Link to="/reset-password">パスワード再設定をやり直す</Link>
      </Page>
    )
  }

  if (isCompleted) {
    return (
      <Page contained title="パスワード再設定">
        <AlertMessage tone="success">パスワードを再設定しました。新しいパスワードでログインしてください。</AlertMessage>
        {/* auth.tsのrevokeSessionsOnPasswordReset: trueにより、この端末以外のログイン状態は
            すべて無効になっている */}
        <p className="field__hint">他の端末ではログアウトされました。</p>
        <ButtonLink to="/login">
          ログイン画面へ
        </ButtonLink>
      </Page>
    )
  }

  return (
    <Page contained title="新しいパスワードを設定">
      {errorMessage && <AlertMessage tone="error">{errorMessage}</AlertMessage>}
      <FormCard onSubmit={handleSubmit}>
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
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '設定中…' : 'パスワードを設定する'}
        </Button>
      </FormCard>
    </Page>
  )
}
