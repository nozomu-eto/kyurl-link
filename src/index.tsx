import { Hono } from 'hono'
import { auth } from '@/lib/auth'
import links from '@/routes/links'
import qrcodes from '@/routes/qrcodes'
import { renderer } from './renderer'

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.use(renderer)

app.get('/', (c) => {
  return c.render(<h1>Hello!</h1>)
})

// Better Authのサインアップ・サインイン等のエンドポイントを/api/auth配下にマウントする。
// /api/v1/linksと衝突しないよう、必ず/api/auth/*に限定する('/api/*'にはしない)
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth(c.env).handler(c.req.raw))

// links・qrcodesルートを/api/v1配下にマウントする
// (各ルート側のbasePath('/links')・basePath('/qrcodes')と合わせて /api/v1/links・/api/v1/qrcodes になる)
const routes = app.basePath('/api/v1').route('/', links).route('/', qrcodes)

export default app
// Hono RPCクライアントの型推論に使うアプリ全体の型
export type AppType = typeof routes
