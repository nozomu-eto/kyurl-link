import { createAuthClient } from 'better-auth/react'

// Better Authのクライアント(React用)。サインアップ・ログイン・パスワードリセット等の
// /api/auth/*エンドポイントと通信するために使う。フロントエンドとAPIは同一Worker・
// 同一オリジンで配信されるため、baseURLは省略時に自動でwindow.location.originが使われる

export const authClient = createAuthClient()

// authClient.useSession()のdata.userの型(ログイン中ユーザー情報)。
// ルートのloader・コンポーネント双方でログイン状態を扱う際の型注釈に使う
export type AuthUser = NonNullable<ReturnType<typeof authClient.useSession>['data']>['user']

// Better Authの主要なエラーコードを、利用者向けの日本語メッセージに変換する。
// Better Auth自体はエラーメッセージを英語でしか返さないため、ログイン・サインアップ・
// パスワードリセット等の各画面でこの関数を通してから表示する。
// 未知のコードは汎用メッセージにフォールバックする
export function translateAuthErrorCode(code: string | undefined): string {
  switch (code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
      return 'メールアドレスまたはパスワードが正しくありません'
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return 'このメールアドレスはすでに登録されています'
    case 'USER_NOT_FOUND':
      return '該当するアカウントが見つかりません'
    case 'INVALID_TOKEN':
      return 'リンクの有効期限が切れているか、無効なリンクです。もう一度お試しください'
    case 'PASSWORD_TOO_SHORT':
      return 'パスワードが短すぎます'
    case 'PASSWORD_TOO_LONG':
      return 'パスワードが長すぎます'
    case 'TERMS_NOT_ACCEPTED':
      return '利用規約とプライバシーポリシーへの同意が必要です'
    // Better Auth側のリクエストボディのzod検証失敗(不正な形式のメールアドレス等)。
    // 特定のエンドポイントに限らず共通のコードのため、汎用の文言にする
    case 'VALIDATION_ERROR':
      return '入力内容の形式が正しくありません'
    // src/lib/auth.tsのhooks.beforeで、確認済みユーザーからの/change-emailを拒否した場合の
    // コード。この画面(verify-email-pending-page.tsx)は未確認ユーザーにしか
    // メールアドレス修正フォームを出さないため通常は発生しないが、念のため用意しておく
    case 'EMAIL_CHANGE_NOT_AVAILABLE':
      return 'メールアドレスの変更は現在ご利用いただけません'
    default:
      return '処理に失敗しました。時間をおいて再度お試しください'
  }
}
