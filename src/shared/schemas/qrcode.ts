import { z } from 'zod'

// QRコードリソース1件分のレスポンス用スキーマ。
// styleOptionsはDB上はJSON文字列で保存するが、レスポンスではJSON.parseしたオブジェクトとして
// 返す運用のため、ここではオブジェクト形状(またはnull)で定義する
export const qrcodeSchema = z.object({
  // qrcodeリソースの一意なID
  id: z.string(),
  // QRコードの対象種別('link'なら短縮URL、'rawUrl'なら直接指定したURL)
  targetType: z.enum(['link', 'rawUrl']),
  // targetType='link'の場合に参照するlinkのid。それ以外はnull
  targetId: z.string().nullable(),
  // targetType='rawUrl'の場合の対象URL。それ以外はnull
  targetUrl: z.string().nullable(),
  // QRコードのスタイル設定。未設定の場合はnull
  styleOptions: z.record(z.string(), z.unknown()).nullable(),
})

// qrcode作成APIの入力用スキーマ。
// qrcodeSchemaはレスポンス(DB保存結果)の形を表すのに対し、こちらはリクエストボディの検証に使う。
// targetTypeの値によって必須フィールドが変わるため、discriminatedUnionで
// 'link'ならtargetId必須・'rawUrl'ならtargetUrl必須を表現する。
// id/styleOptionsは入力に含めない(idはサーバー生成、styleOptionsは作成時null固定で
// 更新はqrcodeUpdateInputSchema経由でのみ可能)
export const qrcodeCreateInputSchema = z.discriminatedUnion('targetType', [
  z.object({
    targetType: z.literal('link'),
    // 対象とする既存linkのid
    targetId: z.string(),
  }),
  z.object({
    targetType: z.literal('rawUrl'),
    // 対象とする直接URL。URL形式であることを検証する
    targetUrl: z.string().url(),
  }),
])

// qrcode更新APIの入力用スキーマ。
// 作成後に変更できるのはstyleOptionsのみ(targetType/targetId/targetUrlは作成後不変のため含めない)
export const qrcodeUpdateInputSchema = z.object({
  // QRコードのスタイル設定(任意のキー・値を許容する)。省略時は更新しない
  styleOptions: z.record(z.string(), z.unknown()).optional(),
})

// qrcodeの一覧取得APIのレスポンススキーマ({ items, total, limit, offset }形式)。
// linkListResponseSchemaと同じ形
export const qrcodeListResponseSchema = z.object({
  // 取得したqrcodeの配列
  items: z.array(qrcodeSchema),
  // 条件に合致するqrcodeの総件数(ページングに使用)
  total: z.number(),
  // 1回のレスポンスで返す最大件数
  limit: z.number(),
  // 取得開始位置のオフセット
  offset: z.number(),
})
