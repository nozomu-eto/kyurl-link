import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { drizzle } from 'drizzle-orm/d1'
import * as linkSchema from '@/db/schema'
import * as authSchema from '@/db/auth-schema'
import { cancelPendingAccountRequestIfAny } from '@/lib/account-request-cancellation'
import { buildEmailVerificationEmail, buildPasswordResetEmail } from '@/lib/auth-emails'

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
    // docs/architecture.md: 認証はBetter Auth・メール+パスワードのみの方針。
    // requireEmailVerificationはあえて設定しない(ソフト確認方式)。trueにすると
    // Better Authの仕様上サインアップ時にセッションCookieが発行されなくなり
    // (token: nullが返る)、既存の全テストファイルのsignUpヘルパーが前提とする
    // 「サインアップ直後にセッションが張られる」挙動が壊れるため。未確認ユーザーでも
    // ログイン・機能利用は継続でき、確認メール送信と「メール確認待ち」画面の表示のみ行う
    emailAndPassword: {
      enabled: true,
      // パスワードリセットメールの送信。既存のEMAIL バインディング(Cloudflare Email
      // Service)を使い、account-deletion-emails.tsと同じ送信元(no-reply@kyurl.link)にする
      sendResetPassword: async ({ user, url }) => {
        await env.EMAIL.send({
          from: 'no-reply@kyurl.link',
          to: user.email,
          ...buildPasswordResetEmail(url),
        })
      },
    },
    emailVerification: {
      // サインアップ時に自動でメール確認メールを送信する
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        await env.EMAIL.send({
          from: 'no-reply@kyurl.link',
          to: user.email,
          ...buildEmailVerificationEmail(url),
        })
      },
    },
    databaseHooks: {
      session: {
        create: {
          // セッション作成 = ログイン成立のタイミングで、猶予期間中(status='pending')の
          // 退会申請があれば自動的に取り消す(docs/architecture.md 第7.1節「③猶予期間:
          // この間にログインすればdeletedAtをクリアして削除を取り消し可能」)。
          // サインイン・サインアップいずれもセッションが新規作成されるため、この1箇所で
          // まとめて扱える
          after: async (session) => {
            await cancelPendingAccountRequestIfAny(db, session.userId)
          },
        },
      },
    },
  })
}
