// 確認メール再送(/send-verification-email、新規登録直後の自動送信も含む)と
// パスワード再設定申請(/request-password-reset)を、同じメールアドレスにつき60秒に1回までに
// 制限する(docs/architecture.md 第7節)。src/lib/auth.tsのsendVerificationEmail・
// sendResetPasswordから呼び出す

export type EmailResendPurpose = 'verify' | 'reset'

// 前後の空白を除去して小文字にしたメールアドレスをSHA-256でハッシュ化する。
// メールアドレスそのものをキー・ログに残さないため(万一のログ流出時の影響を減らす)
async function hashEmail(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase()
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

// 送信してよければtrue、制限に当たっていれば送信せずfalseを返す。
// 429を返すAPIレスポンスとは異なり、呼び出し元はfalseの場合でも成功扱い(200/送信済みの体で終える)にする。
// 429にすると「登録済みのメールアドレスの時だけ応答が変わる」ことになり、登録の有無を
// 外部から調べられてしまうため(特にパスワード再設定は未登録アドレスでも同じ応答にする必要がある)。
//
// Cloudflare公式ドキュメントでは、この制限機能(Rate Limiting binding)は拠点ごとの概算であり、
// 正確な回数管理用ではないとされている。ここでの目的は「迷惑メールの連打防止」であり、
// 多少の誤差(ごく稀に制限をすり抜けて連続送信される、または逆に早めに制限される)は許容する
export async function shouldSendResendLimitedEmail(
  rateLimiter: RateLimit,
  purpose: EmailResendPurpose,
  email: string,
): Promise<boolean> {
  const hash = await hashEmail(email)
  // 確認メールとパスワード再設定が互いに制限し合わないよう、用途の接頭辞をキーに含める
  const key = `${purpose}:${hash}`
  const { success } = await rateLimiter.limit({ key })

  if (!success) {
    // メールアドレスそのものはログに出さず、ハッシュのみ残す
    console.warn(`メール送信を制限しました(用途: ${purpose}, キー: ${key})`)
  }

  return success
}
