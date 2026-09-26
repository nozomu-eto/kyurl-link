import { z } from 'zod'
import { httpUrlSchema } from '@/shared/schemas/url'

// QRコードのスタイル設定スキーマ。
// 以前はz.record()で任意のキー・値を受け付けていたが、実際に画面(qrcode-editor-page.tsx)から
// 送信されるのは前景色・背景色の2項目のみであり、任意のデータを保存できる状態は
// 想定外のデータ(悪意のある巨大なペイロード等)の受け入れにつながるため、
// 実際に使われているキーだけを許可するstrictObjectに置き換えた(公開前修正v2 T6)。
// 値は<input type="color">が返すHEXカラー文字列を想定するが、将来の形式変更の余地を
// 残すため厳密なカラー形式チェックまでは行わず、長さの上限(.max(100))のみ設ける
const qrcodeStyleOptionsSchema = z.strictObject({
  // 前景色(HEXカラー文字列、例: '#000000')
  foregroundColor: z.string().max(100).optional(),
  // 背景色(HEXカラー文字列、例: '#ffffff')
  backgroundColor: z.string().max(100).optional(),
})

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
  styleOptions: qrcodeStyleOptionsSchema.nullable(),
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
    // 対象とする直接URL。http/https形式のURLであることを検証する(javascript:等の危険な
    // スキームをQRコードの中身として保存させないため。src/shared/schemas/url.ts参照)
    targetUrl: httpUrlSchema,
  }),
])

// qrcode更新APIの入力用スキーマ。
// 作成後に変更できるのはstyleOptionsのみ(targetType/targetId/targetUrlは作成後不変のため含めない)
export const qrcodeUpdateInputSchema = z.object({
  // QRコードのスタイル設定。省略時は更新しない
  styleOptions: qrcodeStyleOptionsSchema.optional(),
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
