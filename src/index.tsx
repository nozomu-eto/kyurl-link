import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { links as linksTable } from '@/db/schema'
import { runAccountDeletionBatch } from '@/lib/account-deletion-batch'
import { auth } from '@/lib/auth'
import { runLinkSecurityFullScan, runLinkSecurityTrackingScan } from '@/lib/link-security-scan-batch'
import { goneePageHtml, notFoundPageHtml, securityWarningPageHtml } from '@/lib/redirect-pages'
import accountRequests from '@/routes/account-requests'
import links from '@/routes/links'
import posters from '@/routes/posters'
import qrcodes from '@/routes/qrcodes'
import reports from '@/routes/reports'

const app = new Hono<{ Bindings: CloudflareBindings }>()

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
function serveSpaShell(c: { env: CloudflareBindings; req: { raw: Request } }) {
  return c.env.ASSETS.fetch(c.req.raw)
}

// 公開リダイレクト(docs/architecture.md 第7節: 認証不要)。
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

  // 見つからない、またはソフトデリート済み(deletedAtが設定されている)場合は404。
  // 存在しないリソースなので「見つからない」ことを案内する
  if (!record || record.deletedAt !== null) {
    return c.html(notFoundPageHtml(), 404)
  }

  // 明示的に停止・期限切れとされたか、有効期限(expiresAt)を過ぎている場合は410。
  // 404と違い「かつて存在したが今は使えない」ことを案内する
  const isExpiredByDate = record.expiresAt !== null && new Date(record.expiresAt) < new Date()
  if (record.status === 'suspended' || record.status === 'expired' || isExpiredByDate) {
    return c.html(goneePageHtml(), 410)
  }

  // 悪意あるURL検知(docs/architecture.md 第4節)でflagged(不審)と判定されている場合、
  // 通常の302リダイレクトの代わりに警告インターステシャルを表示する。
  // ただし警告画面の「このまま進む」リンク(?proceed=1)経由のアクセスでは、この分岐を
  // スキップし通常通りリダイレクトを実行する(利用者自身の意思での続行は妨げない、
  // 利用規約第11条2項「検知に努めるが完全性を保証しない」方針に対応する)
  const hasProceeded = c.req.query('proceed') === '1'
  if (record.securityStatus === 'flagged' && !hasProceeded) {
    return c.html(securityWarningPageHtml(shortCode), 200)
  }

  // リダイレクトが成立した場合のみ、クリックをWorkers Analytics Engineに記録する
  // (docs/architecture.md 第7節・第12節)。404・410では記録しない。
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

  // 上記以外(有効期限内・active)の場合のみ、元URLへリダイレクトする
  return c.redirect(record.originalUrl, 302)
})

// 上記のどのルートにも一致しなかった残り全パス(トップページ・複数セグメントの
// フロントエンド画面・静的アセット等)をSPAシェル/ASSETS bindingへ委譲する。
// /:shortCodeは1セグメントのパスにしかマッチしないため、これより後ろに登録しても
// 実在しうる短縮コード(英数字1セグメント)を横取りする心配は無い
app.get('*', serveSpaShell)

// 週次(毎週月曜3時)の悪意あるURL全件再スキャン用cron式。wrangler.jsoncのtriggers.cronsと
// 値を揃える。event.cronでこの値かどうかを見て、日次ジョブと週次ジョブを振り分ける
const WEEKLY_LINK_SECURITY_FULL_SCAN_CRON = '0 3 * * 1'

export default {
  fetch: app.fetch,
  scheduled: async (event, env, ctx) => {
    // 週次cron: 悪意あるURL検知(docs/architecture.md 第4節「第3段階」)の全件再スキャンのみ行う
    if (event.cron === WEEKLY_LINK_SECURITY_FULL_SCAN_CRON) {
      try {
        const scannedCount = await runLinkSecurityFullScan(env)
        console.log(`link-security-full-scan: ${scannedCount}件処理しました`)
      } catch (error) {
        console.error('link-security-full-scanに失敗しました', error)
      }
      return
    }

    // 日次cron: アカウント削除バッチ(第7.1節)と、悪意あるURL検知の24時間以内追跡スキャン
    // (第4節「第2段階」)を両方実行する。一方が失敗しても他方の処理を止めないよう、
    // それぞれ独立したtry/catchで囲む
    try {
      const processedCount = await runAccountDeletionBatch(env)
      // observability.enabled(Workers Logs)で本番ログを確認できるよう出力する
      console.log(`account-deletion-batch: ${processedCount}件処理しました`)
    } catch (error) {
      console.error('account-deletion-batchに失敗しました', error)
    }

    try {
      const trackingScanCount = await runLinkSecurityTrackingScan(env)
      console.log(`link-security-tracking-scan: ${trackingScanCount}件処理しました`)
    } catch (error) {
      console.error('link-security-tracking-scanに失敗しました', error)
    }
  },
} satisfies ExportedHandler<CloudflareBindings>
// Hono RPCクライアントの型推論に使うアプリ全体の型
export type AppType = typeof routes
