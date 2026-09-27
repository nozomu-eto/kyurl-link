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
  // 未削除の場合はnull。猶予期間後のバッチ処理で物理削除するまでこの値で判定する。
  // アカウント削除申請の取り消し処理(cancelPendingAccountRequestIfAny)がこの値と
  // accountRequests.requestedAtの完全一致で「申請によって削除されたか」を判定するため、
  // 秒精度(mode: 'timestamp')だと同一秒内の個別削除と申請が衝突しうる。ミリ秒精度にする
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  // 悪意あるURL検知の結果(docs/architecture.md 第4節)。既存のstatus(active/expired/suspended、
  // 「意図的な停止」を表す)とは意味が異なる別フィールドとして持つ:
  // - 'unscanned': 未検査、またはURLhaus照会がタイムアウト・失敗しfail-openした(第4節の方針通り、
  //   「不審」とはせず通常のリダイレクトを許可する。次回の定期スキャンで再検査される)
  // - 'clean': ヒューリスティック・URLhaus照合のいずれでも問題が検出されなかった
  // - 'flagged': ヒューリスティックまたはURLhaus照合で不審と判定された(リダイレクト時に
  //   警告インターステシャルを表示する対象)
  // 既存rowは移行(マイグレーション)時点で'unscanned'として扱われ、週次の全件再スキャンで
  // 順次検査される
  securityStatus: text('security_status', { enum: ['unscanned', 'clean', 'flagged'] })
    .notNull()
    .default('unscanned'),
  // 最終検査日時(作成時のヒューリスティック+URLhaus照合、24時間以内の追跡スキャン、週次の
  // 全件再スキャンのいずれかを最後に試みた日時)。24時間スキャン・週次スキャンの対象抽出に使う。
  // 既存rowは移行時点の日時がDBのdefaultで入るが、週次の全件再スキャンはlastScannedAtに関わらず
  // 全active linkを対象にするため、次の週次スキャンで正しく検査される。
  // createdAt(秒精度)と比較するクエリがあるため、比較時の単位ズレに注意(該当箇所にコメントあり)
  lastScannedAt: integer('last_scanned_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  // 運営による強制停止の状態(docs/architecture.md参照)。既存のstatus(所有者が
  // active/expired/suspendedを自由に変更できる)とは別に持つフィールドで、通報を受けて
  // 運営がリンクを停止しても、所有者がstatusをactiveに戻すことで停止を解除できてしまう問題への
  // 対応。'suspended'の場合、PATCH /links/:idでのstatus変更を拒否し、リダイレクトも410にする。
  // 管理画面・管理APIは今回作らず、D1へ直接SQLで更新する運用とする(docs/deployment.md参照)
  moderationStatus: text('moderation_status', { enum: ['none', 'suspended'] })
    .notNull()
    .default('none'),
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
  // 管理用の名前(任意、最大40文字)。QR画像には表示せず、一覧等の管理画面上でのみ使う
  // (docs/architecture.md 第6.7節「管理用の名前:任意、最大40文字。QR画像には表示しない」)
  name: text('name'),
  // QRコードのスタイル設定をJSON文字列として保持する。今回は保存のみで画像生成には未使用、
  // 将来のカスタマイズ機能用の受け皿
  styleOptions: text('style_options'),
  // レコード作成日時。D1(SQLite)側でunixepoch()により自動設定する
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  // ソフトデリート日時。未削除の場合はnull。
  // links.deletedAtと同じ理由でミリ秒精度(mode: 'timestamp_ms')にする
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
})

// accountRequests: アカウント削除申請リソース(docs/architecture.md 第7.1節)のテーブル定義
export const accountRequests = sqliteTable('account_requests', {
  // accountRequestリソースの一意なID(主キー)
  id: text('id').primaryKey(),
  // 削除を申請したuser。ユーザーが物理削除されれば申請記録も意味を持たなくなるためcascade
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  // 申請の対応状況(申請中・取消済み・完了)
  status: text('status', { enum: ['pending', 'cancelled', 'completed'] })
    .notNull()
    .default('pending'),
  // 申請日時。アプリケーション側で常に明示的にnew Date()を渡す(DB側のdefaultは直接SQLで
  // insertした場合のフォールバック)。links/qrcodes/posters.deletedAtとの完全一致判定に
  // 使うため、秒精度ではなくミリ秒精度(mode: 'timestamp_ms')にする
  requestedAt: integer('requested_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  // 物理削除予定日時(申請から7日後)。猶予期間中にログインすれば取消可能
  scheduledDeletionAt: integer('scheduled_deletion_at', { mode: 'timestamp' }).notNull(),
  // 物理削除バッチの完了日時。未完了の場合はnull
  completedAt: integer('completed_at', { mode: 'timestamp' }),
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
  // ソフトデリート日時。未削除の場合はnull。
  // links.deletedAtと同じ理由でミリ秒精度(mode: 'timestamp_ms')にする
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
})
