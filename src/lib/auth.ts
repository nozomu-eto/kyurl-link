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

// テスト専用の環境変数。Better Authは既定で「開発モード」ではレート制限を無効化するため、
// レート制限の挙動を検証するテスト(src/lib/auth-rate-limit.test.ts)でのみ、
// cloudflare:testのenvオブジェクトを直接書き換えてこの値を'true'にし、強制的に有効化する。
// 本番のwrangler.jsoncには定義せず、通常のテスト・ローカル開発では未設定(無効のまま)にする
type AuthEnv = CloudflareBindings & { RATE_LIMIT_FORCE_ENABLED?: string }

// リクエストごとにHonoのc.env(D1バインディング等)を受け取り、Better Authインスタンスを生成する
export function auth(env: AuthEnv) {
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
    // レート制限(docs/architecture.md 参照)。既定のmemory保存はWorkersのisolateごとに
    // カウンタが分かれてしまい実質的に効かないため、D1(rateLimitテーブル、
    // src/db/auth-schema.ts)に保存する方式に変更する
    rateLimit: {
      // 本番ビルドではBetter Auth自身が「本番モード」と判定し既定で有効になる
      // (公式ドキュメント: 本番モードでは既定でwindow 60秒・max 100)。
      // RATE_LIMIT_FORCE_ENABLEDが'true'の場合のみ明示的に有効化する(上記AuthEnv参照)。
      // それ以外はキー自体を指定せず、Better Auth自身の既定判定(開発モードでは無効)に委ねる
      ...(env.RATE_LIMIT_FORCE_ENABLED === 'true' ? { enabled: true } : {}),
      storage: 'database',
      modelName: 'rateLimit',
      // 一般のBetter Authエンドポイント(get-session等)向けの既定値
      window: 60,
      max: 100,
      customRules: {
        // ログイン試行。総当たり攻撃対策として一般エンドポイントより厳しくする。
        // 1分あたり5回まで(入力ミスを数回許容しつつ、総当たりは実質不可能にする回数)
        '/sign-in/email': { window: 60, max: 5 },
        // 新規登録。捨てアドレスでの大量アカウント作成を抑止する目的のため、
        // 1分あたり3回までと厳しめにする
        '/sign-up/email': { window: 60, max: 3 },
        // パスワードリセット要求。メール送信を伴いコストが高く、他人への迷惑メール送りつけ
        // (メールアドレス総当たり)にも使われ得るため、5分あたり3回までとする
        '/request-password-reset': { window: 60 * 5, max: 3 },
        // 確認メール再送。上記と同じ理由で5分あたり3回までとする
        '/send-verification-email': { window: 60 * 5, max: 3 },
      },
    },
    // クライアントIPの取得元をCloudflareのcf-connecting-ipヘッダーに固定する。
    // 既定のx-forwarded-forはクライアントが自由に詐称できるカンマ区切りのチェーンで、
    // 信頼できるプロキシ(Cloudflare)を経由しないヘッダーを混同する危険があるため使わない
    advanced: {
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip'],
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
