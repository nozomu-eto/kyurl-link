/** @jsxImportSource react */
import { type FormEvent, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AlertMessage } from '@/frontend/components/alert-message'
import { TurnstileWidget, type TurnstileWidgetHandle } from '@/frontend/components/turnstile-widget'
import { authClient, translateAuthErrorCode } from '@/frontend/lib/auth-client'
import { Button } from '@/frontend/components/button'
import { FormCard } from '@/frontend/components/card'
import { CheckboxField, FormField } from '@/frontend/components/form-field'
import { Page } from '@/frontend/components/page'
import { recordVerificationEmailSentAt } from '@/frontend/lib/verify-email-resend-timer'

const AGREE_NOTE_ID = 'signup-agree-note'

// SignupPage: メールアドレス・パスワード・お名前(表示名)を入力して新規登録する画面。
// 送信するとauthClient.signUp.emailでBetter Auth(/api/auth/sign-up/email)を呼び出す。
// 状態: name/email/password(入力値)、agreeToTerms(規約同意チェック)、
// errorMessage(送信失敗時のエラー文言)、isSubmitting(二重送信防止・ボタンのローディング表示用)を保持する
export function SignupPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [agreeToTerms, setAgreeToTerms] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Turnstileの検証トークン(src/lib/auth.tsのcaptchaプラグインがサーバー側で必須にしている)。
  // ウィジェットの検証が完了するまでnullのままで、送信ボタンを無効化する
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const turnstileRef = useRef<TurnstileWidgetHandle>(null)

  const canSubmit = agreeToTerms && !!turnstileToken

  // フォーム送信ハンドラ。サインアップ成功時は、docs/architecture.mdの「必要な画面一覧」の
  // 「メール確認待ち画面」へ遷移する(auth.tsのemailVerification.sendOnSignUp: trueにより、
  // このタイミングで確認メールが自動送信されている)
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit || !turnstileToken) {
      return
    }
    setErrorMessage(null)
    setIsSubmitting(true)

    const { data, error } = await authClient.signUp.email({
      name,
      email,
      password,
      // メール確認完了後(または「再送信」を経てのverify-emailリンク経由)にサインイン済みで
      // 着地させたいページ。callbackURLはBetter Auth側でオリジンからの相対パスとして扱われる
      callbackURL: '/app',
      // 規約同意の記録(docs/architecture.mdの「API設計」)。authClientの型はBetter Authの
      // コアスキーマ由来でこの項目を知らないため型エラーになる。値そのものはサーバー側の
      // hooks.before(src/lib/auth.ts)で検証・除去するだけの一時的な項目のため、
      // 型を広くせずここだけ最小限にキャストする
      ...({ agreeToTerms: true } as Record<string, unknown>),
      // Turnstileの検証トークン。src/lib/auth.tsのcaptchaプラグインがこのヘッダーを
      // 必須で検証する(x-captcha-response、公式の固定ヘッダー名)
      fetchOptions: {
        headers: { 'x-captcha-response': turnstileToken },
      },
    })

    setIsSubmitting(false)

    if (error) {
      setErrorMessage(translateAuthErrorCode(error.code))
      // Turnstileの検証結果は使い切りのため、同じトークンを再送するとtimeout-or-duplicate
      // エラーになる。失敗時は必ずリセットして検証を取り直させる
      turnstileRef.current?.reset()
      setTurnstileToken(null)
      return
    }

    // 新規登録の時点でauth.ts(emailVerification.sendOnSignUp: true)により確認メールが
    // 既に送信されているため、メール確認待ち画面の再送ボタンの60秒待ち時間の起点として
    // ここで記録しておく(記録しないと、画面遷移直後に押しても黙って送られない状態になる)
    if (data) {
      recordVerificationEmailSentAt(data.user.id)
    }

    await navigate('/verify-email')
  }

  function handleTurnstileError() {
    setTurnstileToken(null)
    setErrorMessage('セキュリティ確認の読み込みに失敗しました。時間をおいて再度お試しください')
  }

  return (
    <Page contained title="新規登録">
      {errorMessage && <AlertMessage tone="error">{errorMessage}</AlertMessage>}
      <FormCard onSubmit={handleSubmit}>
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
        <CheckboxField
          fieldId="signup-agree"
          checked={agreeToTerms}
          onChange={setAgreeToTerms}
          label={
            <span>
              <Link to="/terms" target="_blank" rel="noopener noreferrer">
                利用規約
              </Link>
              と
              <Link to="/privacy" target="_blank" rel="noopener noreferrer">
                プライバシーポリシー
              </Link>
              に同意します
            </span>
          }
        />
        <TurnstileWidget ref={turnstileRef} onVerify={setTurnstileToken} onError={handleTurnstileError} />
        <Button type="submit" disabled={isSubmitting || !canSubmit} aria-describedby={AGREE_NOTE_ID}>
          {isSubmitting ? '登録中…' : '登録する'}
        </Button>
        <p id={AGREE_NOTE_ID} className="form-note">
          {agreeToTerms ? '確認メールを送信します' : '同意にチェックを入れると登録できます'}
        </p>
      </FormCard>
      <div className="form-links">
        <p>
          すでにアカウントをお持ちの方は<Link to="/login">ログイン</Link>
        </p>
      </div>
    </Page>
  )
}
