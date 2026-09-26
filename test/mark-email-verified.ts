import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { env } from 'cloudflare:test'
import { user } from '@/db/auth-schema'

// テスト用ヘルパー: 指定したuserIdのemailVerifiedをtrueに更新する。
// requireVerifiedEmailミドルウェア(未確認ユーザーによる書き込み系エンドポイントの利用を
// 制限する)の対象となるAPIをテストする際、サインアップ直後の未確認ユーザーのままだと
// 403(EMAIL_NOT_VERIFIED)になってしまうため、各テストファイルのsignUpヘルパー内で
// これを呼び出し、確認済みユーザーとして扱う
export async function markEmailVerified(userId: string) {
  const db = drizzle(env.DB)
  await db.update(user).set({ emailVerified: true }).where(eq(user.id, userId))
}
