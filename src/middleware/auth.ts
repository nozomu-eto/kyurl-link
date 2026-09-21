import { createMiddleware } from 'hono/factory'
import { auth } from '@/lib/auth'

// auth.api.getSession()の戻り値(セッション無しならnull)からuserの型のみを取り出す
type Session = NonNullable<Awaited<ReturnType<ReturnType<typeof auth>['api']['getSession']>>>
export type AuthUser = Session['user']

// ログイン必須のルートに適用するミドルウェア。
// docs/architecture.md 第7節「リダイレクト・通報・掲示物公開プレビュー以外は全て要ログイン」の方針に従う。
// リクエストヘッダーからBetter Authのセッションを取得し、
// - セッションが無ければ共通エラー形式({ error: { code, message } })で401を返す
// - セッションがあればc.set('user', ...)でコンテキストに詰めて後続のハンドラに渡す
export const authMiddleware = createMiddleware<{
  Bindings: CloudflareBindings
  Variables: { user: AuthUser }
}>(async (c, next) => {
  const session = await auth(c.env).api.getSession({ headers: c.req.raw.headers })

  if (!session) {
    return c.json(
      {
        error: {
          code: 'UNAUTHORIZED',
          message: 'ログインが必要です',
        },
      },
      401,
    )
  }

  c.set('user', session.user)
  await next()
})
