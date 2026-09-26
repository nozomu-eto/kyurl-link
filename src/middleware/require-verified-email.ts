import { createMiddleware } from 'hono/factory'
import type { AuthUser } from '@/middleware/auth'

// メール未確認ユーザーによる書き込み系エンドポイントの濫用(捨てアドレスでの
// フィッシング用短縮URL量産等)を防ぐためのミドルウェア。authMiddlewareの後段に置き、
// c.get('user')が使える前提とする。user.emailVerifiedがfalseの場合は403を返す。
// 一覧・詳細の取得、削除、アカウント削除申請には適用しない(未確認でも自分のデータを
// 参照・削除できるようにするため。docs/architecture.md 第7節参照)
export const requireVerifiedEmail = createMiddleware<{
  Bindings: CloudflareBindings
  Variables: { user: AuthUser }
}>(async (c, next) => {
  const user = c.get('user')

  if (!user.emailVerified) {
    return c.json(
      {
        error: {
          code: 'EMAIL_NOT_VERIFIED',
          message: 'この操作にはメールアドレスの確認が必要です',
        },
      },
      403,
    )
  }

  await next()
})
