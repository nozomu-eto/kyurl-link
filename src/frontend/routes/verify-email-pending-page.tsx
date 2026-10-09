/** @jsxImportSource react */
import { type FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { AlertMessage } from '@/frontend/components/alert-message'
import { authClient, translateAuthErrorCode } from '@/frontend/lib/auth-client'
import { Button, ButtonLink } from '@/frontend/components/button'
import { FormCard } from '@/frontend/components/card'
import { FormField } from '@/frontend/components/form-field'
import { Page } from '@/frontend/components/page'
import { Toast } from '@/frontend/components/toast'
import { getRemainingResendSeconds, recordVerificationEmailSentAt, RESEND_INTERVAL_SECONDS } from '@/frontend/lib/verify-email-resend-timer'

// VerifyEmailPendingPage: サインアップ直後に案内する「メール確認待ち」画面
// (docs/architecture.mdの「画面ごとの確定仕様」、docs/mocks/AuthVerifyPending.html)。
// auth.ts(emailVerification.sendOnSignUp: true)により、この画面へ来る時点ですでに
// 確認メールは送信済みという前提で、送信先・再送・メールアドレスの修正を提供する。
// なお、auth.tsではrequireEmailVerification(未確認ユーザーのログイン禁止)はあえて
// 設定していない(ソフト確認方式)ため、未確認のままでも他の画面は引き続き利用できる
export function VerifyEmailPendingPage() {
  const { data: session, isPending: isSessionPending } = authClient.useSession()

  const [resendState, setResendState] = useState<'idle' | 'sending' | 'error'>('idle')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  // 再送ボタンの待ち時間(秒)。0になるまで毎秒カウントダウンする
  const [remainingSeconds, setRemainingSeconds] = useState(0)

  // メールアドレス修正フォームの開閉と入力値
  const [isEditingEmail, setIsEditingEmail] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [isChangingEmail, setIsChangingEmail] = useState(false)
  const [changeEmailErrorMessage, setChangeEmailErrorMessage] = useState<string | null>(null)
  // 変更に成功した後の送信先アドレス。authClient.useSession()のキャッシュが更新されるまでの
  // 間も画面にすぐ反映するため、変更後はこちらを優先して表示する
  const [changedEmail, setChangedEmail] = useState<string | null>(null)

  const displayedEmail = changedEmail ?? session?.user.email

  // 画面を開いた時点で、sessionStorageに記録済みの残り待ち時間を反映する
  useEffect(() => {
    if (!session) {
      return
    }
    setRemainingSeconds(getRemainingResendSeconds(session.user.id))
  }, [session?.user.id])

  // 1秒ごとにカウントダウンする(0になったら停止)
  useEffect(() => {
    if (remainingSeconds <= 0) {
      return
    }
    const timer = setTimeout(() => setRemainingSeconds((seconds) => Math.max(0, seconds - 1)), 1000)
    return () => clearTimeout(timer)
  }, [remainingSeconds])

  // 「確認メールを再送」ボタンのクリックハンドラ。ログイン中ユーザーのメールアドレス
  // (修正済みの場合は修正後のアドレス)宛に再度送信する
  async function handleResendClick() {
    if (!session || !displayedEmail) {
      return
    }

    setResendState('sending')
    const { error } = await authClient.sendVerificationEmail({
      email: displayedEmail,
      callbackURL: '/app',
    })
    setResendState(error ? 'error' : 'idle')

    if (!error) {
      recordVerificationEmailSentAt(session.user.id)
      setRemainingSeconds(RESEND_INTERVAL_SECONDS)
      setToastMessage('確認メールを再送しました')
    }
  }

  // 「このアドレスに送り直す」ボタンのクリックハンドラ。authClient.changeEmail()は、
  // 確認前(emailVerified: false)のアドレスに限りその場でアドレスを変更し、新しいアドレスに
  // 確認メールを送る(auth.tsのuser.changeEmail参照)。
  //
  // Better Authは、すでに使われているアドレスが指定された場合も、登録の有無を漏らさない
  // ため成功と同じ応答(エラーなし)を返すが、実際にはアドレスを変更しない。そのため、
  // 応答がエラー無しだった場合でも、セッションを取り直して実際にアドレスが変わったかを
  // 確認したうえで結果を判断する(disableCookieCache: trueで、変更直後のCookieキャッシュを
  // 経由せず必ずサーバーへ問い合わせる)
  async function handleChangeEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session) {
      return
    }

    setChangeEmailErrorMessage(null)
    setIsChangingEmail(true)

    const { error } = await authClient.changeEmail({ newEmail, callbackURL: '/app' })

    if (error) {
      setIsChangingEmail(false)
      // 「今と同じアドレス」の場合、Better Auth側がcodeを設定せずmessageのみを返す
      // (2026-09時点のソース確認済み)ため、translateAuthErrorCodeのcodeベースの判定では
      // 拾えず、このメッセージだけをここで個別に判定する
      if (error.message === 'Email is the same') {
        setChangeEmailErrorMessage('今と同じメールアドレスです。別のアドレスを入力してください')
      } else {
        setChangeEmailErrorMessage(translateAuthErrorCode(error.code))
      }
      return
    }

    const { data: freshSession } = await authClient.getSession({ query: { disableCookieCache: true } })
    setIsChangingEmail(false)

    if (freshSession?.user.email !== newEmail.toLowerCase()) {
      // すでに使われているアドレスだったため、実際には変更されなかった場合。
      // 「すでに使われている」とは書かない(登録の有無を漏らさないため)
      setChangeEmailErrorMessage('メールアドレスを変更できませんでした。入力内容をご確認のうえ、別のアドレスをお試しください。')
      return
    }

    setChangedEmail(freshSession.user.email)
    recordVerificationEmailSentAt(session.user.id)
    setRemainingSeconds(RESEND_INTERVAL_SECONDS)
    setIsEditingEmail(false)
    setNewEmail('')
    setToastMessage('新しいメールアドレスに確認メールを送りました')
  }

  return (
    <Page contained title="確認メールを送りました">
      {isSessionPending ? (
        <p>読み込み中…</p>
      ) : !session ? (
        // ログインしていない状態でこの画面に直接アクセスした場合
        // (ブックマーク・メールのリンク切れ等を想定した保険的な表示)
        <p>
          ログイン情報が確認できませんでした。<Link to="/login">ログイン</Link>してから再度お試しください。
        </p>
      ) : session.user.emailVerified ? (
        <>
          <AlertMessage tone="success">メールアドレスの確認は完了しています。</AlertMessage>
          <ButtonLink to="/app">ダッシュボードへ進む</ButtonLink>
        </>
      ) : (
        <>
          <div className="field">
            <span className="field__label">送信先</span>
            <span>{displayedEmail}</span>
            <Button variant="text" onClick={() => setIsEditingEmail((value) => !value)}>
              メールアドレスを修正する
            </Button>
          </div>

          {isEditingEmail && (
            <FormCard onSubmit={handleChangeEmailSubmit}>
              {changeEmailErrorMessage && <AlertMessage tone="error">{changeEmailErrorMessage}</AlertMessage>}
              <FormField
                fieldId="verify-email-new-email"
                label="新しいメールアドレス"
                inputProps={{
                  type: 'email',
                  required: true,
                  autoComplete: 'email',
                  value: newEmail,
                  onChange: (e) => setNewEmail(e.target.value),
                }}
              />
              <Button type="submit" disabled={isChangingEmail}>
                {isChangingEmail ? '送信中…' : 'このアドレスに送り直す'}
              </Button>
            </FormCard>
          )}

          <p>メールに記載されたリンクを開くと、登録が完了します。リンクの有効期限は1時間です。</p>
          <p className="field__hint">数分たっても届かない場合は、迷惑メールフォルダもご確認ください。</p>

          {resendState === 'error' && <AlertMessage tone="error">再送信に失敗しました。時間をおいて再度お試しください。</AlertMessage>}

          <Button variant="secondary" disabled={resendState === 'sending' || remainingSeconds > 0} onClick={handleResendClick}>
            {resendState === 'sending'
              ? '送信中…'
              : remainingSeconds > 0
                ? `確認メールを再送(${remainingSeconds}秒後に再送できます)`
                : '確認メールを再送'}
          </Button>

          {/* 新規登録の直後はログイン済みのため、モックの「ログイン画面へ戻る」ではなく
              「確認せずにダッシュボードへ進む」を使う(確認前でも利用できる方針のため) */}
          <p>
            <Link to="/app">確認せずにダッシュボードへ進む</Link>
          </p>
        </>
      )}

      {toastMessage && <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />}
    </Page>
  )
}
