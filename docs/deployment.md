# デプロイ方法

2026-09-22 制定 · @Someone

kyurl.linkのデプロイ方式と、各判断の理由をまとめる。

## 1. デプロイ方式: Cloudflare Workers Builds(GitHub連携)

CLIでの`wrangler deploy`手動実行や、GitHub Actionsによる独自CI構築は行わず、**Cloudflareダッシュボードからリポジトリを直接連携するWorkers Builds**を採用する。

### 選定理由

- 個人開発規模では「シンプルさ」が最優先される。Cloudflare公式・複数の実務記事でも「ソロプロジェクトではCloudflareのダッシュボード連携で十分」とされている
- GitHub Actionsは、PR単位での検証(型チェック・lint・テスト)とデプロイを分離したいチーム開発で真価を発揮する構成。個人開発で「pushしたらすぐ確認する」という今の運用にはオーバーヘッドが大きい
- 将来チーム開発になった場合は、「GitHub ActionsをPR検証専用に追加し、mainへのマージ後の実デプロイはWorkers Buildsに任せる」というハイブリッド構成への移行パスがある

### 動作

- `main`ブランチへのpushをトリガーに、Cloudflareが自動的に`ビルドコマンド → デプロイコマンド(デフォルト`npx wrangler deploy`)`を実行する
- `package.json`に`deploy`スクリプトがあれば、Cloudflareはそれを検出しデプロイコマンドとして使用できる

## 1.5 ビルドコマンドの設定(テストゲート)

ダッシュボードの「ビルド コマンド」を`pnpm test && pnpm run build`に設定する。これにより、テストが1件でも失敗すればビルドが失敗し、その後のデプロイ(マイグレーション適用含む)が実行されない。

以下を「ビルド変数」として設定する(ランタイム用のVariables and Secretsとは別):

- `CI_SKIP_BROWSER_TEST=true`(理由: Workers Buildsのビルドコンテナにはヘッドレスブラウザ実行に必要な共有ライブラリが無く、apt-get等でのインストールも許可されていないため。`posters.test.ts`のexportテストをこの変数でスキップする)
- `BETTER_AUTH_URL=https://example.com`(テスト実行時のBetter Authオリジン検証を通すためのダミー値。ランタイム用の値とは別で構わない)
- `BETTER_AUTH_SECRET=test-secret-for-ci-do-not-use-in-prod`

## 2. compatibility_date は現状維持(変更しない)

`wrangler.jsonc`の`compatibility_date`は`2025-08-03`のまま変更しない。

### 理由

- Cloudflare Browser Rendering(掲示物PDF/PNG生成)に使う`@cloudflare/puppeteer`は、内部でCDP通信にWebSocketを使用する
- Cloudflare公式changelogにより、`compatibility_date`が**2026-03-17以降**になると、WebSocketのバイナリメッセージが`ArrayBuffer`ではなく`Blob`として届くようになる仕様変更があることを確認済み。この変更はCloudflare公式の`@cloudflare/puppeteer`リポジトリ自身が「日付をまたぐ場合は注意」と明記している変更であり、無検証で日付を上げるとBrowser Renderingが正しく動かなくなるリスクがある
- 新しい「Quick Actions」API(`env.BROWSER.quickAction()`)を使うには`compatibility_date`を2026-03-24以降にする必要があるが、上記のリスクを避けるため、今回は従来の`@cloudflare/puppeteer`(binding + `puppeteer.launch()`)方式を採用し、日付変更を回避した
- 将来的に日付を上げる必要が生じた場合は、`compatibility_flags`に`no_websocket_standard_binary_type`を追加するか、Browser Rendering周りの動作を一通り再テストすること

## 3. シークレットの管理

`BETTER_AUTH_SECRET`・`BETTER_AUTH_URL`は、Gitにコミットせず、以下いずれかの方法で個別に設定する。

- CLIから: `wrangler secret put BETTER_AUTH_SECRET` / `wrangler secret put BETTER_AUTH_URL`
- ダッシュボードから: 対象Worker → Settings → Variables and Secrets

### 理由

- Workers Builds(GitHub連携)は、ビルド・デプロイの自動化は行うが、**ランタイムで使うシークレットの設定automationはしない**。Cloudflare公式ドキュメントに「Build variables and secretsはビルド時のみ有効で、ランタイムで使う変数はSettings > Variables & Secretsで別途設定する」と明記されている
- `BETTER_AUTH_URL`は、初回デプロイでWorkerのURLが確定した後でなければ値を決められないため、「初回デプロイ → URL確認 → シークレット設定」という順序になる

## 4. D1マイグレーションの適用

`package.json`の`deploy`スクリプトに、本番D1(`kyurl-link-prod`)へのマイグレーション適用を組み込む。

```json
"scripts": {
  "deploy": "wrangler d1 migrations apply DB --remote && vite build && wrangler deploy"
}
```

### 理由

- Cloudflareプラットフォームは、D1マイグレーションを「デプロイに含まれる自動処理」としては扱わない。マイグレーションは明示的に実行するステップという位置づけであり、自動ロールバックの仕組みも無い
- Workers Buildsは「ビルドコマンド1つ + デプロイコマンド1つ」という制約しか持たないため、この制約の中でマイグレーションを自動化するには、Cloudflare公式が「Deploy to Cloudflareボタン」機能のドキュメントで案内している通り、`deploy`スクリプト自体にマイグレーション適用コマンドをチェーンする方式を取る
- マイグレーションコマンドは、DB名(`kyurl-link-prod`)ではなくbinding名(`DB`)を指定する。binding名を指定しておけば、将来DB名が変わってもコマンドを直す必要がない
- 個人開発の今の規模では、マイグレーション失敗時のリスクは許容範囲と判断し、この自動化を採用する。将来「危険なマイグレーションを自動実行したくない」場面が出てきたら、この行を外して手動適用に戻す判断もありえる

## 5. 初回セットアップ手順

0. `wrangler d1 create kyurl-link-prod`を実行し、出力されたbinding設定を`wrangler.jsonc`に追加する
0.5. `wrangler r2 bucket create kyurl-link-posters`を実行し、`wrangler.jsonc`に`r2_buckets`と`browser`のbinding設定を追加する
1. `package.json`の`deploy`スクリプトを上記(第4節)の内容に更新してpush
2. Cloudflareダッシュボード → Workers & Pages → 対象Worker → Settings → Builds → Connect でリポジトリを接続する
3. 接続後の初回自動デプロイでWorkerのURL(`https://kyurl-link.<サブドメイン>.workers.dev`)が確定する
4. ダッシュボードの Settings > Variables and Secrets で `BETTER_AUTH_SECRET`(ランダムな値)・`BETTER_AUTH_URL`(手順3で確認したURL)を設定する
5. 以降は`main`ブランチへのpushのみで、マイグレーション適用を含むデプロイが自動的に行われる

## 6. ロールバック

Cloudflareダッシュボードの Deployments タブから、過去のバージョンにロールバックできることを確認済み(2026-09-22)。ロールバックは新しいデプロイメントを作成する形で行われるため、何度でもやり直せる。DBスキーマを変更したデプロイをロールバックする場合、コードは古くなってもD1のスキーマは新しいままになる点に注意する(今回検証した2つのデプロイ間にはスキーマ変更が無かったため、この問題は発生しなかった)。

## 7. 今後の発展候補(未着手)

- チーム開発になった場合、GitHub ActionsをPR検証(型チェック・lint・テスト)専用に追加し、実デプロイはWorkers Buildsに任せるハイブリッド構成への移行
- リスクの高いマイグレーションが発生した場合、「マイグレーション適用」と「デプロイ」を分離する構成への変更(その際はWorkers BuildsからGitHub Actionsへの乗り換えも検討)
- 独自ドメイン(kyurl.link)への切り替え(現時点では`*.workers.dev`のURLを使用)

## 8. 運用手順: D1への直接SQL操作

管理画面・管理APIが無い項目について、D1へ直接SQLを実行して確認・対応する手順をまとめる。
実行は`wrangler d1 execute kyurl-link-prod --remote --command "<SQL>"`の形で行う。
**本番DB(`--remote`)への実行は、内容を十分確認したうえで慎重に行うこと。**

### 8.1 http/https以外のスキームのURLが保存されていないかの確認

`linkCreateInputSchema.originalUrl`・`qrcodeCreateInputSchema.targetUrl`は、スキーマ変更(http/https限定化)より前に作成されたデータの中に、`javascript:`・`data:`・`mailto:`等の危険なスキームのURLが混入している可能性がある。以下のSQLで抽出できる(D1はSQLite方言のため正規表現は使えず、`LIKE`による前方一致で代用する)。

```sql
-- linksテーブル: original_urlがhttp://・https://で始まらないレコードを抽出
SELECT id, user_id, original_url, created_at
FROM links
WHERE original_url NOT LIKE 'http://%' AND original_url NOT LIKE 'https://%';

-- qrcodesテーブル: target_url(target_type='rawUrl'の場合のみ値が入る)が
-- http://・https://で始まらないレコードを抽出
SELECT id, user_id, target_url, created_at
FROM qrcodes
WHERE target_type = 'rawUrl'
  AND target_url NOT LIKE 'http://%' AND target_url NOT LIKE 'https://%';
```

該当レコードが見つかった場合は、内容を確認のうえ`status = 'suspended'`(links)への更新や、対象qrcodeの削除(`deletedAt`設定)を個別に検討する。なお`src/index.tsx`のリダイレクト処理では、このようなレコードに対しても多層防御としてリダイレクト実行直前にスキームを再検証しており、実際にリダイレクトされることは無い。

### 8.2 運営によるlinkの強制停止(moderationStatus)

通報等を受けて運営がlinkを強制停止する手段は、今回は管理画面・管理APIを作らず、D1への直接SQL実行で行う(`links.moderationStatus`列、docs/architecture.md参照)。

```sql
-- 指定したlinkを運営停止状態にする(<link_id>を対象linkのidに置き換える)
UPDATE links SET moderation_status = 'suspended' WHERE id = '<link_id>';

-- 停止を解除する場合
UPDATE links SET moderation_status = 'none' WHERE id = '<link_id>';

-- 現在運営停止中のlink一覧を確認する
SELECT id, user_id, short_code, original_url FROM links WHERE moderation_status = 'suspended';
```

停止すると、リダイレクトは410(`src/index.tsx`)になり、所有者はPATCH /links/:idでstatusをactiveに戻すことができなくなる(403 `MODERATION_LOCKED`、`src/routes/links.ts`)。
