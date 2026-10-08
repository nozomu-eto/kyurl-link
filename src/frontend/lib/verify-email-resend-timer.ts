// 確認メール再送ボタンの60秒の待ち時間を管理する(docs/architecture.md 第6.7節
// 「メール確認待ち」画面)。サーバー側(src/lib/email-resend-limit.ts)は同じメールアドレスに
// つき60秒以内の再送を黙って送らないため、画面側の待ち時間もこれに合わせる必要がある。
// 再読み込みでカウントが消えると、待ち時間が無いように見えて押しても送られない状態に
// なってしまうため、最後に送信した時刻をsessionStorageに記録して再読み込みをまたいで残す

// サーバー側(wrangler.jsoncのEMAIL_RESEND_RATE_LIMITER)と同じ60秒
export const RESEND_INTERVAL_SECONDS = 60

// sessionStorageのキー。ユーザーIDを含めることで、同じブラウザで別アカウントに
// ログインした場合に他人の待ち時間を引き継がないようにする
function storageKey(userId: string): string {
  return `verify-email-resent-at:${userId}`
}

// recordVerificationEmailSentAt: 確認メールを送信した時刻(今)を記録する。
// 新規登録直後(サインアップ時の自動送信)と、再送ボタン押下の両方から呼ぶ。
// sessionStorageが使えない環境(プライベートブラウジングでの制限等)でも動作を止めないよう、
// try/catchで囲み失敗しても何もしない(待ち時間なしで動く=常にすぐ再送できる状態になるだけ)
export function recordVerificationEmailSentAt(userId: string): void {
  try {
    sessionStorage.setItem(storageKey(userId), String(Date.now()))
  } catch {
    // 何もしない(上記コメント参照)
  }
}

// getRemainingResendSeconds: 記録した送信時刻から、再送ボタンを押せるようになるまでの
// 残り秒数を返す(記録が無い・読み取れない場合は0=すぐ押せる)
export function getRemainingResendSeconds(userId: string): number {
  let sentAtText: string | null = null
  try {
    sentAtText = sessionStorage.getItem(storageKey(userId))
  } catch {
    return 0
  }

  if (!sentAtText) {
    return 0
  }

  const elapsedSeconds = (Date.now() - Number(sentAtText)) / 1000
  return Math.max(0, Math.ceil(RESEND_INTERVAL_SECONDS - elapsedSeconds))
}
