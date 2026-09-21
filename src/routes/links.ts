import { Hono } from 'hono'
import { linkListResponseSchema } from '@/shared/schemas/link'

// link(短縮URL)リソースのルート。型推論を保つためメソッドチェーンで定義する
const app = new Hono().basePath('/links').get('/', (c) => {
  // D1未接続のため、固定のダミーデータを一覧として返す
  const dummyResponse = linkListResponseSchema.parse({
    items: [
      {
        id: 'dummy-id-1',
        originalUrl: 'https://example.com',
        shortCode: 'abc123',
        status: 'active',
        expiresAt: null,
      },
    ],
    total: 1,
    limit: 20,
    offset: 0,
  })

  // レスポンス形状をスキーマで検証してから返す
  return c.json(dummyResponse)
})

export default app
// Hono RPCクライアントから型推論できるようルートの型をexportする
export type LinksAppType = typeof app
