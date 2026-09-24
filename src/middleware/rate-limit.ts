import { createMiddleware } from 'hono/factory'
import type { AuthUser } from '@/middleware/auth'

// レート制限超過時の共通エラーレスポンス({ error: { code, message } }形式)
function rateLimitedResponse() {
  return {
    error: {
      code: 'RATE_LIMITED' as const,
      message: 'リクエストが多すぎます。しばらく時間をおいてから再度お試しください',
    },
  }
}

// ログイン必須の書き込み系エンドポイント(POST /links・POST /qrcodes・POST /posters・
// GET /posters/:id/export)向けのレート制限ミドルウェア。authMiddlewareの後段に置くことで
// c.get('user')が使える前提とし、ユーザーID単位でカウントする(IPだと同一ネットワークの
// 複数ユーザーを巻き込んでしまうため、ログイン済みの場合はユーザー単位が適切)。
// bindingNameで用途別(通常の書き込み用・掲示物export用)にバインディングを切り替える
export function userRateLimitMiddleware(bindingName: 'WRITE_RATE_LIMITER' | 'POSTER_EXPORT_RATE_LIMITER') {
  return createMiddleware<{
    Bindings: CloudflareBindings
    Variables: { user: AuthUser }
  }>(async (c, next) => {
    const userId = c.get('user').id
    const { success } = await c.env[bindingName].limit({ key: userId })

    if (!success) {
      return c.json(rateLimitedResponse(), 429)
    }

    await next()
  })
}

// 未ログインでも利用できるPOST /reports向けのレート制限ミドルウェア。
// ログインユーザーが存在しないため、Cloudflareのcf-connecting-ipヘッダー
// (auth.tsのBetter Auth設定と同じ理由でこれを使う。詐称されにくい)のIPアドレス単位でカウントする
export const reportRateLimitMiddleware = createMiddleware<{ Bindings: CloudflareBindings }>(async (c, next) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
  const { success } = await c.env.REPORT_RATE_LIMITER.limit({ key: ip })

  if (!success) {
    return c.json(rateLimitedResponse(), 429)
  }

  await next()
})
