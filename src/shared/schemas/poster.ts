import { z } from 'zod'
import { POSTER_SUBTITLE_MAX_LENGTH, POSTER_TITLE_MAX_LENGTH } from '@/shared/constants/input-limits'

// 掲示物(poster)のスタイル設定スキーマ。
// QRコードが白黒固定になった(docs/architecture.md 第6.7節)ことに伴い、掲示物に埋め込まれる
// QRコード画像(poster-template.ts)にも色の項目は不要になったため、入力側は実質空オブジェクトの
// みを許可する(以前のforegroundColor/backgroundColorを含むキーを送ると400にする)。
// 将来的なカスタマイズ再導入の余地を残すため、キー自体はz.strictObject({})のまま(空オブジェクト)にしておく
const posterStyleOptionsInputSchema = z.strictObject({})

// レスポンス用のstyleOptions。posterStyleOptionsInputSchema導入前に保存された既存レコードには
// foregroundColor/backgroundColor等のキーが残っている可能性があり、それらをGETで取得した際に
// パースエラーにしないため、入力用より緩いスキーマ(任意のキーを許容)を使う。
// DB上のデータそのものは書き換えない(このスキーマは表示のためだけに使う)
const posterStyleOptionsResponseSchema = z.looseObject({})

// 掲示物のタイトル。必須項目のため、前後の空白を除去したうえで空になっていないか(min(1))・
// 上限文字数以内か(max)を検証する。トリム後の値を検証・保存する
// (docs/architecture.md 第6.7節「タイトル(必須、最大20文字)」)
const posterTitleSchema = z
  .string()
  .trim()
  .min(1, '掲示物のタイトルを入力してください')
  .max(POSTER_TITLE_MAX_LENGTH, `タイトルは${POSTER_TITLE_MAX_LENGTH}文字以内で入力してください`)

// 掲示物のサブタイトル(ひとことメッセージ)。任意、最大40文字、前後の空白を除去し、
// 空文字(トリム後に空になった場合を含む)はnullとして扱う。
// フィールド自体を省略した場合はundefinedのまま返す(qrcodeNameSchema・src/shared/schemas/
// qrcode.tsと同じ方法。zodのtransformはundefined入力でも呼ばれるため明示的に分岐することで、
// posterUpdateInputSchemaで「省略時は更新しない」と「nullを指定して消す」を区別できるようにする)
const posterSubtitleSchema = z
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
  .refine((value) => value === undefined || value === null || value.length <= POSTER_SUBTITLE_MAX_LENGTH, {
    message: `ひとことメッセージは${POSTER_SUBTITLE_MAX_LENGTH}文字以内で入力してください`,
  })

// 掲示物に紐づく短縮URLの表示用ステータス(src/lib/poster-link-status.ts参照)。
// - active/expired/suspended: linkSchema.displayStatus(src/lib/link-status.ts)と同じ基準
// - none: QRコードが元URLを直接読み取る(targetType: 'rawUrl')場合
// - deleted: 紐づく短縮URLまたはQRコードがソフトデリート済みの場合
//   (リダイレクトは404になるため、activeとは表示させない)
export const posterLinkStatusSchema = z.enum(['active', 'expired', 'suspended', 'none', 'deleted'])

// 掲示物(poster)リソース1件分のレスポンス用スキーマ。
// styleOptionsはqrcodeSchemaと同様、DB上はJSON文字列で保存するが、レスポンスでは
// JSON.parseしたオブジェクトとして返す運用のため、ここではオブジェクト形状(またはnull)で定義する。
// title/subtitleには上限を付けない(上限変更前に保存された長いデータもエラー無く読み出せるようにする。
// DB上のデータそのものは書き換えない)
export const posterSchema = z.object({
  // posterリソースの一意なID
  id: z.string(),
  // 掲示物のタイトル
  title: z.string(),
  // 掲示物のサブタイトル。無い場合はnull
  subtitle: z.string().nullable(),
  // レイアウトテンプレートの識別子(今回は'default'のみ)
  layoutTemplate: z.string(),
  // 掲示物のスタイル設定。未設定の場合はnull
  styleOptions: posterStyleOptionsResponseSchema.nullable(),
  // 掲示物のサイズ(A6縦・A5縦)
  size: z.enum(['A6', 'A5']),
  // 対象のQRコード(qrcodes.id)
  qrCodeId: z.string(),
  // 紐づく短縮URLの表示用ステータス(その場計算。DBには保存しない)
  linkStatus: posterLinkStatusSchema,
})

// poster作成APIの入力用スキーマ。
// posterSchemaはレスポンス(DB保存結果)の形を表すのに対し、こちらはリクエストボディの検証に使う。
// id/layoutTemplate/styleOptions/linkStatusは入力に含めない
// (idはサーバー生成、layoutTemplateは今回'default'固定でサーバー側が設定、
// styleOptionsは作成時null固定で更新はposterUpdateInputSchema経由でのみ可能、
// linkStatusはその場計算の表示専用フィールドで保存も入力も不可)
export const posterCreateInputSchema = z.object({
  // 掲示物のタイトル(必須)
  title: posterTitleSchema,
  // 掲示物のサブタイトル(ひとことメッセージ、任意)。省略時はnull(無し)として扱う
  subtitle: posterSubtitleSchema,
  // 掲示物のサイズ(A6縦・A5縦)
  size: z.enum(['A6', 'A5']),
  // 対象とする既存qrcodeのid
  qrCodeId: z.string(),
})

// poster更新APIの入力用スキーマ。
// 作成後に変更できるのはtitle/subtitle/styleOptionsのみ(size/qrCodeIdは作成後不変のため含めない)
export const posterUpdateInputSchema = z.object({
  // 掲示物のタイトル。省略時は更新しない
  title: posterTitleSchema.optional(),
  // 掲示物のサブタイトル(ひとことメッセージ)。省略時は更新しない。nullを指定すると消える
  subtitle: posterSubtitleSchema,
  // 掲示物のスタイル設定。省略時は更新しない
  styleOptions: posterStyleOptionsInputSchema.optional(),
})

// posterの一覧取得APIのレスポンススキーマ({ items, total, limit, offset }形式)。
// 他リソース(link/qrcode)のListResponseSchemaと同じ形
export const posterListResponseSchema = z.object({
  // 取得したposterの配列
  items: z.array(posterSchema),
  // 条件に合致するposterの総件数(ページングに使用)
  total: z.number(),
  // 1回のレスポンスで返す最大件数
  limit: z.number(),
  // 取得開始位置のオフセット
  offset: z.number(),
})
