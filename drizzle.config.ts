/// <reference types="node" />
// drizzle-kit CLIはNode.js上で実行されるため、process.envの型解決にNode.jsの型をこのファイルに限定して読み込む
// (プロジェクト全体のtsconfig.jsonはWorkersランタイム向けのため、typesにnodeを追加しない)
import { defineConfig } from 'drizzle-kit'

// D1(SQLite)向けのdrizzle-kit設定。マイグレーション生成・適用時に参照する
export default defineConfig({
  // スキーマ定義ファイルの場所
  schema: './src/db/schema.ts',
  // 生成したマイグレーションSQLの出力先
  out: './drizzle',
  dialect: 'sqlite',
  // D1のHTTP API経由でマイグレーションを適用するドライバ
  driver: 'd1-http',
  dbCredentials: {
    // Cloudflareのアカウントを特定するID。値は.envに置き、ここには書かない
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    // 対象D1データベースのID。値は.envに置き、ここには書かない
    databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
    // D1 HTTP APIを呼び出すためのAPIトークン。値は.envに置き、ここには書かない
    token: process.env.CLOUDFLARE_D1_TOKEN!,
  },
})
