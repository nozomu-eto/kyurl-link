// wrangler types(pnpm cf-typegen)はwrangler.jsoncに宣言されたbinding(D1等)のみを反映する。
// BETTER_AUTH_URL/BETTER_AUTH_SECRETは.dev.vars(ローカル)やwrangler secret(本番)で
// 値を設定するシークレットのためwrangler.jsoncには書かず、その分型定義もここで補う。
interface CloudflareBindings {
  // Better Authのベースとなるアプリケーション公開URL(例: http://localhost:5173)
  BETTER_AUTH_URL: string
  // Better Authがセッション等の署名・暗号化に使う秘密鍵
  BETTER_AUTH_SECRET: string
}
