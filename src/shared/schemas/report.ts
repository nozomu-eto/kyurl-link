import { z } from 'zod'
import { REPORT_REASON_MAX_LENGTH, REPORT_SHORT_CODE_MAX_LENGTH } from '@/shared/constants/input-limits'

// report作成APIの入力用スキーマ。
// 通報者(未ログインの一般利用者もありうる)はlinkの内部ID(linkId)を知り得ず、
// 実際に目にするのは短縮URLのshortCodeのみのため、入力はshortCodeで受け付ける。
// サーバー側(POSTハンドラ)でshortCodeからlinkIdを解決してからreportsテーブルに保存する
export const reportCreateInputSchema = z.object({
  // 通報対象のlinkを特定するための短縮コード。.max()は、未ログインでも送信できる
  // エンドポイントのため、巨大な文字列の送信によるDoS的な濫用を防ぐための上限
  shortCode: z.string().max(REPORT_SHORT_CODE_MAX_LENGTH),
  // 通報理由の自由記述。空文字は不可とする。.max()は同様にDB圧迫・濫用を防ぐための上限
  reason: z.string().min(1).max(REPORT_REASON_MAX_LENGTH),
  // Cloudflare Turnstileのクライアント側ウィジェットが発行するトークン。
  // 未ログインでも利用できるエンドポイントのため、bot対策としてサーバー側(POSTハンドラ)で
  // siteverify APIによる検証を必須にする(docs/architecture.md参照)
  turnstileToken: z.string().min(1),
})

// reportリソース1件分のレスポンス用スキーマ。
// レスポンスでは、DBに保存された内部ID(linkId)をそのまま返す
// (reportCreateInputSchemaのshortCodeとは異なり、こちらは通報を受け付けた後の
// 管理・照合用の表現のため、外部向けの識別子ではなく内部IDで表現する)
export const reportSchema = z.object({
  // reportリソースの一意なID
  id: z.string(),
  // 通報対象のlinkの内部ID(links.id)
  linkId: z.string(),
  // 通報理由の自由記述
  reason: z.string(),
  // 通報の対応状況(未対応・確認済み・却下・対応済み)
  status: z.enum(['pending', 'reviewed', 'dismissed', 'actioned']),
  // レコード作成日時(ISO文字列)
  createdAt: z.string(),
})
