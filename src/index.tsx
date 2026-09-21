import { Hono } from 'hono'
import links from '@/routes/links'
import { renderer } from './renderer'

const app = new Hono()

app.use(renderer)

app.get('/', (c) => {
  return c.render(<h1>Hello!</h1>)
})

// linksルートを/api/v1配下にマウントする(links.ts側のbasePath('/links')と合わせて /api/v1/links になる)
const routes = app.basePath('/api/v1').route('/', links)

export default app
// Hono RPCクライアントの型推論に使うアプリ全体の型
export type AppType = typeof routes
