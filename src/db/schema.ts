import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { user } from './auth-schema'

// links: 短縮URLリソース(docs/architecture.md 第7節)のテーブル定義
export const links = sqliteTable('links', {
  // linkリソースの一意なID(主キー)
  id: text('id').primaryKey(),
  // このリソースの所有者。一覧・詳細・更新・削除の全操作で、ログインユーザー自身の
  // リソースのみに絞り込むために使う。ユーザーが物理削除されれば、そのユーザーが
  // 作成したリソースも意味を持たなくなるためonDelete: 'cascade'とする
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
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

// qrcodes: QRコードリソース(docs/architecture.md 第7節)のテーブル定義
export const qrcodes = sqliteTable('qrcodes', {
  // qrcodeリソースの一意なID(主キー)
  id: text('id').primaryKey(),
  // このリソースの所有者。一覧・詳細・更新・削除の全操作で、ログインユーザー自身の
  // リソースのみに絞り込むために使う。ユーザーが物理削除されれば、そのユーザーが
  // 作成したリソースも意味を持たなくなるためonDelete: 'cascade'とする
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  // QRコードの対象種別。'link'なら短縮URL(links)を、'rawUrl'ならtargetUrlに保持した直接URLを対象にする
  targetType: text('target_type', { enum: ['link', 'rawUrl'] }).notNull(),
  // targetType='link'の場合に参照するlinks.id。対象のlinkが削除されたらカスケードで削除する
  targetId: text('target_id').references(() => links.id, { onDelete: 'cascade' }),
  // targetType='rawUrl'の場合に直接保持する対象URL
  targetUrl: text('target_url'),
  // QRコードのスタイル設定をJSON文字列として保持する。今回は保存のみで画像生成には未使用、
  // 将来のカスタマイズ機能用の受け皿
  styleOptions: text('style_options'),
  // レコード作成日時。D1(SQLite)側でunixepoch()により自動設定する
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  // ソフトデリート日時。未削除の場合はnull
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
})

// reports: 通報リソース(docs/architecture.md 第7節・利用規約第9条)のテーブル定義
export const reports = sqliteTable('reports', {
  // reportリソースの一意なID(主キー)
  id: text('id').primaryKey(),
  // 通報対象のlink(links.id)。対象linkが削除されれば通報記録も一緒に削除して構わないためcascade
  linkId: text('link_id')
    .notNull()
    .references(() => links.id, { onDelete: 'cascade' }),
  // 通報理由の自由記述
  reason: text('reason').notNull(),
  // 通報の対応状況(未対応・確認済み・却下・対応済み)
  status: text('status', { enum: ['pending', 'reviewed', 'dismissed', 'actioned'] })
    .notNull()
    .default('pending'),
  // レコード作成日時。D1(SQLite)側でunixepoch()により自動設定する
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

// posters: 掲示物リソース(docs/architecture.md 第7節)のテーブル定義
export const posters = sqliteTable('posters', {
  // posterリソースの一意なID(主キー)
  id: text('id').primaryKey(),
  // このリソースの所有者。一覧・詳細・更新・削除の全操作で、ログインユーザー自身の
  // リソースのみに絞り込むために使う。ユーザーが物理削除されれば、そのユーザーが
  // 作成したリソースも意味を持たなくなるためonDelete: 'cascade'とする
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  // 掲示物のタイトル
  title: text('title').notNull(),
  // 掲示物のサブタイトル。無い場合はnull
  subtitle: text('subtitle'),
  // レイアウトテンプレートの識別子。今回は固定値'default'のみ扱う
  layoutTemplate: text('layout_template').notNull(),
  // 掲示物のスタイル設定をJSON文字列として保持する(qrcodes.styleOptionsと同じ扱い)
  styleOptions: text('style_options'),
  // 掲示物のサイズ(A6縦・A5縦)
  size: text('size', { enum: ['A6', 'A5'] }).notNull(),
  // 対象のQRコード(qrcodes.id)。QRコードが先に削除されると掲示物が壊れるため、
  // cascadeではなくrestrict(参照されている間は削除を禁止する)にする
  qrCodeId: text('qr_code_id')
    .notNull()
    .references(() => qrcodes.id, { onDelete: 'restrict' }),
  // レコード作成日時。D1(SQLite)側でunixepoch()により自動設定する
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  // ソフトデリート日時。未削除の場合はnull
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
})
