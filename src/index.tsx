import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { links as linksTable } from '@/db/schema'
import { auth } from '@/lib/auth'
import { goneePageHtml, notFoundPageHtml } from '@/lib/redirect-pages'
import accountRequests from '@/routes/account-requests'
import links from '@/routes/links'
import posters from '@/routes/posters'
import qrcodes from '@/routes/qrcodes'
import reports from '@/routes/reports'
import { renderer } from './renderer'

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.use(renderer)

app.get('/', (c) => {
  return c.render(<h1>Hello!</h1>)
})

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

// 公開リダイレクト(docs/architecture.md 第7節: 認証不要)。
// '/api/v1'等の既存ルートと衝突しないよう、必ずそれらのマウントより後に登録する
app.get('/:shortCode', async (c) => {
  const db = drizzle(c.env.DB)
  const shortCode = c.req.param('shortCode')

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

  // 上記以外(有効期限内・active)の場合のみ、元URLへリダイレクトする
  return c.redirect(record.originalUrl, 302)
})

export default {
  fetch: app.fetch,
  scheduled: async (event, env, ctx) => {
    // 実装は次のタスクで追加
  },
} satisfies ExportedHandler<CloudflareBindings>
// Hono RPCクライアントの型推論に使うアプリ全体の型
export type AppType = typeof routes
