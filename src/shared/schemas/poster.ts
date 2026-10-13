import { z } from 'zod'
import { POSTER_SUBTITLE_MAX_LENGTH, POSTER_TITLE_MAX_LENGTH } from '@/shared/constants/input-limits'

// 掲示物(poster)のスタイル設定スキーマ。
// QRコードが白黒固定になった(docs/architecture.mdの「画面ごとの確定仕様」)ことに伴い、掲示物に埋め込まれる
// QRコード画像(shared/poster-template.ts)にも色の項目は不要になったため、入力側は実質空オブジェクトの
// みを許可する(foregroundColor/backgroundColorなどのキーを送ると400にする)。
// 将来的なカスタマイズ再導入の余地を残すため、キー自体はz.strictObject({})のまま(空オブジェクト)にしておく
const posterStyleOptionsInputSchema = z.strictObject({})

// レスポンス用のstyleOptions。保存済みの既存レコードにはforegroundColor/backgroundColor等の
// キーが残っている可能性があり、それらをGETで取得した際に
// パースエラーにしないため、入力用より緩いスキーマ(任意のキーを許容)を使う。
// DB上のデータそのものは書き換えない(このスキーマは表示のためだけに使う)
const posterStyleOptionsResponseSchema = z.looseObject({})

// 掲示物のタイトル。必須項目のため、前後の空白を除去したうえで空になっていないか(min(1))・
// 上限文字数以内か(max)を検証する。トリム後の値を検証・保存する
// (docs/architecture.mdの「画面ごとの確定仕様」「タイトル(必須、最大20文字)」)
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
  // レイアウトテンプレートの識別子(現在は'default'のみ)
  layoutTemplate: z.string(),
  // 掲示物のスタイル設定。未設定の場合はnull
  styleOptions: posterStyleOptionsResponseSchema.nullable(),
  // 掲示物のサイズ(A6縦・A5縦)
  size: z.enum(['A6', 'A5']),
  // 対象のQRコード(qrcodes.id)
  qrCodeId: z.string(),
  // 作成日時(ISO文字列)。一覧の「作成」の日付と並び順に使う
  createdAt: z.string(),
  // 使っているQRコードの名前。未設定の場合はnull(表示は「名前なし(M/D作成)」にするため、作成日時も返す)
  qrCodeName: z.string().nullable(),
  // 使っているQRコードの作成日時(ISO文字列)。名前が未設定のQRコードを見分ける表示に使う
  qrCodeCreatedAt: z.string(),
  // QRコードが短縮URL経由(targetType: 'link')のときの、短縮URLのshortCode。直接指定(rawUrl)のときはnull。
  // 一覧のサムネイルが、書き出しと同じ短縮URLの表示(shared/poster-template.tsのgetPosterShortUrlText)を出すために使う
  targetShortCode: z.string().nullable(),
  // 同じく短縮URL経由のときの、短縮URLのidと有効期限(ISO文字列。期限なしはnull)。書き出し前の確認ダイアログで、
  // 短縮URLの詳細画面への導線と「期限切れになりました」の表示に使う。直接指定のときは両方null
  targetLinkId: z.string().nullable(),
  linkExpiresAt: z.string().nullable(),
  // 紐づく短縮URLの表示用ステータス(その場計算。DBには保存しない)
  linkStatus: posterLinkStatusSchema,
})

// poster作成APIの入力用スキーマ。
// posterSchemaはレスポンス(DB保存結果)の形を表すのに対し、こちらはリクエストボディの検証に使う。
// id/layoutTemplate/styleOptions/linkStatus/qrCodeName/qrCodeCreatedAt/createdAt/targetShortCode/targetLinkId/linkExpiresAtは入力に含めない
// (idはサーバー生成、layoutTemplateは現在'default'固定でサーバー側が設定、
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
// 変更できるのはtitle/subtitle/styleOptions/size/qrCodeId(掲示物の編集画面で、内容・用紙サイズ・使うQRコードを
// あとから変えられるようにするため)
export const posterUpdateInputSchema = z.object({
  // 掲示物のタイトル。省略時は更新しない
  title: posterTitleSchema.optional(),
  // 掲示物のサブタイトル(ひとことメッセージ)。省略時は更新しない。nullを指定すると消える
  subtitle: posterSubtitleSchema,
  // 掲示物のスタイル設定。省略時は更新しない
  styleOptions: posterStyleOptionsInputSchema.optional(),
  // 掲示物のサイズ(A6縦・A5縦)。省略時は更新しない
  size: z.enum(['A6', 'A5']).optional(),
  // 使うQRコード(qrcodes.id)。省略時は更新しない。自分の、削除されていないQRコードに限る
  qrCodeId: z.string().optional(),
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

// まとめて印刷(POST /posters/batch-export)の入力用スキーマ。
// - size: A5とA6は混在できないため、1回の指定は1サイズだけ
// - items: 1件以上。countは1以上の整数(0枚の掲示物は含めない)
// - 同じposterIdを複数回指定することは認めない(400になる)。画面は1つの掲示物を1行で扱い、枚数はcountで
//   指定するため、重複は呼び出し側の誤りとして扱う(合算して受け入れると、並び順・キャッシュキーの意味があいまいになる)
// 上限(A4用紙10枚)はサイズごとに面数が違うため、スキーマではなくハンドラーで400 LIMIT_EXCEEDEDにする
export const posterBatchExportInputSchema = z.object({
  size: z.enum(['A6', 'A5']),
  items: z
    .array(
      z.object({
        posterId: z.string().min(1),
        count: z.int().min(1),
      }),
    )
    .min(1)
    .refine((items) => new Set(items.map((item) => item.posterId)).size === items.length, {
      message: '同じ掲示物を複数回指定することはできません。枚数(count)で指定してください',
    }),
})
