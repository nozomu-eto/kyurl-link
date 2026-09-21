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
