import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig(async () => {
  // drizzle-kit generateの出力(./drizzle)を読み込み、テスト用Workerへbinding経由で渡す
  const migrations = await readD1Migrations('./drizzle')

  return {
    resolve: {
      tsconfigPaths: true,
    },
    test: {
      // テストごとに使い捨てD1インスタンスへマイグレーションを適用するセットアップファイル
      setupFiles: ['./test/apply-migrations.ts'],
    },
    plugins: [
      cloudflareTest({
        wrangler: {
          configPath: './wrangler.jsonc',
        },
        miniflare: {
          // test/apply-migrations.tsからenv.TEST_MIGRATIONSとして参照する
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
  }
})
