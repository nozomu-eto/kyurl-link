import { hc } from 'hono/client'
// AppTypeはバックエンド(src/index.tsx)がexportするルート全体の型。
// import typeで読み込むことでビルド時に型情報のみが使われ、バックエンドの実装コード
// (drizzle・puppeteer等)がクライアントバンドルに混入することはない
import type { AppType } from '@/index'

// Hono RPCクライアント。AppTypeから型推論することで、エンドポイントのパス・
// リクエストボディ・レスポンス形状をコンパイル時に検証できる(AGENTS.md「Hono RPC」方針)。
// フロントエンドとAPIは同一Worker・同一オリジンで配信されるため、baseURLは
// 実行時のオリジンをそのまま使えばよい
export const apiClient = hc<AppType>(window.location.origin)
