/** @jsxImportSource react */
import { useState } from 'react'
import { Link } from 'react-router'
import { AlertMessage } from '@/frontend/components/alert-message'
import { authClient } from '@/frontend/lib/auth-client'
import { Button, ButtonLink } from '@/frontend/components/button'
import { Page } from '@/frontend/components/page'

// VerifyEmailPendingPage: サインアップ直後に案内する「メール確認待ち」画面。
// docs/architecture.md 第6.1節の必須画面の1つ。auth.ts(emailVerification.sendOnSignUp: true)
// により、この画面へ来る時点ですでに確認メールは送信済みという前提で、
// 「メールを確認してください」という案内と「再送信」ボタンのみを提供する。
// なお、auth.tsではrequireEmailVerification(未確認ユーザーのログイン禁止)はあえて
// 設定していない(ソフト確認方式)ため、未確認のままでも他の画面は引き続き利用できる
export function VerifyEmailPendingPage() {
  const { data: session, isPending: isSessionPending } = authClient.useSession()
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  // 「確認メールを再送信」ボタンのクリックハンドラ。
  // ログイン中ユーザーのメールアドレス宛に再度送信する
  async function handleResendClick() {
    if (!session) {
      return
    }

    setResendState('sending')
    const { error } = await authClient.sendVerificationEmail({
      email: session.user.email,
      callbackURL: '/app',
    })
    setResendState(error ? 'error' : 'sent')
  }

  return (
    <Page contained title="メールアドレスの確認をお願いします">

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
          <ButtonLink to="/app">
            ダッシュボードへ進む
          </ButtonLink>
        </>
      ) : (
        <>
          <p>
            {session.user.email} 宛に確認メールを送信しました。メール内のリンクをクリックして、メールアドレスの確認を完了してください。
          </p>
          <p className="field__hint">メールが届かない場合は、迷惑メールフォルダもご確認ください。</p>

          {resendState === 'sent' && <AlertMessage tone="success">確認メールを再送信しました。</AlertMessage>}
          {resendState === 'error' && <AlertMessage tone="error">再送信に失敗しました。時間をおいて再度お試しください。</AlertMessage>}

          <Button variant="secondary" disabled={resendState === 'sending'} onClick={handleResendClick}>
            {resendState === 'sending' ? '送信中…' : '確認メールを再送信'}
          </Button>

          <p>
            <Link to="/app">確認せずにダッシュボードへ進む</Link>
          </p>
        </>
      )}
    </Page>
  )
}
