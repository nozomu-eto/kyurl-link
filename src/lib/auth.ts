import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { drizzle } from 'drizzle-orm/d1'
import * as linkSchema from '@/db/schema'
import * as authSchema from '@/db/auth-schema'

// linksテーブルとBetter Authのテーブル(user/session/account/verification)をまとめたスキーマ。
// drizzle()とdrizzleAdapter()の両方に同じものを明示的に渡す
// (drizzleAdapterはschemaを省略すると"model not found"になる既知の問題があるため)
const schema = { ...linkSchema, ...authSchema }

// リクエストごとにHonoのc.env(D1バインディング等)を受け取り、Better Authインスタンスを生成する
export function auth(env: CloudflareBindings) {
  const db = drizzle(env.DB, { schema })

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema,
    }),
    // ローカルは.dev.vars、本番はwrangler secretで設定する値を使う
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    // docs/architecture.md: 認証はBetter Auth・メール+パスワードのみの方針
    emailAndPassword: {
      enabled: true,
    },
  })
}
