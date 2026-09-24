/** @jsxImportSource react */
import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AlertMessage } from '@/frontend/components/alert-message'
import { FormField } from '@/frontend/components/form-field'
import { TurnstileWidget } from '@/frontend/components/turnstile-widget'
import { authClient, translateAuthErrorCode } from '@/frontend/lib/auth-client'

// SignupPage: メールアドレス・パスワード・お名前(表示名)を入力して新規登録する画面。
// 送信するとauthClient.signUp.emailでBetter Auth(/api/auth/sign-up/email)を呼び出す。
// 状態: name/email/password(入力値)、errorMessage(送信失敗時のエラー文言)、
// isSubmitting(二重送信防止・ボタンのローディング表示用)を保持する
export function SignupPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Turnstileの検証トークン(src/lib/auth.tsのcaptchaプラグインがサーバー側で必須にしている)。
  // ウィジェットの検証が完了するまでnullのままで、送信ボタンを無効化する
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)

  // フォーム送信ハンドラ。サインアップ成功時は、docs/architecture.md 第6.1節の
  // 「メール確認待ち画面」へ遷移する(auth.tsのemailVerification.sendOnSignUp: trueにより、
  // このタイミングで確認メールが自動送信されている)
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!turnstileToken) {
      return
    }
    setErrorMessage(null)
    setIsSubmitting(true)

    const { error } = await authClient.signUp.email({
      name,
      email,
      password,
      // メール確認完了後(または「再送信」を経てのverify-emailリンク経由)にサインイン済みで
      // 着地させたいページ。callbackURLはBetter Auth側でオリジンからの相対パスとして扱われる
      callbackURL: '/app',
      // Turnstileの検証トークン。src/lib/auth.tsのcaptchaプラグインがこのヘッダーを
      // 必須で検証する(x-captcha-response、公式の固定ヘッダー名)
      fetchOptions: {
        headers: { 'x-captcha-response': turnstileToken },
      },
    })

    setIsSubmitting(false)

    if (error) {
      setErrorMessage(translateAuthErrorCode(error.code))
      return
    }

    await navigate('/verify-email')
  }

  return (
    <div className="page-container">
      <h1>新規登録</h1>
      {errorMessage && <AlertMessage tone="error">{errorMessage}</AlertMessage>}
      <form className="card" onSubmit={handleSubmit}>
        <FormField
          fieldId="signup-name"
          label="お名前(表示名)"
          inputProps={{
            type: 'text',
            required: true,
            autoComplete: 'name',
            value: name,
            onChange: (e) => setName(e.target.value),
          }}
        />
        <FormField
          fieldId="signup-email"
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
          fieldId="signup-password"
          label="パスワード"
          hint="8文字以上で入力してください"
          inputProps={{
            type: 'password',
            required: true,
            minLength: 8,
            autoComplete: 'new-password',
            value: password,
            onChange: (e) => setPassword(e.target.value),
          }}
        />
        <TurnstileWidget onVerify={setTurnstileToken} />
        <button type="submit" className="button button--primary" disabled={isSubmitting || !turnstileToken}>
          {isSubmitting ? '登録中…' : '登録する'}
        </button>
      </form>
      <div className="form-links">
        <p>
          すでにアカウントをお持ちの方は<Link to="/login">ログイン</Link>
        </p>
        <p>
          登録することで、<Link to="/terms">利用規約</Link>および<Link to="/privacy">プライバシーポリシー</Link>に同意したものとみなされます。
        </p>
      </div>
    </div>
  )
}
