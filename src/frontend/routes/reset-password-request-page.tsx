/** @jsxImportSource react */
import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'
import { AlertMessage } from '@/frontend/components/alert-message'
import { FormField } from '@/frontend/components/form-field'
import { authClient } from '@/frontend/lib/auth-client'

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
      <div className="page-container">
        <h1>パスワード再設定のご案内</h1>
        <AlertMessage tone="success">
          入力いただいたメールアドレスが登録されている場合、パスワード再設定用のメールをお送りしました。メールをご確認ください。
        </AlertMessage>
        <Link to="/login">ログイン画面へ戻る</Link>
      </div>
    )
  }

  return (
    <div className="page-container">
      <h1>パスワードをお忘れの方</h1>
      <p>登録済みのメールアドレスを入力してください。パスワード再設定用のリンクをお送りします。</p>
      <form className="card" onSubmit={handleSubmit}>
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
        <button type="submit" className="button button--primary" disabled={isSubmitting}>
          {isSubmitting ? '送信中…' : '再設定メールを送信'}
        </button>
      </form>
    </div>
  )
}
