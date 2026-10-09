import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { NONCE, secureHeaders, type SecureHeadersVariables } from 'hono/secure-headers'
import { links as linksTable } from '@/db/schema'
import { runAccountDeletionBatch } from '@/lib/account-deletion-batch'
import { auth } from '@/lib/auth'
import { computeLinkDisplayStatus } from '@/lib/link-status'
import { runLinkSecurityFullScan } from '@/lib/link-security-scan-batch'
import { goneePageHtml, notFoundPageHtml, securityWarningPageHtml } from '@/lib/redirect-pages'
import accountRequests from '@/routes/account-requests'
import links from '@/routes/links'
import posters from '@/routes/posters'
import qrcodes from '@/routes/qrcodes'
import reports from '@/routes/reports'

// secureHeadersのNONCE(下記CSP設定)がc.set('secureHeadersNonce', ...)する値を
// c.get()で型付きで取得できるよう、VariablesにSecureHeadersVariablesを加える
const app = new Hono<{ Bindings: CloudflareBindings; Variables: SecureHeadersVariables }>()

// セキュリティヘッダ。app.use('*', ...)で全ルート(API・リダイレクト・
// 404/410/警告インターステシャル・SPA/静的アセット)に一律で付与する。
// hono/secure-headersのミドルウェアはHono側のResponse(ctx.res)に対してヘッダーを
// 後付けで設定する実装のため、ハンドラの実装がc.html()・c.json()・c.redirect()・
// c.env.ASSETS.fetch()の委譲のいずれであっても、返り値がResponseである限り同じ仕組みで
// 適用される想定(実際にASSETS委譲のレスポンスでも付与されることをsrc/index.test.tsxで確認済み)。
// 明示的に値を指定した4項目以外はhono/secure-headersの既定値(Cross-Origin-Resource-Policy等)
// をそのまま使う。CSP(Content-Security-Policy-Report-Only)はT9で別途追加する
app.use(
  '*',
  secureHeaders({
    // HSTS: 1年間(31536000秒)、サブドメインを含めて有効化する
    strictTransportSecurity: 'max-age=31536000; includeSubDomains',
    // MIMEタイプスニッフィング対策。値は既定と同じ'nosniff'だが、要件を明示するためtrueではなく
    // 文字列で指定する
    xContentTypeOptions: 'nosniff',
    // Referrerポリシー。hono/secure-headersの既定値は'no-referrer'だが、他サイトへの遷移時に
    // オリジンのみは送りたい(アクセス解析・リンク元の把握のため)ため、要件通りの値を明示する
    referrerPolicy: 'strict-origin-when-cross-origin',
    // クリックジャッキング対策。他サイトのiframeに埋め込まれることを一切許可しない
    xFrameOptions: 'DENY',
    // CSP。既存ページを壊すリスクを避けるため、まずはContent-Security-Policy
    // ではなくContent-Security-Policy-Report-Only(違反はブロックせずレポートのみ)で導入する。
    // 本番で強制する(Content-Security-Policyへの切り替え)手順はdocs/deployment.md参照
    contentSecurityPolicyReportOnly: {
      // 既定値はself(同一オリジン)のみ。フォント方針(docs/architecture.mdの「フォント方針」)により
      // フォントもFontsourceで自前配信(同一オリジン)のため、Google Fonts等の外部ホストは
      // 一切加えない
      defaultSrc: ["'self'"],
      // 警告インターステシャル(src/lib/redirect-pages.ts)のインラインscriptにはNONCEを使う。
      // 加えて、サインアップ画面(SPA、turnstile-widget.tsx)・警告インターステシャルの
      // 通報フォームの両方がCloudflare Turnstileの外部スクリプト(challenges.cloudflare.com)を
      // 読み込むため、そのホストも許可する
      scriptSrc: ["'self'", 'https://challenges.cloudflare.com', NONCE],
      // Turnstileウィジェットは検証用のiframeをchallenges.cloudflare.comから読み込む
      frameSrc: ['https://challenges.cloudflare.com'],
      // Turnstileウィジェットの検証時の通信先
      connectSrc: ["'self'", 'https://challenges.cloudflare.com'],
      // フォントは自前配信(同一オリジン)のみ
      fontSrc: ["'self'"],
      // 画像は自ドメインのAPI(QRコード画像等)のみ
      imgSrc: ["'self'"],
      // 404・410・警告インターステシャル(redirect-pages.ts)は<style>タグでインラインCSSを
      // 埋め込むため'unsafe-inline'を許容する。利用者入力(元URL)はescapeHtml()で
      // エスケープしてから本文にのみ埋め込み、<style>には含めない
      styleSrc: ["'self'", "'unsafe-inline'"],
      // <object>・<embed>によるプラグイン埋め込みは使っていないため明示的に禁止する
      objectSrc: ["'none'"],
      // <base>タグによるベースURL差し替え攻撃を防ぐ
      baseUri: ["'self'"],
      // フォーム送信先を自ドメインのみに制限する
      formAction: ["'self'"],
    },
  }),
)

// Better Authのサインアップ・サインイン等のエンドポイントを/api/auth配下にマウントする。
// /api/v1/linksと衝突しないよう、必ず/api/auth/*に限定する('/api/*'にはしない)
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth(c.env).handler(c.req.raw))

// links・qrcodes・posters・reports・account-requestsルートを/api/v1配下にマウントする
// (各ルート側のbasePath('/links')・basePath('/qrcodes')・basePath('/posters')・basePath('/reports')・
// basePath('/account-requests')と合わせて /api/v1/links・/api/v1/qrcodes・/api/v1/posters・
// /api/v1/reports・/api/v1/account-requests になる)
const routes = app
  .basePath('/api/v1')
  .route('/', links)
  .route('/', qrcodes)
  .route('/', posters)
  .route('/', reports)
  .route('/', accountRequests)

// React Router(data mode)のフロントエンドSPAがルート直下の1セグメントパスとして使う
// 予約語(/login・/app等)。shortCode生成(generateShortCode、links.ts)は英数字のみを
// 使うため、これらの単語がshortCodeとして実在のlinkに割り当てられることは無いが、
// URLのパターンとしては下の/:shortCodeと区別できないため、ハンドラ内で明示的に除外する。
// 複数セグメントのパス(/app/links/new・/reset-password/confirm等)は/:shortCodeに
// (1セグメントしかマッチしないため)そもそも一致せず、後述のcatch-allへ流れるので
// ここに列挙する必要は無い
const RESERVED_SINGLE_SEGMENT_PATHS = new Set(['login', 'signup', 'verify-email', 'reset-password', 'terms', 'privacy', 'app'])

// SPAのシェル(index.html)や、favicon等の静的アセットをASSETS bindingへ委譲して返す。
// wrangler.jsoncのassets.not_found_handling: "single-page-application"により、
// 静的ファイルに一致しないパスに対してはindex.html(SPAのシェル)が返る
async function serveSpaShell(c: { env: CloudflareBindings; req: { raw: Request } }) {
  const assetsResponse = await c.env.ASSETS.fetch(c.req.raw)

  // ASSETS bindingが返すResponseはheadersが読み取り専用(immutable)になっており、
  // app.use('*', secureHeaders(...))がヘッダーを後付けしようとすると
  // "Can't modify immutable headers."で例外になる(実際にsrc/index.test.tsxで確認済み)。
  // new Response(body, init)で作り直すと、bodyはそのままにheadersだけ新しい
  // (書き込み可能な)Headersインスタンスとして複製されるため、この問題を回避できる
  return new Response(assetsResponse.body, assetsResponse)
}

// 公開リダイレクト(docs/architecture.mdの「API設計」: 認証不要)。
// '/api/v1'等の既存ルートと衝突しないよう、必ずそれらのマウントより後に登録する。
// Honoのルーティングは登録順が優先されるため(静的パスであっても、動的パラメータより
// 後に登録すると負ける)、この後ろに登録する`*`(catch-all)より必ず先に登録する必要がある
app.get('/:shortCode', async (c) => {
  const db = drizzle(c.env.DB)
  const shortCode = c.req.param('shortCode')

  // 予約語、または「.」を含む(favicon.ico等、ルート直下の静的ファイルへの
  // リクエストと判断できる。shortCodeは英数字のみで生成されるため「.」を含むことは無い)
  // 場合は、短縮コードとしてDB照会せずSPA/静的アセットの配信に委譲する
  if (RESERVED_SINGLE_SEGMENT_PATHS.has(shortCode) || shortCode.includes('.')) {
    return serveSpaShell(c)
  }

  const [record] = await db.select().from(linksTable).where(eq(linksTable.shortCode, shortCode)).limit(1)

  // レコード自体が存在しない場合のみ404。
  // 存在しないリソースなので「見つからない」ことを案内する
  if (!record) {
    return c.html(notFoundPageHtml(), 404)
  }

  // 明示的に停止(所有者による、または運営によるmoderationStatus)されたか、有効期限
  // (expiresAt)を過ぎている場合は410。404と違い「かつて存在したが今は使えない」ことを
  // 案内する。判定はcomputeLinkDisplayStatus(src/lib/link-status.ts)に共通化し、
  // GET /api/v1/links(displayStatus)と基準が食い違わないようにする。
  // アカウント削除申請時のカスケード処理(POST /api/v1/account-requests)は、
  // deletedAtと同時にstatus: 'suspended'もセットする(docs/architecture.mdの「アカウント削除・データ削除の実装フロー」
  // 「リダイレクト機能はこの時点で即座に停止し、410 Goneを返す」)ため、この判定を
  // deletedAtのチェックより先に行う必要がある(先にdeletedAtで404にしてしまうと、
  // カスケード停止によるものか個別削除によるものかを区別できず、常に404になってしまうため)
  const displayStatus = computeLinkDisplayStatus(record)
  if (displayStatus === 'suspended' || displayStatus === 'expired') {
    return c.html(goneePageHtml(), 410)
  }

  // 上記のstatus/expiresAtによる410判定に該当せず、ソフトデリート済み(deletedAtが設定されている)
  // 場合は404。個別削除(DELETE /links/:id)はstatusを変更しないため、このケースに該当する
  if (record.deletedAt !== null) {
    return c.html(notFoundPageHtml(), 404)
  }

  // 悪意あるURL検知(docs/architecture.mdの「悪意あるURLの検知」)でflagged(不審)と判定されている場合、
  // 通常の302リダイレクトの代わりに警告インターステシャルを表示する。
  // ただし警告画面の「このまま進む」リンク(?proceed=1)経由のアクセスでは、この分岐を
  // スキップし通常通りリダイレクトを実行する(利用者自身の意思での続行は妨げない、
  // 利用規約第11条2項「検知に努めるが完全性を保証しない」方針に対応する)
  const hasProceeded = c.req.query('proceed') === '1'
  if (record.securityStatus === 'flagged' && !hasProceeded) {
    // このリクエストのCSP(Content-Security-Policy-Report-Only、上のsecureHeaders設定)が
    // script-srcに設定したNONCEにより、この時点でc.set('secureHeadersNonce', ...)済みのため、
    // 同じ値をページ内のインラインscriptタグのnonce属性にも使う
    const nonce = c.get('secureHeadersNonce')
    return c.html(securityWarningPageHtml(shortCode, c.env.TURNSTILE_SITE_KEY, nonce, record.originalUrl), 200)
  }

  // リダイレクトが成立した場合のみ、クリックをWorkers Analytics Engineに記録する
  // (docs/architecture.mdの「API設計」・「アクセスログの保持・削除の実装方式」)。404・410では記録しない。
  // writeDataPointは同期APIで、戻り値もvoid(Promiseではない)ため、awaitせず
  // fire-and-forgetで呼び出してよい
  c.env.LINK_CLICKS.writeDataPoint({
    // blobs: 検索・表示用の詳細データ。ここではlinkIdをそのまま格納する
    blobs: [record.id],
    // doubles: 集計対象の数値データ。1クリックにつき1を記録し、SUMでクリック数を集計する
    doubles: [1],
    // indexes: 集計・サンプリングの軸となるキー。link単位で問い合わせる(GET /links/:id/clicks)
    // ため、linkIdをindex1に設定する。Analytics Engineは大量データ時にindexes単位で
    // サンプリングするため、link単位で偏りなく集計できるようにする役割も持つ
    indexes: [record.id],
  })

  // 多層防御: originalUrlはPOST /links作成時にhttpUrlSchemaでhttp/https以外のスキームを
  // 拒否しているが、スキーマ変更前に保存された既存データやDB直接操作による混入に備え、
  // リダイレクト実行の直前でもスキームを再検証する。http/https以外の場合はリダイレクトせず、
  // 既存の404ページ(notFoundPageHtml)を返す
  const originalUrlProtocol = URL.parse(record.originalUrl)?.protocol
  if (originalUrlProtocol !== 'http:' && originalUrlProtocol !== 'https:') {
    return c.html(notFoundPageHtml(), 404)
  }

  // 上記以外(有効期限内・active)の場合のみ、元URLへリダイレクトする
  return c.redirect(record.originalUrl, 302)
})

// 上記のどのルートにも一致しなかった残り全パス(トップページ・複数セグメントの
// フロントエンド画面・静的アセット等)をSPAシェル/ASSETS bindingへ委譲する。
// /:shortCodeは1セグメントのパスにしかマッチしないため、これより後ろに登録しても
// 実在しうる短縮コード(英数字1セグメント)を横取りする心配は無い
app.get('*', serveSpaShell)

export default {
  fetch: app.fetch,
  scheduled: async (event, env, ctx) => {
    // 日次cron: アカウント削除バッチ(「アカウント削除・データ削除の実装フロー」)と、悪意あるURL検知の全件スキャン
    // (「悪意あるURLの検知」)を両方実行する。一方が失敗しても他方の処理を止めないよう、
    // それぞれ独立したtry/catchで囲む
    try {
      const processedCount = await runAccountDeletionBatch(env)
      // observability.enabled(Workers Logs)で本番ログを確認できるよう出力する
      console.log(`account-deletion-batch: ${processedCount}件処理しました`)
    } catch (error) {
      console.error('account-deletion-batchに失敗しました', error)
    }

    try {
      const scannedCount = await runLinkSecurityFullScan(env)
      console.log(`link-security-full-scan: ${scannedCount}件処理しました`)
    } catch (error) {
      console.error('link-security-full-scanに失敗しました', error)
    }
  },
} satisfies ExportedHandler<CloudflareBindings>
// Hono RPCクライアントの型推論に使うアプリ全体の型
export type AppType = typeof routes
