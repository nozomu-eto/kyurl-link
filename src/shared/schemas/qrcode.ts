import { z } from 'zod'
import { QRCODE_NAME_MAX_LENGTH } from '@/shared/constants/input-limits'
import { httpUrlSchema } from '@/shared/schemas/url'

// QRコードは白黒固定(読み取りやすさを優先)にする方針(docs/architecture.md 第6.7節
// 「QRコード:白黒(黒の模様・白の背景)のみ。色の変更機能は提供しない」)に伴い、
// 入力側のstyleOptionsは実質空オブジェクトのみを許可する(以前のforegroundColor/backgroundColorを
// 含むキーを送ると400にする)。将来的なカスタマイズ再導入の余地を残すため、キー自体は
// z.strictObject({})のまま(空オブジェクト)にしておく
const qrcodeStyleOptionsInputSchema = z.strictObject({})

// レスポンス用のstyleOptions。styleOptionsInputSchema導入前に保存された既存レコードには
// foregroundColor/backgroundColor等のキーが残っている可能性があり、それらをGETで取得した際に
// パースエラーにしないため、入力用より緩いスキーマ(任意のキーを許容)を使う。
// DB上のデータそのものは書き換えない(このスキーマは表示のためだけに使う)
const qrcodeStyleOptionsResponseSchema = z.looseObject({})

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
  // 管理用の名前。未設定の場合はnull
  name: z.string().nullable(),
  // QRコードのスタイル設定。未設定の場合はnull
  styleOptions: qrcodeStyleOptionsResponseSchema.nullable(),
})

// qrcode作成APIの入力用スキーマ。
// qrcodeSchemaはレスポンス(DB保存結果)の形を表すのに対し、こちらはリクエストボディの検証に使う。
// targetTypeの値によって必須フィールドが変わるため、discriminatedUnionで
// 'link'ならtargetId必須・'rawUrl'ならtargetUrl必須を表現する。
// id/styleOptionsは入力に含めない(idはサーバー生成、styleOptionsは作成時null固定で
// 更新はqrcodeUpdateInputSchema経由でのみ可能)。nameは任意で両方の分岐に共通して指定できる
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
// 作成後に変更できるのはname・styleOptionsのみ(targetType/targetId/targetUrlは作成後不変のため含めない)
export const qrcodeUpdateInputSchema = z.object({
  // 管理用の名前。省略時は更新しない
  name: qrcodeNameSchema,
  // QRコードのスタイル設定。省略時は更新しない
  styleOptions: qrcodeStyleOptionsInputSchema.optional(),
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
