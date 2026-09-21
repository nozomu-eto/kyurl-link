import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

// links: 短縮URLリソース(docs/architecture.md 第7節)のテーブル定義
export const links = sqliteTable('links', {
  // linkリソースの一意なID(主キー)
  id: text('id').primaryKey(),
  // 短縮元の元URL
  originalUrl: text('original_url').notNull(),
  // 短縮URLに使われるコード(例: kyurl.link/{shortCode})。リダイレクト解決に使うため一意制約を付与する
  shortCode: text('short_code').notNull().unique(),
  // linkの状態。zodスキーマ(src/shared/schemas/link.ts)のenumと値を揃える
  status: text('status', { enum: ['active', 'expired', 'suspended'] })
    .notNull()
    .default('active'),
  // 有効期限(ISO8601文字列)。無期限の場合はnull。
  // zodスキーマ(linkSchema.expiresAt: z.string().nullable())と型を一致させるためtextで保持する
  expiresAt: text('expires_at'),
  // レコード作成日時。D1(SQLite)側でunixepoch()により自動設定する
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  // ソフトデリート日時(docs/architecture.md 第7節「削除方針: deletedAtによるソフトデリート」)。
  // 未削除の場合はnull。猶予期間後のバッチ処理で物理削除するまでこの値で判定する
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
})
