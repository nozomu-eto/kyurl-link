/** @jsxImportSource react */
import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AlertMessage } from '@/frontend/components/alert-message'
import { FormField } from '@/frontend/components/form-field'
import { authClient, translateAuthErrorCode } from '@/frontend/lib/auth-client'

// LoginPage: メールアドレス・パスワードでログインする画面。
// ログイン成立(セッション作成)のタイミングで、猶予期間中のアカウント削除申請があれば
// サーバー側(auth.tsのdatabaseHooks.session.create.after)が自動的に取り消す
export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setIsSubmitting(true)

    const { error } = await authClient.signIn.email({ email, password })

    setIsSubmitting(false)

    if (error) {
      setErrorMessage(translateAuthErrorCode(error.code))
      return
    }

    await navigate('/app')
  }

  return (
    <div className="page-container">
      <h1>ログイン</h1>
      {errorMessage && <AlertMessage tone="error">{errorMessage}</AlertMessage>}
      <form className="card" onSubmit={handleSubmit}>
        <FormField
          fieldId="login-email"
          label="メールアドレス"
          inputProps={{
            type: 'email',
            required: true,
            autoComplete: 'email',
            value: email,
            onChange: (e) => setEmail(e.target.value),
          }}
        />
        <FormField
          fieldId="login-password"
          label="パスワード"
          inputProps={{
            type: 'password',
            required: true,
            autoComplete: 'current-password',
            value: password,
            onChange: (e) => setPassword(e.target.value),
          }}
        />
        <button type="submit" className="button button--primary" disabled={isSubmitting}>
          {isSubmitting ? 'ログイン中…' : 'ログイン'}
        </button>
      </form>
      <p className="field__hint" style={{ marginTop: '1rem' }}>
        <Link to="/reset-password">パスワードをお忘れの方</Link>
      </p>
      <p className="field__hint">
        アカウントをお持ちでない方は<Link to="/signup">新規登録</Link>
      </p>
    </div>
  )
}
