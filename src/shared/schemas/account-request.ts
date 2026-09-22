import { z } from 'zod'

// accountRequest(アカウント削除申請)作成APIの入力用スキーマ。
// 誤操作防止のため、パスワード再入力による本人確認を必須とする
// (docs/architecture.md 第7.1節「誤操作防止のためパスワード再入力による確認を必須とする」)
export const accountRequestCreateInputSchema = z.object({
  // 本人確認用のログインパスワード
  password: z.string(),
})

// accountRequestリソース1件分のレスポンス用スキーマ
export const accountRequestSchema = z.object({
  // accountRequestリソースの一意なID
  id: z.string(),
  // 削除を申請したuserのid
  userId: z.string(),
  // 申請の対応状況(申請中・取消済み・完了)
  status: z.enum(['pending', 'cancelled', 'completed']),
  // 申請日時(ISO文字列)
  requestedAt: z.string(),
  // 物理削除予定日時(申請から7日後、ISO文字列)
  scheduledDeletionAt: z.string(),
  // 物理削除バッチの完了日時(ISO文字列)。未完了の場合はnull
  completedAt: z.string().nullable(),
})
