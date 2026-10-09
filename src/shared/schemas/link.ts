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
  // linkの状態(DB保存値)。'expired'はPATCHでは指定できなくなった(linkUpdateInputSchema参照)ため、
  // 有効期限切れによる無効化はこの列を書き換えず、displayStatusで都度計算する
  // (docs/architecture.md・src/lib/link-status.ts参照)
  status: z.enum(['active', 'expired', 'suspended']),
  // 有効期限(ISO文字列)。無期限の場合はnull
  expiresAt: z.string().nullable(),
  // 表示用の実効ステータス。statusとは別に、moderationStatus・status・expiresAtから
  // その場で計算した「今どう扱うべきか」を表す(src/lib/link-status.ts参照)。
  // 画面の状態バッジ等、表示にはこちらを使う
  displayStatus: z.enum(['active', 'expired', 'suspended']),
  // 悪意あるURL検知の結果(docs/architecture.mdの「悪意あるURLの検知」)。statusとは意味が異なる別フィールド。
  // unscanned: 未検査またはURLhaus照会がfail-openした / clean: 問題なし / flagged: 不審と判定された
  securityStatus: z.enum(['unscanned', 'clean', 'flagged']),
  // 最終検査日時(ISO文字列)
  lastScannedAt: z.string(),
  // 運営による強制停止の状態。'suspended'の場合、所有者はstatusを変更できず(PATCHが
  // 403 MODERATION_LOCKEDになる)、リダイレクトも410になる。linkUpdateInputSchemaには
  // 含めない(利用者からは変更できない項目のため)
  moderationStatus: z.enum(['none', 'suspended']),
})

// link作成APIの入力用スキーマ。
// linkSchemaはレスポンス(DBに保存された結果)の形を表すのに対し、こちらはリクエストボディの検証に使う。
// id/shortCode/status/createdAtはクライアントからの入力を受け付けず、サーバー側(POSTハンドラ)で
// 生成・固定するため、ここには含めない
export const linkCreateInputSchema = z.object({
  // 短縮したい元URL。http/https形式のURLであることを検証する(javascript:等の危険な
  // スキームをリダイレクト先として保存させないため。src/shared/schemas/url.ts参照)
  originalUrl: httpUrlSchema,
  // 有効期限。ISO 8601形式かつタイムゾーン情報(offset、'Z'または'+09:00'等)を必須とする
  // (offsetを必須にしないと、DB上でUTC/ローカルどちらとして解釈すべきかが曖昧になり、
  // 過去日時判定(src/routes/links.ts)がずれる可能性があるため)。
  // 省略時はnull(無期限)として扱う
  expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
})

// link更新APIの入力用スキーマ。
// 作成用のlinkCreateInputSchemaとは異なり、更新可能なのはstatusとexpiresAtのみ
// (originalUrl/shortCodeは作成後不変、id/createdAtはそもそもクライアントが変更できない)。
// どちらのフィールドも省略可能とし、指定されたものだけを更新するPATCHの入力として扱う
export const linkUpdateInputSchema = z.object({
  // linkの状態。'expired'は指定できない(有効期限切れは自動的に決まるため、手動では選べない。
  // docs/architecture.mdの「画面ごとの確定仕様」「詳細:...「期限切れ」は有効期限で自動的に決まり、手動では
  // 選べない」)。指定すると400 VALIDATION_ERRORになる
  status: z.enum(['active', 'suspended']).optional(),
  // 有効期限。作成時と同様、ISO 8601形式かつoffset必須で検証する。nullを指定すると無期限に変更する
  expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
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
