/** @jsxImportSource react */
import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'
import { AlertMessage } from '@/frontend/components/alert-message'
import { authClient } from '@/frontend/lib/auth-client'
import { Button } from '@/frontend/components/button'
import { FormCard } from '@/frontend/components/card'
import { FormField } from '@/frontend/components/form-field'
import { Page } from '@/frontend/components/page'

// ResetPasswordRequestPage: パスワードリセットの申請画面(メールアドレスを入力するだけ)。
// 送信後は、そのメールアドレスが登録済みかどうかに関わらず同じ文言を表示する
// (登録済みメールアドレスの有無を外部に漏らさないため。Better Auth自体もこの方針で
// 常に同じレスポンスを返す設計になっている)
export function ResetPasswordRequestPage() {
  const [email, setEmail] = useState('')
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)

    // redirectToは、メール内のリセットリンクをクリックした後に着地するフロントエンドの
    // パス。Better Auth側でここに?token=<トークン>を付与してリダイレクトする
    await authClient.requestPasswordReset({ email, redirectTo: '/reset-password/confirm' })

    setIsSubmitting(false)
    setIsSubmitted(true)
  }

  if (isSubmitted) {
    return (
      <Page contained title="パスワード再設定のご案内">
        <AlertMessage tone="success">
          入力いただいたメールアドレスが登録されている場合、パスワード再設定用のメールをお送りしました。メールをご確認ください。
        </AlertMessage>
        <Link to="/login">ログイン画面へ戻る</Link>
      </Page>
    )
  }

  return (
    <Page contained title="パスワードをお忘れの方">
      <p>登録済みのメールアドレスを入力してください。パスワード再設定用のリンクをお送りします。</p>
      <FormCard onSubmit={handleSubmit}>
        <FormField
          fieldId="reset-request-email"
          label="メールアドレス"
          inputProps={{
            type: 'email',
            required: true,
            autoComplete: 'email',
            value: email,
            onChange: (e) => setEmail(e.target.value),
          }}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '送信中…' : '再設定メールを送信'}
        </Button>
      </FormCard>
    </Page>
  )
}
