// プレビュー環境(kyurl-linkのプレビューデプロイ、https://<プレビューID>-kyurl-link.teddies-01yolk.workers.dev)
// からのログイン・新規登録を確認できるようにするため、Better Authのtrusted originsに追加で
// 信頼させたい接続元を、環境変数BETTER_AUTH_TRUSTED_ORIGINS(カンマ区切り)から読み取るための
// 検証・変換処理。本番ではこの環境変数を設定しないため、trustedOriginsは空配列のままになり
// (Better Authは常にbaseURLを信頼するため、本番の動きは変わらない)、本関数はプレビュー環境
// 専用の値を扱う前提で書いている。
//
// teddies-01yolk.workers.devはCloudflareアカウント共通のworkers.devサブドメインであり、
// 同じアカウントの他のWorker(youtube-transcript-mcp・tech-watch等)もこのドメインの下で
// 動いている。プレビュー環境は本番と同じD1を使うため、「*.teddies-01yolk.workers.dev」のように
// このドメイン全体を許可する形にすると、他のWorkerのプレビューURLまで信頼してしまい、
// kyurl-linkのD1に対してBetter Authの認証済みリクエストを送れてしまう。そのため、
// kyurl-linkのプレビューURLの命名規則(「<プレビューID>-kyurl-link.teddies-01yolk.workers.dev」)に
// 一致する接続元だけを許可する
const TRUSTED_PREVIEW_ORIGIN_PATTERN = /^https:\/\/(?:\*|[a-zA-Z0-9-]+)-kyurl-link\.teddies-01yolk\.workers\.dev$/

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
