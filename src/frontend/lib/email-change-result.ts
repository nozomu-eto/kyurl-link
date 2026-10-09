// メールアドレス変更のメール内リンクを開いた後に戻ってくる画面(/app/account?emailChange=...)で表示する案内を決める処理。
//
// 確認済みユーザーのメールアドレス変更は二段階の確認になる(src/lib/auth.tsのuser.changeEmail参照):
//   ①今のアドレスの承認リンクを開く → 新しいアドレスへ確認メールが送られる(アドレスはまだ変わらない)
//   ②新しいアドレスの確認リンクを開く → アドレスが変わる
// Better Authは①②のどちらのリンクを開いた後も、同じcallbackURLへリダイレクトする(途中で値を変えられない)。
// そこで、callbackURLに変更後のアドレスを入れておき(?emailChange=<変更後のアドレス>)、ログイン中のアドレスが
// それと一致するかどうかで①②を見分ける。失敗時はBetter Authが同じURLに?error=<コード>を付けて戻す

export type EmailChangeResult = { tone: 'success' | 'error'; message: string }

// メールアドレスの形式かどうかの簡易チェック。URLのクエリは誰でも書き換えられるため、
// 画面に表示してよい値かをここで絞る(React側でエスケープされるため、これは文言の紛らわしさを減らす目的)
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function describeEmailChangeResult(searchParams: URLSearchParams, currentEmail: string): EmailChangeResult | null {
  const newEmail = searchParams.get('emailChange')
  // このフロー以外で?error=が付いている場合は何も出さない
  if (newEmail === null) {
    return null
  }

  const errorCode = searchParams.get('error')
  if (errorCode !== null) {
    if (errorCode === 'INVALID_USER') {
      return { tone: 'error', message: 'このリンクは別のアカウントのものです。変更を申請したアカウントでログインして、もう一度リンクを開いてください。' }
    }
    if (errorCode === 'TOKEN_EXPIRED' || errorCode === 'INVALID_TOKEN') {
      return { tone: 'error', message: 'リンクの有効期限が切れているか、無効なリンクです。お手数ですが、メールアドレスの変更を最初からやり直してください。' }
    }
    return { tone: 'error', message: 'メールアドレスの変更を完了できませんでした。お手数ですが、最初からやり直してください。' }
  }

  if (!EMAIL_PATTERN.test(newEmail)) {
    return null
  }

  if (newEmail.toLowerCase() === currentEmail.toLowerCase()) {
    return { tone: 'success', message: `メールアドレスを ${newEmail} に変更しました。` }
  }

  return {
    tone: 'success',
    message: `承認を受け付けました。${newEmail} に確認メールを送りました。そのメールのリンクを開くと、メールアドレスの変更が完了します。`,
  }
}
