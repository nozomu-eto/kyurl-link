/// <reference types="node" />
// このファイルは `@better-auth/cli generate` 専用の設定であり、Workers本体(src/index.tsx等)からはimportしない。
// D1バインディングはWorkersランタイム上でしか取得できずNode.js(CLI実行環境)には存在しないため、
// dbクライアントにはスキーマ生成にのみ使われるダミー値を渡し、provider('sqlite')の情報だけを伝える。
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'

export const auth = betterAuth({
  // ローカル開発用の.dev.varsから読み込む(process.envはNode.js実行時のみ利用可能)
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter({} as Record<string, never>, {
    provider: 'sqlite',
  }),
})
