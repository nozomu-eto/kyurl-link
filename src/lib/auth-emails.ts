// サインアップ時のメールアドレス確認・パスワードリセットの通知メール件名・本文テンプレート
// (docs/architecture.md 第11節)。account-deletion-emails.tsと同程度のトーン(丁寧・簡潔な
// 日本語のプレーンテキスト)に揃える

// メールアドレス確認メール。Better Authのemail-verificationプラグインの
// sendVerificationEmailコールバックから呼び出す。urlはトークン付きの確認リンクで、
// クリックすると/api/auth/verify-emailで検証された後、callbackURLへリダイレクトされる
export function buildEmailVerificationEmail(url: string): { subject: string; text: string } {
  return {
    subject: '【kyurl.link】メールアドレスの確認をお願いします',
    text: `kyurl.linkにご登録いただきありがとうございます。

以下のリンクをクリックして、メールアドレスの確認を完了してください。

${url}

リンクの有効期限は1時間です。期限が切れた場合は、ログイン後に確認メールを再送してください。

このメールに心当たりがない場合は、破棄していただいて問題ありません。

ご不明点は info@kyurl.link までご連絡ください。`,
  }
}

// パスワードリセットメール。Better Authのemail-and-passwordプラグインの
// sendResetPasswordコールバックから呼び出す。urlはトークン付きのリセットリンクで、
// クリックするとフロントエンドのパスワード再設定画面(/reset-password/confirm)へ
// トークン付きで遷移する
export function buildPasswordResetEmail(url: string): { subject: string; text: string } {
  return {
    subject: '【kyurl.link】パスワード再設定のご案内',
    text: `パスワード再設定のお申し込みを受け付けました。

以下のリンクから新しいパスワードを設定してください。

${url}

リンクの有効期限は1時間です。一度使うと無効になります。

このメールに心当たりがない場合は、第三者が誤ってメールアドレスを入力した可能性があります。
その場合は本メールを破棄していただいて問題ありません(このリンクからパスワードが変更されることはありません)。

ご不明点は info@kyurl.link までご連絡ください。`,
  }
}
