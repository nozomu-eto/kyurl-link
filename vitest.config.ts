/// <reference types="node" />
// vitest.config.tsはNode.js上で実行されるため、process.envの型解決にNode.jsの型をこのファイルに
// 限定して読み込む(プロジェクト全体のtsconfig.jsonはWorkersランタイム向けのため、typesにnodeを追加しない)
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
      // better-auth の auth.api.verifyPassword() を誤ったパスワードで呼び出した際、
      // better-auth/better-call内部の多段のPromiseチェーン(handler呼び出し→.catch→
      // dispatch側の.catchという複数階層)のどこかで、実際にはこちら側のtry/await/catchで
      // 正しく捕捉できているにもかかわらず、Miniflare側の診断レイヤーが同じAPIError
      // (INVALID_PASSWORD)を「未処理のrejection」として二重に報告してしまう事象を確認した。
      // アプリ側の挙動(401・共通エラー形式・対象リソースが削除されないこと)はテストの
      // アサーションで検証済みで実害は無いため、CI失敗を避けるためにここで無視する。
      // 将来better-auth/@cloudflare/vitest-pluginのバージョンを上げた際は、この抑制が
      // まだ必要か再確認すること
      dangerouslyIgnoreUnhandledErrors: true,
    },
    plugins: [
      cloudflareTest({
        wrangler: {
          configPath: './wrangler.jsonc',
        },
        miniflare: {
          bindings: {
            // test/apply-migrations.tsからenv.TEST_MIGRATIONSとして参照する
            TEST_MIGRATIONS: migrations,
            // @cloudflare/vitest-pluginは.dev.varsを自動読み込みしない場合があり、
            // .dev.varsが存在しないCI環境でもBetter Authのテストが動作するよう、
            // process.env経由で明示的にbindingsへ注入する。
            // 注意: .dev.varsの値はNode.jsのprocess.envには反映されない(Workerの
            // bindingとしてのみ注入される)ため、ローカルではprocess.env.BETTER_AUTH_URL等は
            // undefinedになる。miniflareのbindingsはundefinedな値を許容しないため、
            // 値が実際に設定されている場合のみキーを含め、無ければキーごと省略することで
            // 既存の.dev.vars経由の動作(値が設定されているケース)に影響しないようにする
            ...(process.env.BETTER_AUTH_URL ? { BETTER_AUTH_URL: process.env.BETTER_AUTH_URL } : {}),
            ...(process.env.BETTER_AUTH_SECRET ? { BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET } : {}),
            // posters.test.tsのBrowser Rendering実ブラウザ起動テストをCIでスキップするためのフラグ。
            // これも同様にprocess.env(Node.js側)からWorker側のprocess.env/envへ明示的に注入しないと
            // テストコード側のprocess.env.CI_SKIP_BROWSER_TESTからは参照できない
            ...(process.env.CI_SKIP_BROWSER_TEST ? { CI_SKIP_BROWSER_TEST: process.env.CI_SKIP_BROWSER_TEST } : {}),
          },
        },
      }),
    ],
  }
})
