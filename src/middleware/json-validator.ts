import { zValidator } from '@hono/zod-validator'
import { flattenError, type ZodType } from 'zod'

// リクエストボディ(JSON)をzodスキーマで検証するミドルウェア。各ハンドラーで繰り返していた
// 「c.req.json() → safeParse → 400」の処理を共通化し、Hono RPCにもボディの型を推論させる。
// 検証に失敗した場合は、共通のエラー形式のレスポンス
// (400、{ error: { code: 'VALIDATION_ERROR', message, details } })を返す。
// ハンドラー側では c.req.valid('json') で検証済みの値を受け取る
export function jsonValidator<T extends ZodType>(schema: T) {
  const validate = zValidator('json', schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'リクエストボディが不正です',
            details: flattenError(result.error),
          },
        },
        400,
      )
    }
  })

  // zValidator(hono標準のvalidator)は、JSONとして読み取れないボディに対して
  // 独自の400(HTTPException)を投げ、フックを経由しない。ボディ不正も他の検証失敗と同じ
  // VALIDATION_ERRORで返したいため、読み取りに失敗した場合はnullを検証した結果で応答し、
  // レスポンスの形を揃える。
  // c.req.json()の結果はHono側でキャッシュされるため、後段のvalidateで二重に読み込まれない
  const middleware: typeof validate = async (c, next) => {
    try {
      await c.req.json()
    } catch {
      const nullResult = schema.safeParse(null)
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'リクエストボディが不正です',
            details: nullResult.success ? undefined : flattenError(nullResult.error),
          },
        },
        400,
      ) as never
    }

    return validate(c, next)
  }

  return middleware
}
