/** @jsxImportSource react */
import { type FormEvent, useState } from 'react'
import { AlertMessage } from '@/frontend/components/alert-message'
import { Button } from '@/frontend/components/button'
import { Dialog } from '@/frontend/components/dialog'
import { FormField } from '@/frontend/components/form-field'
import { authClient, translateAuthErrorCode } from '@/frontend/lib/auth-client'

type ChangeEmailDialogProps = {
  // 今のメールアドレス。承認メールの送り先として案内に表示し、同じアドレスへの変更を画面で止めるのに使う
  currentEmail: string
  onClose: () => void
}

// ChangeEmailDialog: メールアドレス変更のダイアログ(確認済みのユーザー向け。入力を伴うためスマホでは全画面。第6.5節)。
// Better Authのchange-emailを呼ぶと、次の二段階の確認になる(src/lib/auth.tsのuser.changeEmail参照):
//   ①今のアドレスへ承認メールが送られる → ②承認リンクを開くと、新しいアドレスへ確認メールが送られる →
//   ③そのリンクを開いた時点でアドレスが変わる
// この画面は①の申請までを担当する(②③はメール内のリンクを開いた後に戻る、アカウント設定画面側の案内)。
//
// すでに他で使われているアドレスを入力しても、Better Authは成功と同じ応答を返し、メールも送らない
// (登録済みかどうかを推測させないため)。この画面も、成功と同じ案内を出し、メールが届かない場合の
// 確認事項に「他で使われていないか」を含めることで、そのことを利用者に推測させない範囲で伝える。
//
// このエンドポイントもログインからの経過時間(freshAge)を条件にしない(better-auth 1.7.5。
// change-passwordと同じsensitiveSessionMiddlewareのみ)ため、「もう一度ログインしてください」の案内は無い。
// 開くたびに入力欄を空にするため、呼び出し側は開いている間だけこの部品を描画する
export function ChangeEmailDialog({ currentEmail, onClose }: ChangeEmailDialogProps) {
  const [newEmail, setNewEmail] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // 申請が受け付けられたときの変更後のアドレス(入力欄の値は申請後に変えられるため別に持つ)
  const [requestedEmail, setRequestedEmail] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFieldError(null)
    setErrorMessage(null)

    const trimmedEmail = newEmail.trim()
    if (trimmedEmail.toLowerCase() === currentEmail.toLowerCase()) {
      setFieldError('今のメールアドレスと同じです')
      return
    }

    setIsSubmitting(true)
    // callbackURLは、メール内のリンクを開いた後に戻る画面。変更後のアドレスを入れておき、アカウント設定画面が
    // 二段階のどちらまで済んだかを見分けて案内する(src/frontend/lib/email-change-result.ts)
    const { error } = await authClient.changeEmail({
      newEmail: trimmedEmail,
      callbackURL: `/app/account?emailChange=${encodeURIComponent(trimmedEmail)}`,
    })
    setIsSubmitting(false)

    if (error) {
      setErrorMessage(translateAuthErrorCode(error.code))
      return
    }

    setRequestedEmail(trimmedEmail)
  }

  if (requestedEmail !== null) {
    return (
      <Dialog key="requested" isOpen onClose={onClose} title="承認メールを送りました" footer={<Button onClick={onClose}>閉じる</Button>}>
        <AlertMessage tone="success">今のアドレス({currentEmail})に承認メールを送りました。</AlertMessage>
        <p>
          メール内のリンクを開いて承認すると、{requestedEmail} に確認メールが届きます。そのメールのリンクを開くと、メールアドレスが変更されます。
        </p>
        <p className="field__hint">
          この時点では、メールアドレスはまだ変更されていません。リンクの有効期限は1時間です。メールが届かない場合は、迷惑メールフォルダや、入力したアドレスに間違いがないか、すでに他のアカウントで使われていないかをご確認ください。
        </p>
      </Dialog>
    )
  }

  return (
    <Dialog
      key="form"
      isOpen
      onClose={onClose}
      title="メールアドレスの変更"
      fullScreenOnMobile
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          {/* ボタンはDialogのfooterにあり<form>の外なので、form属性で送信先のフォームを指定する */}
          <Button type="submit" form="change-email-form" disabled={isSubmitting}>
            {isSubmitting ? '送信中…' : '承認メールを送る'}
          </Button>
        </>
      }
    >
      <form id="change-email-form" onSubmit={handleSubmit}>
        {errorMessage && <AlertMessage tone="error">{errorMessage}</AlertMessage>}
        <p className="field__hint">
          なりすまし防止のため、今のメールアドレス({currentEmail})に承認メールを送ります。承認後、新しいアドレスに届く確認メールのリンクを開くと、メールアドレスが変更されます。
        </p>
        <FormField
          fieldId="change-email-new"
          label="新しいメールアドレス"
          errorMessage={fieldError ?? undefined}
          inputProps={{
            type: 'email',
            required: true,
            autoComplete: 'email',
            value: newEmail,
            onChange: (e) => setNewEmail(e.target.value),
          }}
        />
      </form>
    </Dialog>
  )
}
