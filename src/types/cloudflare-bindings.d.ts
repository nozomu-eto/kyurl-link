// wrangler types(pnpm cf-typegen)はwrangler.jsoncに宣言されたbinding(D1等)、または
// .dev.varsに実際に値がある変数のみを反映する。BETTER_AUTH_URL/BETTER_AUTH_SECRET/
// ANALYTICS_API_TOKENは.dev.vars(ローカル)やwrangler secret(本番)で値を設定する
// シークレットのためwrangler.jsoncには書かず、その分型定義もここで補う。
//
// CloudflareBindingsとCloudflare.Env(cloudflare:testのenvが使う型)はどちらも
// worker-configuration.d.tsの__BaseEnv_CloudflareBindingsを継承する別々のinterfaceのため、
// 両方に反映されるよう、ここでは共通の親であるこちらを拡張する
interface __BaseEnv_CloudflareBindings {
  // Better Authのベースとなるアプリケーション公開URL(例: http://localhost:5173)
  BETTER_AUTH_URL: string
  // Better Authがセッション等の署名・暗号化に使う秘密鍵
  BETTER_AUTH_SECRET: string
  // Analytics Engine SQL API(GET /api/v1/links/:id/clicks)への問い合わせに使うAPIトークン
  ANALYTICS_API_TOKEN: string
  // URLhaus API(悪意あるURL検知、docs/architecture.md 第4節)への問い合わせに使うAuth-Key。
  // https://auth.abuse.ch/ で無料発行される。未設定の場合、URLhaus照会はスキップされ
  // fail-open(securityStatus: 'unscanned')として扱われる
  URLHAUS_API_KEY: string
}
