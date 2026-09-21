import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { links } from '@/db/schema'
import { authMiddleware, type AuthUser } from '@/middleware/auth'
import { linkListResponseSchema } from '@/shared/schemas/link'

// link(短縮URL)リソースのルート。型推論を保つためメソッドチェーンで定義する。
// c.env.DBを使うため、HonoのBindingsにCloudflareBindings(wrangler typesが生成する型)を指定する。
// authMiddlewareがc.set('user', ...)するため、Variablesにもuserの型を指定する
const app = new Hono<{ Bindings: CloudflareBindings; Variables: { user: AuthUser } }>()
  .basePath('/links')
  // 一覧取得は認証必須(docs/architecture.md 第7節)のため、authMiddlewareを経由させる
  .get('/', authMiddleware, async (c) => {
    // リクエストごとのD1バインディングからDrizzleインスタンスを生成する
    const db = drizzle(c.env.DB)

    // linksテーブルの全件を取得する(ページングは未実装のため暫定的に固定値を返す)
    const items = await db.select().from(links)

    // レスポンス形状をスキーマで検証してから返す。レコードが0件でもitems: []としてそのまま返す(エラーにしない)
    const response = linkListResponseSchema.parse({
      items,
      total: items.length,
      limit: 20,
      offset: 0,
    })

    return c.json(response)
  })

export default app
// Hono RPCクライアントから型推論できるようルートの型をexportする
export type LinksAppType = typeof app
