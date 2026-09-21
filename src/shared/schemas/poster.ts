import { z } from 'zod'

// 掲示物(poster)リソース1件分のレスポンス用スキーマ。
// styleOptionsはqrcodeSchemaと同様、DB上はJSON文字列で保存するが、レスポンスでは
// JSON.parseしたオブジェクトとして返す運用のため、ここではオブジェクト形状(またはnull)で定義する
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
  styleOptions: z.record(z.string(), z.unknown()).nullable(),
  // 掲示物のサイズ(A6縦・A5縦)
  size: z.enum(['A6', 'A5']),
  // 対象のQRコード(qrcodes.id)
  qrCodeId: z.string(),
})

// poster作成APIの入力用スキーマ。
// posterSchemaはレスポンス(DB保存結果)の形を表すのに対し、こちらはリクエストボディの検証に使う。
// id/layoutTemplate/styleOptionsは入力に含めない
// (idはサーバー生成、layoutTemplateは今回'default'固定でサーバー側が設定、
// styleOptionsは作成時null固定で更新はposterUpdateInputSchema経由でのみ可能)
export const posterCreateInputSchema = z.object({
  // 掲示物のタイトル
  title: z.string(),
  // 掲示物のサブタイトル。省略時はnull(無し)として扱う
  subtitle: z.string().nullable().optional(),
  // 掲示物のサイズ(A6縦・A5縦)
  size: z.enum(['A6', 'A5']),
  // 対象とする既存qrcodeのid
  qrCodeId: z.string(),
})

// poster更新APIの入力用スキーマ。
// 作成後に変更できるのはtitle/subtitle/styleOptionsのみ(size/qrCodeIdは作成後不変のため含めない)
export const posterUpdateInputSchema = z.object({
  // 掲示物のタイトル。省略時は更新しない
  title: z.string().optional(),
  // 掲示物のサブタイトル。省略時は更新しない。nullを指定するとサブタイトル無しに変更する
  subtitle: z.string().nullable().optional(),
  // 掲示物のスタイル設定(任意のキー・値を許容する)。省略時は更新しない
  styleOptions: z.record(z.string(), z.unknown()).optional(),
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
