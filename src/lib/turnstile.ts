// Turnstileのsiteverify APIへ照会するデフォルトタイムアウト(ミリ秒)
const DEFAULT_TIMEOUT_MS = 5000

// Cloudflare TurnstileのsiteverifyエンドポイントでトークンとIPアドレスを検証する。
// docs/architecture.md参照。悪意あるURL検知(urlhaus-client.ts)とは異なりbot対策そのものが
// 目的のため、照会に失敗した場合もfail-open(素通り)にはせず、必ずfalse(拒否)を返す
// (呼び出し元は400を返すこと)
export async function verifyTurnstileToken(token: string, secretKey: string, remoteip: string | undefined, options?: { timeoutMs?: number }): Promise<boolean> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: secretKey, response: token, remoteip }),
      signal: controller.signal,
    })

    if (!response.ok) {
      console.error(`Turnstile siteverifyがHTTPエラーを返しました: status=${response.status}`)
      return false
    }

    const result = await response.json<{ success: boolean; 'error-codes'?: string[] }>()

    if (!result.success) {
      console.error(`Turnstile検証に失敗しました: ${JSON.stringify(result['error-codes'] ?? [])}`)
    }

    return result.success === true
  } catch (error) {
    console.error('Turnstile siteverifyへの照会に失敗しました(タイムアウトまたはネットワークエラー)', error)
    return false
  } finally {
    clearTimeout(timeoutId)
  }
}
