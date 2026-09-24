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
      onUnhandledError(error: unknown) {
        // better-auth/better-call内部の多段のPromiseチェーンが、auth.api.verifyPassword()を
        // 誤ったパスワードで呼び出した際のAPIErrorを、未処理のrejectionとして二重に報告して
        // しまう既知の挙動を除外する。アプリ側の挙動(401・共通エラー形式・対象リソースが
        // 削除されないこと)はテストのアサーションで検証済みで実害は無い。
        // 自由記述のmessageではなく、より安定した識別子であるBetter Authのエラーコード
        // (body.code === 'INVALID_PASSWORD' または 'INVALID_EMAIL_OR_PASSWORD')とname('APIError')の
        // 両方が一致する場合のみ除外することで、他の予期しないエラーまで誤って握りつぶさないようにする。
        // (実際に発生するエラーオブジェクトの形は console.log で確認した:
        //  { name: 'APIError', message: 'Invalid password', body: { code: 'INVALID_PASSWORD', ... }, ... })
        // INVALID_EMAIL_OR_PASSWORDは、src/lib/auth-rate-limit.test.ts(レート制限テスト)で
        // 同一の誤ったパスワードによるサインインを連続実行した際に、同じ内部Promiseチェーンの
        // 既知の挙動として確認された(スタックトレースはINVALID_PASSWORDの場合と同一の
        // better-call内部の経路を指す)
        // 将来better-auth/@cloudflare/vitest-pluginのバージョンを上げた際は、この除外が
        // まだ必要か再確認すること
        const err = error as { name?: string; body?: { code?: string } }
        if (err.name === 'APIError' && (err.body?.code === 'INVALID_PASSWORD' || err.body?.code === 'INVALID_EMAIL_OR_PASSWORD')) {
          return false
        }
      },
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
