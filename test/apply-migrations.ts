import type { D1Migration } from '@cloudflare/vitest-plugin'
import { applyD1Migrations, env } from 'cloudflare:test'

// vitestが起動するテスト用D1は`wrangler d1 migrations apply --local`で適用した
// ローカルD1(.wrangler/state)とは別の使い捨てインスタンスのため、テストごとに
// drizzleで生成したマイグレーション(vitest.config.tsでTEST_MIGRATIONSとして注入)を適用する
const migrations = (env as unknown as { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS

await applyD1Migrations(env.DB, migrations)
