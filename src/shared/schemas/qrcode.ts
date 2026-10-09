import { z } from 'zod'
import { QRCODE_NAME_MAX_LENGTH } from '@/shared/constants/input-limits'
import { httpUrlSchema } from '@/shared/schemas/url'

// QRコードの管理用の名前。任意、最大40文字、前後の空白を除去し、空文字(トリム後に
// 空になった場合を含む)はnullとして扱う(docs/architecture.md 第6.7節「管理用の名前:任意、
// 最大40文字。QR画像には表示しない」)。
// フィールド自体を省略した場合はundefinedのまま返す(qrcodeUpdateInputSchemaで
// 「省略時は更新しない」と「nullを指定して名前を消す」を区別できるようにするため。
// zodのtransformは値がundefinedの場合でも呼ばれるため、ここで明示的に分岐する)
const qrcodeNameSchema = z
  .string()
  .nullable()
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return undefined
    }
    if (value === null) {
      return null
    }
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  })
  .refine((value) => value === undefined || value === null || value.length <= QRCODE_NAME_MAX_LENGTH, {
    message: `名前は${QRCODE_NAME_MAX_LENGTH}文字以内で入力してください`,
  })

// QRコードリソース1件分のレスポンス用スキーマ。
export const qrcodeSchema = z.object({
  // qrcodeリソースの一意なID
  id: z.string(),
  // QRコードの対象種別('link'なら短縮URL、'rawUrl'なら直接指定したURL)
  targetType: z.enum(['link', 'rawUrl']),
  // targetType='link'の場合に参照するlinkのid。それ以外はnull
  targetId: z.string().nullable(),
  // targetType='rawUrl'の場合の対象URL。それ以外はnull
  targetUrl: z.string().nullable(),
  // 管理用の名前。未設定の場合はnull
  name: z.string().nullable(),
  // 作成日時(ISO文字列)。一覧・詳細の「作成日」と、名前なしの場合の「名前なし(M/D作成)」表示に使う
  createdAt: z.string(),
  // 読み取り先の表示用。targetType='link'の場合は、紐づく短縮URLのshortCode(例: kyurl.link/{shortCode})。
  // rawUrlの場合、または紐づくlinkが見つからない場合はnull(rawUrlの読み取り先はtargetUrlを使う)
  targetShortCode: z.string().nullable(),
  // このQRコードを使っている掲示物(poster)の件数。ソフトデリート済みの掲示物は数えない
  posterCount: z.number(),
})

// qrcode作成APIの入力用スキーマ。
// qrcodeSchemaはレスポンス(DB保存結果)の形を表すのに対し、こちらはリクエストボディの検証に使う。
// targetTypeの値によって必須フィールドが変わるため、discriminatedUnionで
// 'link'ならtargetId必須・'rawUrl'ならtargetUrl必須を表現する。
// idは入力に含めない(サーバー生成)。nameは任意で両方の分岐に共通して指定できる
export const qrcodeCreateInputSchema = z.discriminatedUnion('targetType', [
  z.object({
    targetType: z.literal('link'),
    // 対象とする既存linkのid
    targetId: z.string(),
    name: qrcodeNameSchema,
  }),
  z.object({
    targetType: z.literal('rawUrl'),
    // 対象とする直接URL。http/https形式のURLであることを検証する(javascript:等の危険な
    // スキームをQRコードの中身として保存させないため。src/shared/schemas/url.ts参照)
    targetUrl: httpUrlSchema,
    name: qrcodeNameSchema,
  }),
])

// qrcode更新APIの入力用スキーマ。
// 作成後に変更できるのはnameのみ(targetType/targetId/targetUrlは作成後不変のため含めない)。
// 古いクライアントがstyleOptions等の未知のキーを送ってきても、zObjectの既定動作で
// 取り除かれて無視される(400にしない)
export const qrcodeUpdateInputSchema = z.object({
  // 管理用の名前。省略時は更新しない
  name: qrcodeNameSchema,
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
