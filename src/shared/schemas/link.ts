import { z } from 'zod'

// 短縮URL(link)リソース1件分のスキーマ
export const linkSchema = z.object({
  // linkリソースの一意なID
  id: z.string(),
  // 短縮元の元URL
  originalUrl: z.string(),
  // 短縮URLに使われるコード(例: kyurl.link/{shortCode})
  shortCode: z.string(),
  // linkの状態(有効/期限切れ/停止)
  status: z.enum(['active', 'expired', 'suspended']),
  // 有効期限(ISO文字列)。無期限の場合はnull
  expiresAt: z.string().nullable(),
})

// link作成APIの入力用スキーマ。
// linkSchemaはレスポンス(DBに保存された結果)の形を表すのに対し、こちらはリクエストボディの検証に使う。
// id/shortCode/status/createdAtはクライアントからの入力を受け付けず、サーバー側(POSTハンドラ)で
// 生成・固定するため、ここには含めない
export const linkCreateInputSchema = z.object({
  // 短縮したい元URL。URL形式であることを検証する
  originalUrl: z.string().url(),
  // 有効期限(ISO文字列)。省略時はnull(無期限)として扱う
  expiresAt: z.string().nullable().optional(),
})

// link更新APIの入力用スキーマ。
// 作成用のlinkCreateInputSchemaとは異なり、更新可能なのはstatusとexpiresAtのみ
// (originalUrl/shortCodeは作成後不変、id/createdAtはそもそもクライアントが変更できない)。
// どちらのフィールドも省略可能とし、指定されたものだけを更新するPATCHの入力として扱う
export const linkUpdateInputSchema = z.object({
  // linkの状態(有効/期限切れ/停止)
  status: z.enum(['active', 'expired', 'suspended']).optional(),
  // 有効期限(ISO文字列)。nullを指定すると無期限に変更する
  expiresAt: z.string().nullable().optional(),
})

// linkの一覧取得APIのレスポンススキーマ({ items, total, limit, offset }形式)
export const linkListResponseSchema = z.object({
  // 取得したlinkの配列
  items: z.array(linkSchema),
  // 条件に合致するlinkの総件数(ページングに使用)
  total: z.number(),
  // 1回のレスポンスで返す最大件数
  limit: z.number(),
  // 取得開始位置のオフセット
  offset: z.number(),
})
