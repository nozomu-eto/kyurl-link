# kyurl.link

URL短縮・QRコード生成・店頭掲示物(ポスター)作成を一つにしたWebサービスです。
飲食店・カフェ・美容室・整体院など、小規模な街の事業者が、QRコード付きの掲示物を自分で作って印刷できることを目指しています。
公開URL: https://kyurl.link

<!-- 要記入: スクリーンショット -->

## 作った理由

就活の面接トレーニング用にスーツを買いに行った店で、アンケート用のQRコードを読み込んで回答しました。そのとき、個人や小規模店がQRコードと「アンケートお願いします」の紙を用意するのは手間かもしれないと思いました。

## 主な機能

- **短縮URL**: 1つの元URLから複数の短縮URLを作れます
- **QRコード**: 短縮後のURLにも、短縮前の元URLにも紐づけられます(白黒のみ、PNG/SVGでダウンロード)
- **掲示物**: A6縦・A5縦に対応し、PDF/PNGで書き出せます。A4に面付けして切り取り線付きで出力でき、複数枚をA4にまとめて印刷することもできます
- **アクセス数の集計**: 短縮URLごとに7日・30日・90日の推移を確認できます
- **悪意あるURLの検知**: 作成時と日次の全件スキャンで検査し、疑わしいリンクはリダイレクト前に警告画面を出します

## 技術構成と選定理由

選定理由は `docs/architecture.md` に書かれているものだけを要約しています。

| 領域 | 技術 | 理由(出典) |
| --- | --- | --- |
| 実行基盤 | Cloudflare Workers(静的アセット配信を含む) | — |
| フロントエンド | React Router(data mode)、Vite | — |
| API | Hono + Hono RPC + zod | 機能別にルートを分け、`hc<AppType>()`で型を共有する。zodスキーマは`shared/schemas`に置く([第7節](docs/architecture.md)) |
| DB | Cloudflare D1 + Drizzle | スキーマ変更はdrizzle-kitで生成したSQLをwranglerで適用する([第3節](docs/architecture.md)) |
| 認証 | Better Auth(メール+パスワード) | サインアップのbot対策に公式のcaptchaプラグインがあり、自前実装を避けられる([第9.4節](docs/architecture.md)) |
| アクセスログ | Workers Analytics Engine | 書き込むだけでおおむね90日後に自動削除され、削除処理を自前で持たずに済む([第12節](docs/architecture.md)) |
| 掲示物の生成 | Browser Rendering(`@cloudflare/puppeteer`) | 端末やブラウザの設定に左右されず、コンビニ印刷にPDFをそのまま持ち込める([第13節](docs/architecture.md)) |
| 掲示物のキャッシュ | Cloudflare R2 | 内容ハッシュをキーにして再生成を避ける([第13節](docs/architecture.md)) |
| レート制限 | Rate Limiting binding | ネイティブ機能で始め、プラン別の上限が必要になったらDurable Objectへ移す方針([第8節](docs/architecture.md)) |
| バックアップ | D1 Time Travel | ([第14.2節](docs/architecture.md)) |
| デプロイ | Workers Builds(GitHub連携) | 個人開発では「pushしたらすぐ確認する」運用にダッシュボード連携で足りる([deployment.md 第1節](docs/deployment.md)) |

<!-- 要記入: ここに、上の技術をなぜ選んだかの個人的な理由を書く(例: 実行基盤・React Router data modeを選んだ理由、他の候補と迷った点) -->

## 設計上の判断

- **悪意あるURLの検査が失敗したらfail-open**: 外部の脅威DB(URLhaus)への照会がタイムアウト(既定3秒)・エラーになった場合は、リダイレクトを止めずに「未検査」として扱い、失敗はログに残します。外部サービスの障害でQRコードが読めなくなる事態を避けるためです。一方、通報フォームのbot対策(Turnstile)は、検証に失敗したら必ず拒否します。目的が違うためです([第4節](docs/architecture.md)・[第9.4節](docs/architecture.md))
- **メールの「ソフト確認」**: メール確認を必須にするとサインアップ直後にセッションが発行されず、すぐ使い始められません。そこで未確認でもログイン・閲覧・削除はでき、書き込み系(作成・編集・書き出し)だけを403で止めます。捨てアドレスでフィッシング用の短縮URLを量産されるのを防ぐためです([第9.3節](docs/architecture.md))
- **`compatibility_date`を据え置き**: Browser Renderingで使う`@cloudflare/puppeteer`はWebSocketでCDP通信します。`compatibility_date`が2026-03-17以降だとWebSocketのバイナリがBlobで届く仕様変更があるため、検証せずに日付を上げず、2025-08-03のままにしています([deployment.md 第2節](docs/deployment.md))
- **テストが通らないとデプロイされない**: Workers Buildsのビルドコマンドを`pnpm test && pnpm run build`にし、テストが1件でも落ちればD1マイグレーションを含むデプロイまで進まないようにしています([deployment.md 第1.5節](docs/deployment.md))
- **退会は7日間の猶予つき削除**: 申請と同時に短縮URLのリダイレクトを止め、7日後のバッチで物理削除します。即時削除にすると、誤操作で店頭のQRコードが一瞬で使えなくなり取り返しがつかないためです([第7.1節](docs/architecture.md))

<!-- 要記入: ここに、実装中に苦労した点や、判断に迷った点を書く(例: どこで詰まり、どう解決したか) -->

## テスト

- 実行: `pnpm test`(1回実行して終了)、実装中は `pnpm test:watch`
- Vitest + `@cloudflare/vitest-plugin`。バックエンドはD1・R2・Rate Limiting bindingを含むWorkersランタイム上で、フロントエンド(`src/frontend`)はjsdom上で、`@testing-library/react`を使って実行します(vitestのprojectsで2つに分割)
- 方針: アカウント削除バッチのような複数テーブル・R2をまたぐ処理は統合テストで確認し、フロントはフォーカス管理やクリップボードなど副作用を伴う挙動を優先してテストします([第10節](docs/architecture.md))
- Browser Renderingを実際に起動するテスト(掲示物の書き出しなど)は、環境変数`CI_SKIP_BROWSER_TEST`を設定するとスキップされます。Workers Buildsのビルドコンテナではヘッドレスブラウザを動かせないためです([deployment.md 第1.5節](docs/deployment.md))

## セキュリティ・運用

コードで確認できた実装済みのものです。

- **レート制限**: 書き込み系(1分30回)・掲示物の書き出し(1分10回)・通報(1分5回)をRate Limiting bindingで制限([`wrangler.jsonc`](wrangler.jsonc)、[`src/middleware/rate-limit.ts`](src/middleware/rate-limit.ts))。サインイン・サインアップ等のBetter Authエンドポイントは、保存先をD1にして厳しめの上限を設定([`src/lib/auth.ts`](src/lib/auth.ts))。メール送信は同じ宛先に60秒に1回まで
- **Turnstile**: サインアップ(Better Authのcaptchaプラグイン)と、未ログインで使える通報APIに適用([`src/lib/turnstile.ts`](src/lib/turnstile.ts))
- **メール確認**: 未確認ユーザーの書き込みを`requireVerifiedEmail`ミドルウェアで制限。メールアドレス変更は、今のアドレスでの承認を挟む二段階([`src/middleware/require-verified-email.ts`](src/middleware/require-verified-email.ts))
- **退会処理**: 7日の猶予後に、日次のCron Triggerでアカウント・関連データ・R2キャッシュを物理削除([`src/lib/account-deletion-batch.ts`](src/lib/account-deletion-batch.ts))
- **運営による強制停止**: `links.moderationStatus`による停止(所有者は解除できない)。管理画面は無く、D1への直接SQLで運用([deployment.md 第8.2節](docs/deployment.md))
- **HTTPヘッダー**: HSTS・`X-Frame-Options: DENY`などを付与。CSPは現在Report-Onlyで、enforceへの切り替え手順を用意([`src/index.tsx`](src/index.tsx)、[deployment.md 第9節](docs/deployment.md))
- **公開前の確認**: [docs/production-verification.md](docs/production-verification.md)

関連ドキュメント: [障害対応](docs/incident-response.md) / [漏えい等対応](docs/data-breach-response.md) / [利用規約](docs/terms-of-service.md) / [プライバシーポリシー](docs/privacy-policy.md)

## 開発でのAIの使い方

<!-- 要記入: ここに、AI(Claude Code等)をどの作業にどう使ったかを書く(例: 提案を採用した箇所、却下した箇所とその理由、AGENTS.mdで決めたルール) -->

## 今後の改善

<!-- 要記入: ここに、今後取り組みたい改善を書く(例: 優先順位とその理由) -->

## ローカル開発・デプロイ

パッケージマネージャーはpnpmです。

```sh
pnpm install
cp .dev.vars.example .dev.vars   # BETTER_AUTH_SECRET をランダムな値に変更する(.dev.varsはコミットしない)
pnpm dev
```

| コマンド | 内容 |
| --- | --- |
| `pnpm build` | ビルド |
| `pnpm typecheck` | 型チェック(`tsc --noEmit`) |
| `pnpm test` / `pnpm test:watch` | テスト(1回実行 / 監視) |
| `pnpm run deploy` | マイグレーション適用+ビルド+デプロイ |

`deploy`は`pnpm deploy`と書くと、pnpm組み込みのモノレポ用コマンドが優先されてpackage.jsonのスクリプトが実行されないバージョンがあるため、必ず`run`を付けます。

**本番へのデプロイはWorkers Builds(`main`へのpush)で自動的に行われます。** 手元から`pnpm run deploy`を打つ必要はありません。ビルド設定、シークレット、D1マイグレーション、ロールバックなどの詳細は [docs/deployment.md](docs/deployment.md) を参照してください。

設計の全体像は [docs/architecture.md](docs/architecture.md) にまとめています。
