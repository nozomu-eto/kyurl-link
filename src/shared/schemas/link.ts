import { z } from 'zod'
import { httpUrlSchema } from '@/shared/schemas/url'

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
  // 悪意あるURL検知の結果(docs/architecture.md 第4節)。statusとは意味が異なる別フィールド。
  // unscanned: 未検査またはURLhaus照会がfail-openした / clean: 問題なし / flagged: 不審と判定された
  securityStatus: z.enum(['unscanned', 'clean', 'flagged']),
  // 最終検査日時(ISO文字列)
  lastScannedAt: z.string(),
})

// link作成APIの入力用スキーマ。
// linkSchemaはレスポンス(DBに保存された結果)の形を表すのに対し、こちらはリクエストボディの検証に使う。
// id/shortCode/status/createdAtはクライアントからの入力を受け付けず、サーバー側(POSTハンドラ)で
// 生成・固定するため、ここには含めない
export const linkCreateInputSchema = z.object({
  // 短縮したい元URL。http/https形式のURLであることを検証する(javascript:等の危険な
  // スキームをリダイレクト先として保存させないため。src/shared/schemas/url.ts参照)
  originalUrl: httpUrlSchema,
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
