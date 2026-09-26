// プレビュー環境(*.teddies-01yolk.workers.dev)からのログイン・新規登録を確認できるようにするため、
// Better Authのtrusted originsに追加で信頼させたい接続元を、環境変数
// BETTER_AUTH_TRUSTED_ORIGINS(カンマ区切り)から読み取るための検証・変換処理。
// 本番ではこの環境変数を設定しないため、trustedOriginsは空配列のままになり
// (Better Authは常にbaseURLを信頼するため、本番の動きは変わらない)、本関数は
// プレビュー環境専用の値を扱う前提で書いている。
//
// ワイルドカード(*)を使う場合も、アカウントのworkers.devサブドメイン
// (teddies-01yolk.workers.dev)1段分のラベルにしか一致しない正規表現で検証することで、
// 設定ミスや値の混入で任意の接続元を許可する設定(例: "*"や"https://*")にならないようにする
const TRUSTED_PREVIEW_ORIGIN_PATTERN = /^https:\/\/(?:\*|[a-zA-Z0-9-]+)\.teddies-01yolk\.workers\.dev$/

// BETTER_AUTH_TRUSTED_ORIGINSの値(カンマ区切り、未設定・空文字ならundefined)を検証しつつ、
// Better Authのtrusted originsに渡せる配列に変換する。
// TRUSTED_PREVIEW_ORIGIN_PATTERNに一致しない値は、安全側に倒して読み捨てる
// (エラーにはせず、単に信頼しない接続元として扱う。ローカル開発・本番では未設定のため空配列になる)
export function parseTrustedOrigins(rawValue: string | undefined): string[] {
  if (!rawValue) {
    return []
  }

  return rawValue
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .filter((origin) => TRUSTED_PREVIEW_ORIGIN_PATTERN.test(origin))
}
