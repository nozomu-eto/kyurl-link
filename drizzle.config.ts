import { defineConfig } from 'drizzle-kit'

// D1(SQLite)向けのdrizzle-kit設定。
// drizzle-kit generateでSQLファイルを生成し、wrangler d1 migrations applyで適用する方式のため、
// D1への直接接続情報(driver/dbCredentials)は不要
export default defineConfig({
  // スキーマ定義ファイルの場所
  schema: './src/db/schema.ts',
  // 生成したマイグレーションSQLの出力先
  out: './drizzle',
  dialect: 'sqlite',
})
