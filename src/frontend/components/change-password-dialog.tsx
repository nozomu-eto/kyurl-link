/** @jsxImportSource react */
import { type FormEvent, useState } from 'react'
import { AlertMessage } from '@/frontend/components/alert-message'
import { Button } from '@/frontend/components/button'
import { Dialog } from '@/frontend/components/dialog'
import { FormField } from '@/frontend/components/form-field'
import { authClient, translateAuthErrorCode } from '@/frontend/lib/auth-client'

// サーバー(Better Auth)の既定の最小文字数と、サインアップ・パスワード再設定の画面に合わせる
const MIN_PASSWORD_LENGTH = 8

type FieldErrors = { currentPassword?: string; newPassword?: string; confirmPassword?: string }

type ChangePasswordDialogProps = {
  onClose: () => void
}

// ChangePasswordDialog: パスワード変更のダイアログ(docs/mocks/ExpiryDialog.html等の既存ダイアログに合わせる。
// 入力を伴うためスマホでは全画面。「フロントデザインの全面見直し」)。今のパスワード・新しいパスワード・新しいパスワード(確認)を入力し、
// Better Authのchange-passwordを呼ぶ。他の端末のログイン状態は無効にする(revokeOtherSessions: true)。
//
// このエンドポイントはログインからの経過時間(freshAge)を条件にしない
// (better-auth 1.7.5: changePasswordはsensitiveSessionMiddlewareのみを使い、これはDB上のセッションの存在だけを
// 確認する。経過時間を見るfreshSessionMiddlewareはlist-sessions等でしか使われない)。
// そのため「もう一度ログインしてください」という鮮度切れの案内は出さない。
// 開くたびに入力欄を空にするため、呼び出し側は開いている間だけこの部品を描画する
export function ChangePasswordDialog({ onClose }: ChangePasswordDialogProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)

    // 確認欄との不一致は、サーバーに送る前に画面で止める
    if (newPassword !== confirmPassword) {
      setFieldErrors({ confirmPassword: '新しいパスワードが一致しません' })
      return
    }
    setFieldErrors({})
    setIsSubmitting(true)

    const { error } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })

    setIsSubmitting(false)

    if (error) {
      // 今のパスワードの誤りと、新しいパスワードが条件を満たさない場合は、該当の入力欄の下に表示する
      if (error.code === 'INVALID_PASSWORD') {
        setFieldErrors({ currentPassword: '今のパスワードが正しくありません' })
      } else if (error.code === 'PASSWORD_TOO_SHORT') {
        setFieldErrors({ newPassword: `新しいパスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください` })
      } else if (error.code === 'PASSWORD_TOO_LONG') {
        setFieldErrors({ newPassword: '新しいパスワードが長すぎます' })
      } else {
        setErrorMessage(translateAuthErrorCode(error.code))
      }
      return
    }

    setIsCompleted(true)
  }

  if (isCompleted) {
    return (
      <Dialog
        key="completed"
        isOpen
        onClose={onClose}
        title="パスワードを変更しました"
        footer={<Button onClick={onClose}>閉じる</Button>}
      >
        <AlertMessage tone="success">新しいパスワードに変更しました。</AlertMessage>
        {/* revokeOtherSessions: trueにより、この端末以外のログイン状態はすべて無効になっている */}
        <p className="field__hint">他の端末ではログアウトされました。</p>
      </Dialog>
    )
  }

  return (
    <Dialog
      key="form"
      isOpen
      onClose={onClose}
      title="パスワードの変更"
      fullScreenOnMobile
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          {/* ボタンはDialogのfooterにあり<form>の外なので、form属性で送信先のフォームを指定する */}
          <Button type="submit" form="change-password-form" disabled={isSubmitting}>
            {isSubmitting ? '変更中…' : 'パスワードを変更する'}
          </Button>
        </>
      }
    >
      <form id="change-password-form" onSubmit={handleSubmit}>
        {errorMessage && <AlertMessage tone="error">{errorMessage}</AlertMessage>}
        <FormField
          fieldId="change-password-current"
          label="今のパスワード"
          errorMessage={fieldErrors.currentPassword}
          inputProps={{
            type: 'password',
            required: true,
            autoComplete: 'current-password',
            value: currentPassword,
            onChange: (e) => setCurrentPassword(e.target.value),
          }}
        />
        <FormField
          fieldId="change-password-new"
          label="新しいパスワード"
          hint={`${MIN_PASSWORD_LENGTH}文字以上で入力してください`}
          errorMessage={fieldErrors.newPassword}
          inputProps={{
            type: 'password',
            required: true,
            minLength: MIN_PASSWORD_LENGTH,
            autoComplete: 'new-password',
            value: newPassword,
            onChange: (e) => setNewPassword(e.target.value),
          }}
        />
        <FormField
          fieldId="change-password-confirm"
          label="新しいパスワード(確認)"
          errorMessage={fieldErrors.confirmPassword}
          inputProps={{
            type: 'password',
            required: true,
            autoComplete: 'new-password',
            value: confirmPassword,
            onChange: (e) => setConfirmPassword(e.target.value),
          }}
        />
        <p className="field__hint">変更すると、この端末以外のログイン状態はすべて無効になります。</p>
      </form>
    </Dialog>
  )
}
