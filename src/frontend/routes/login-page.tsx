/** @jsxImportSource react */
import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AlertMessage } from '@/frontend/components/alert-message'
import { authClient, translateAuthErrorCode } from '@/frontend/lib/auth-client'
import { Button } from '@/frontend/components/button'
import { FormCard } from '@/frontend/components/card'
import { FormField } from '@/frontend/components/form-field'
import { Page } from '@/frontend/components/page'

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
    <Page contained title="ログイン">
      {errorMessage && <AlertMessage tone="error">{errorMessage}</AlertMessage>}
      <FormCard onSubmit={handleSubmit}>
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
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'ログイン中…' : 'ログイン'}
        </Button>
      </FormCard>
      <div className="form-links">
        <p>
          <Link to="/reset-password">パスワードをお忘れの方</Link>
        </p>
        <p>
          アカウントをお持ちでない方は<Link to="/signup">新規登録</Link>
        </p>
      </div>
    </Page>
  )
}
