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

// links/posters/qrcodesのPATCHエンドポイントは、zValidatorミドルウェアではなく
// ハンドラ内で手動でzod検証している(既存バックエンド実装・変更不可)。このため、
// Hono RPCの型推論が同じ':id'パスを共有するGET/DELETE(ボディ無し)に引きずられ、
// PATCHのリクエストボディ(json)がクライアント側の型から欠落してしまう。
// hono/clientの実際のリクエスト組み立て(node_modules/hono/dist/client/client.js)は
// 渡された引数オブジェクトにjsonキーが存在するかどうかだけを見て動作するため、
// 実行時の挙動は静的型と無関係に正しく送信される。この関数は、そのPATCH呼び出し箇所に
// 限定して型検査だけをバイパスするためのもの(param・jsonの中身自体の型チェックは
// 呼び出し側でオブジェクトリテラルを書く時点で効いているため、実質的に失われるのは
// 「余剰プロパティチェック」のみ)
export function bypassPatchInputTypeCheck(args: { param: { id: string }; json: Record<string, unknown> }): never {
  return args as never
}
