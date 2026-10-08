/** @jsxImportSource react */
import { type FormEvent, useState } from 'react'
import { authClient } from '@/frontend/lib/auth-client'
import { Button, ButtonLink } from '@/frontend/components/button'
import { FormCard } from '@/frontend/components/card'
import { FormField } from '@/frontend/components/form-field'
import { Page } from '@/frontend/components/page'

// ResetPasswordRequestPage: パスワードリセットの申請画面(メールアドレスを入力するだけ)。
// 送信後は、そのメールアドレスが登録済みかどうかに関わらず同じ文言を表示する
// (登録済みメールアドレスの有無を外部に漏らさないため。Better Auth自体もこの方針で
// 常に同じレスポンスを返す設計になっている)。申請後の表示は
// docs/mocks/AuthResetSent.htmlに合わせる(段階4-2)
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
        <p>入力されたメールアドレスが登録されている場合、パスワード再設定用のリンクをお送りしました。</p>
        <p className="field__hint">
          リンクの有効期限は1時間です。一度使うと無効になります。
          <br />
          届かない場合は、迷惑メールフォルダもご確認ください。
        </p>
        <ButtonLink to="/login">ログイン画面へ戻る</ButtonLink>
        <p>
          {/* 入力画面に戻し、入力欄を空にする(段階4-2) */}
          <Button
            variant="text"
            onClick={() => {
              setIsSubmitted(false)
              setEmail('')
            }}
          >
            別のメールアドレスで試す
          </Button>
        </p>
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
