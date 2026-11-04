# kyurl.link

[https://kyurl.link](https://kyurl.link) は、短縮URLとQRコードの作成に加えて、店舗などで使う掲示物を編集し、印刷・配布用に出力できるWebサービスです。

小規模店舗のURL・QRコード・掲示物の準備負担を減らすことを企画時の仮説としています。実店舗での導入効果、利用者満足度、作業時間の短縮は検証済みの成果ではありません。

## 主な機能

- **短縮URL**: URLを短縮し、所有者が有効・停止状態や有効期限を管理できます。短縮URL経由のアクセス数を集計します。
- **QRコード**: 短縮URLを経由するQRコードと、入力したURLを直接含めるQRコードを作成できます。PNG・SVGで取得できます。
- **掲示物**: QRコード付き掲示物を編集し、PDF・PNGで出力できます。複数の掲示物をまとめ、A4印刷用PDFにする機能もあります。
- **アカウント**: メールアドレスとパスワードによる認証、確認メール、パスワード再設定に対応しています。メール未確認でもログインできますが、一部の書き込み操作には確認が必要です。
- **URLの安全性確認**: 短縮URL作成時と日次スキャンでヒューリスティック検査とURLhaus照合を行い、不審と判定した短縮URLには警告画面を表示します。

QRコードに元URLを直接埋め込む方式では、アクセスはkyurl.linkを経由しません。そのため、kyurl.link上のクリック集計・短縮URLの停止や期限管理・短縮URL向け安全性検査は適用されません。

## 技術構成

| 領域 | 技術 | 役割 |
| --- | --- | --- |
| フロントエンド | TypeScript、React、React Router Data Mode、Vite | SPAの画面と画面遷移。React RouterのFramework Modeは使用していません。 |
| API・実行環境 | Hono、Hono RPC、Cloudflare Workers | HonoでAPI・短縮URLリダイレクトを処理し、Hono RPCでフロントエンドとAPIの型を共有します。WorkerはSPAの静的アセットも配信します。 |
| 入力・データ | Zod、Drizzle ORM、Cloudflare D1 | Zodでリクエストを検証し、Drizzle経由でD1（SQLite）を読み書きします。 |
| 認証 | Better Auth | メール・パスワード認証、メール確認、パスワード再設定を担当します。メール送信はCloudflare Email bindingを使います。 |
| QRコード画像 | `qrcode-svg`、Web Streams API | SVGとPNGを生成します。PNGはQRのモジュール配列から直接組み立てます。 |
| 掲示物出力 | Cloudflare Browser Rendering、`@cloudflare/puppeteer`、Cloudflare R2 | Browser RenderingでPDF・PNGを作成し、R2に内容ハッシュを使ってキャッシュします。 |
| アクセス集計 | Workers Analytics Engine | 短縮URLを通ったリダイレクトのクリック数を記録・集計します。 |
| テスト | Vitest、`@cloudflare/vitest-plugin`、Testing Library | Workerに近い環境でAPI・ライブラリを、jsdomで画面を検証します。 |

## アーキテクチャ

ブラウザにはReact Router Data ModeのSPAを配信し、同じCloudflare Worker上でHonoがAPIと短縮URLへのアクセスを処理します。APIルートは機能ごとに分割し、Zodスキーマをフロントエンドと共有しています。データはD1に保存し、認証はBetter Auth、掲示物ファイルのキャッシュはR2、クリック集計はAnalytics Engineに分担しています。

```text
Browser
  ├─ React + React Router SPA ── Hono RPC ──┐
  └─ 短縮URLへのアクセス ──────────────────┤
                                            ▼
                                   Cloudflare Worker / Hono
                                    ├─ D1 + Drizzle
                                    ├─ Better Auth + Email
                                    ├─ Analytics Engine
                                    └─ Browser Rendering ── R2 cache
```

## 技術選定と設計判断

### SPAとAPIの役割を分ける

- **課題**: アプリ画面、API、短縮URLリダイレクトを一つのWorkerで提供しつつ、フロントエンドとAPIの型を保つ。
- **選択肢**: サーバー側レンダリング中心の構成、SPAとAPIを別サービスで運用する構成など。
- **採用**: React Router Data Modeを画面遷移に、HonoをAPI・リダイレクトに使い、ViteとCloudflareプラグインでWorkerとSPAをビルドします。Hono RPCでAPI型を共有します。
- **理由**: 画面とAPIの責務を分けながら、同一Workerと共有TypeScript型で運用できるためです。
- **制約**: SPA配信と短縮コードのルーティング順序をWorkerで扱う必要があります。React Router Framework ModeのSSR機能は使っていません。
- **関連資料**: [アーキテクチャ](docs/architecture.md)、[`src/index.tsx`](src/index.tsx)、[`src/frontend/router.tsx`](src/frontend/router.tsx)

### QRコードPNGを直接組み立てる

- **課題**: 白黒のQRコードをPNGとして提供する。
- **選択肢**: SVGをWASM等でラスタライズする、Browser Renderingで描画する、別のQR画像ライブラリを追加する。
- **採用**: 既存の`qrcode-svg`が公開するモジュール配列を使い、グレースケールPNGを生成します。
- **理由**: 新しい依存やBrowser Renderingの利用を増やさず、既存のQRデータを再利用できます。
- **制約**: 実装は白黒のQRコード向けです。QR画像生成コードは[`src/lib/qrcode-image.ts`](src/lib/qrcode-image.ts)にあります。
- **関連資料**: [PR #18](https://github.com/nozomu-eto/kyurl-link/pull/18)、[アーキテクチャのAPI・QRコード設計](docs/architecture.md#7-api設計)

### 掲示物出力をサーバーで生成し、R2にキャッシュする

- **課題**: 編集画面のプレビューに近い掲示物を、PDF・PNGとして出力し、同じ内容の再生成を避ける。
- **選択肢**: 利用者のブラウザ印刷機能に任せる、Worker内でBrowser Renderingを使う。
- **採用**: Browser RenderingでHTMLテンプレートを描画し、PDFまたはPNGを生成します。内容ハッシュを含むキーでR2に保存し、次回以降に再利用します。
- **理由**: 用紙サイズやA4面付けをサーバー側で制御でき、同じ内容の出力をキャッシュできます。R2を参照する前に所有者を確認します。
- **トレードオフ**: Browser Renderingには利用制限・従量費用があり、未キャッシュの出力にはブラウザ生成処理が必要です。出力APIにはレート制限があります。
- **関連資料**: [アーキテクチャの掲示物出力設計](docs/architecture.md#13-掲示物pdfpng生成キャッシュ設計)、[PR #26](https://github.com/nozomu-eto/kyurl-link/pull/26)、[`src/lib/poster-export-cache.ts`](src/lib/poster-export-cache.ts)

PR #26では、出力処理とテスト側でR2キャッシュキーの組み立てが食い違う問題を避けるため、キー素材の生成を共通化しています。これはキャッシュキー計算の整合性を保つための対応で、性能改善の実測値を示すものではありません。

## ローカル開発

### 必要な環境

- Node.js 22.12以降（現在のロックファイルに含まれるVite 8がNode.js 20.19以降または22.12以降、Wrangler 4がNode.js 22以降を要求しています）
- pnpm（リポジトリはpnpm-lock.yamlを使用します。`package.json`にpnpmの固定バージョン指定はありません）
- ローカル開発はCloudflareのViteプラグインとWorkersエミュレーションを使用します。掲示物出力などCloudflare bindingに依存する機能は、ローカル環境やアカウント設定によって動作確認できない場合があります。

### セットアップ

```sh
pnpm install
cp .dev.vars.example .dev.vars
cp .env.example .env
```

`.dev.vars`はWorker側のローカル変数、`.env`はViteが読むフロントエンド変数です。`.dev.vars.example`にある`BETTER_AUTH_SECRET`はローカル専用のランダム値に置き換えてください。Turnstileはサンプル記載の公式テスト用キーでローカル開発できます。`.env`の`VITE_TURNSTILE_SITE_KEY`にもTurnstileのサイトキーを設定します。キーの取得や本番設定は[Cloudflare Turnstileの設定](docs/architecture.md)を参照してください。

`URLHAUS_API_KEY`は任意です。未設定またはURLhaus照会のタイムアウト・障害時は照会結果を`unscanned`として扱うfail-open設計です。キーを設定しなくてもアプリは起動できますが、URLhausによる照会は行われません。

クリック集計の表示ではWorkers Analytics Engine SQL APIを呼び出すため、利用する場合は適切な権限を持つ`ANALYTICS_API_TOKEN`が必要です。この値は`.dev.vars`などローカルの秘密情報として扱い、リポジトリへコミットしないでください。メール送信やBrowser RenderingもCloudflareのbinding・アカウント設定に依存します。

ローカルD1のスキーマを用意して開発サーバーを起動します。

```sh
pnpm db:migrate
pnpm dev
```

`pnpm db:migrate`はWranglerのローカルD1にマイグレーションを適用します。Vitestは別の使い捨てD1を用意し、テスト開始時にマイグレーションを適用するため、通常はテスト用にこの操作は不要です。

Cloudflare Browser Rendering、メール送信、Analytics Engineなどの外部サービスを使う処理は、ローカルエミュレーションだけでは本番と同じ挙動を再現できない場合があります。特に掲示物出力の実ブラウザ生成テストは環境変数`CI_SKIP_BROWSER_TEST`でスキップ可能です。外部bindingを含む再現条件はCloudflareアカウントと設定に依存するため、未構成の環境で全機能をローカル実行できるとは限りません。

### 品質確認

```sh
pnpm test
pnpm typecheck
pnpm build
```

`pnpm test`はVitestを一度実行して終了します。テスト件数やカバレッジ率はここでは固定値として掲載していません。

## デプロイとデータの注意

本番デプロイはCloudflare Workers BuildsがGitHubリポジトリと連携して行います。ローカルのQuick Startからデプロイは行いません。

`package.json`の`deploy`スクリプトは、本番D1にマイグレーションを適用してからビルド・デプロイします。手動で実行する場合は影響を確認し、コマンドを`pnpm run deploy`としてください。`pnpm deploy`はpnpm自身のコマンドとして解釈される場合があり、同じ動作を保証しません。詳細は[デプロイ手順](docs/deployment.md)を確認してください。

Workers Buildsのプレビュー環境も本番と同じD1を使う設定です。プレビュー上でのデータ変更やアカウント操作が本番データに影響する可能性があります。プレビューでの動作確認も本番データを扱う前提で慎重に行ってください。デプロイはD1のロールバックを伴わず、マイグレーションは自動で元に戻りません。

## URL検査の限界

短縮URLの検査は、IPアドレス・紛らわしいURL形式・Punycode・既知の短縮URLサービス・極端に長いURLや深いサブドメインなどのヒューリスティックと、URLhausの登録情報照合で構成されています。URLhausのキー未設定、タイムアウト、障害時はfail-openとなり、通常のリダイレクトを許可します。判定はすべての悪意あるURLを検出・防止する保証ではありません。不審と判定した場合も警告画面で利用者が続行できます。

元URLを直接埋め込むQRコードは短縮URLを通らないため、この検査の対象外です。検知条件や運用上の注意は[アーキテクチャのURL検知設計](docs/architecture.md#4-悪意あるurlの検知)を参照してください。

## 関連資料

- [アーキテクチャ・設計判断](docs/architecture.md)
- [デプロイと運用](docs/deployment.md)
- [本番公開前の確認手順](docs/production-verification.md)
- [利用規約](docs/terms-of-service.md)・[プライバシーポリシー](docs/privacy-policy.md)
- [画面モック一覧](docs/mocks/README.md)
- [QRコードPNG生成のPR #18](https://github.com/nozomu-eto/kyurl-link/pull/18)
- [掲示物キャッシュキーのPR #26](https://github.com/nozomu-eto/kyurl-link/pull/26)
