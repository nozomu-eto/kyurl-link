# 本番公開前の確認手順書

2026-09-25 制定(公開前ハードニングv3で追加) · @Someone

一般公開(実運用開始)の直前に、手動で確認すべき項目を「手順 → 期待結果」の形でまとめる。
デプロイ方式・D1マイグレーション適用・シークレット管理・ロールバック等の恒久的な運用手順は
`docs/deployment.md`に既に整備されているため、重複させず該当節へのリンクで済ませる。
本ドキュメントは「一般公開の直前に1回、上から順に実施するチェックリスト」という位置づけ。

## 1. Turnstileウィジェットの作成・本番用サイトキー/シークレットキーの登録

サインアップ(`docs/architecture.md` 第9.4節)と通報APIのbot対策に、ローカル開発・テストでは
Cloudflare公式のテスト用キー(常に成功する`1x00000000000000000000AA`等)を使っている。
本番公開前に実際のウィジェットを発行し、テスト用キーから差し替える必要がある。

| 手順 | 期待結果 |
| --- | --- |
| Cloudflareダッシュボード → Turnstile → 「Add widget」で本番ドメイン向けのウィジェットを作成する | サイトキー・シークレットキーが発行される |
| 本番Workerの Settings > Variables and Secrets に `TURNSTILE_SECRET_KEY`(発行されたシークレットキー)を設定する(`docs/deployment.md` 第3節の手順に準じる) | ランタイムの`c.env.TURNSTILE_SECRET_KEY`がテスト用の値ではなく本番用の値になる |
| `TURNSTILE_SITE_KEY`(Worker側、警告ページHTML生成用)と`VITE_TURNSTILE_SITE_KEY`(フロント側、サインアップ画面のビルド時に埋め込まれる)の両方を、発行されたサイトキーに更新する | 2箇所が同じ値になっている |
| 本番URLでサインアップ画面・警告インターステシャルの通報フォームを実際に操作する | Turnstileウィジェットが表示され、チェック通過後に送信が成功する。テスト用キーのまま公開した場合と異なり、実際のbot判定が機能する |

## 2. wrangler.jsonc のレート制限バインディングが本番で有効か

`ratelimits`バインディング(`WRITE_RATE_LIMITER`・`POSTER_EXPORT_RATE_LIMITER`・`REPORT_RATE_LIMITER`、
`docs/architecture.md` 第9.2節)は、D1・R2と異なりダッシュボードでの事前作成が不要な一方、
デプロイ時に実際に有効化されているかを目視で確認しづらい種類のバインディングのため、個別に確認する。

| 手順 | 期待結果 |
| --- | --- |
| 本番デプロイ後、Cloudflareダッシュボード → 対象Worker → Settings > Bindings を開く | `WRITE_RATE_LIMITER`・`POSTER_EXPORT_RATE_LIMITER`・`REPORT_RATE_LIMITER`の3件がRate Limitingバインディングとして表示される |
| 本番URLに対し、`POST /api/v1/reports`を6回連続で送信する(未ログインでも実行可、`REPORT_RATE_LIMITER`は1分5回) | 6回目が429・`{ error: { code: 'RATE_LIMITED' } }`になる |
| 上記確認後、本番の通報データ(`reports`テーブル)に検証用のダミーレコードが残っていないか確認する | 不要なテストレコードが残っていれば削除する(存在しないshortCode宛の通報であれば実害は無いが、運用データを汚さないため) |

## 3. マイグレーション(moderationStatus・Better Authレート制限テーブル等)の本番D1への適用

| 手順 | 期待結果 |
| --- | --- |
| `docs/deployment.md` 第4節・第5節の手順に従い、`wrangler d1 migrations apply DB --remote`(または`deploy`スクリプト経由)でマイグレーションを適用する | 未適用のマイグレーションが無くなる |
| `wrangler d1 migrations list DB --remote`を実行する | `drizzle/`配下の全マイグレーション(`links.moderationStatus`列を追加する`0011_aspiring_micromacro.sql`、Better Authの`rateLimit`テーブルを追加する`0010_last_puppet_master.sql`を含む)が「適用済み」として表示される |
| `wrangler d1 execute kyurl-link-prod --remote --command "SELECT sql FROM sqlite_master WHERE name IN ('links', 'rateLimit');"` | `links`テーブルに`moderation_status`列が、`rateLimit`テーブルが存在することを確認できる |

## 4. ANALYTICS_API_TOKEN の権限スコープ確認

`GET /links/:id/clicks`(`docs/architecture.md` 第7節)がAnalytics Engine SQL APIへの問い合わせに使う
トークンは、必要以上の権限を持たせるとトークン漏えい時の被害範囲が広がるため、スコープを確認する。

| 手順 | 期待結果 |
| --- | --- |
| Cloudflareダッシュボード → My Profile → API Tokens で、`ANALYTICS_API_TOKEN`として発行したトークンを開く(または新規発行時の権限設定画面を開く) | トークンの権限一覧が表示される |
| 権限が「Account” → “Account Analytics” → “Read”のただ1件のみであることを確認する | 他の権限(Workers編集・D1操作・Zone設定等)が付与されていない。複数権限が付いている場合は、この用途専用のトークンを発行し直し、`wrangler secret put ANALYTICS_API_TOKEN`で本番Workerの値を差し替える |
| トークンのTTL(有効期限)・IPアドレス制限の設定内容を確認する | 意図した設定になっている(無期限にする場合はその判断を記録しておく) |

## 5. 既存データの整合性確認SQL(URLスキーム・expiresAt)の実行

`docs/deployment.md` 第8.3節に、スキーマ変更より前に作成されたデータに不正な値が残っていないかを
確認するためのSQLが既に整備されている。ここでは実行そのものをチェック項目として扱う。

| 手順 | 期待結果 |
| --- | --- |
| `docs/deployment.md` 第8.3節のSQL(a)(expiresAtが不正な日時のレコード抽出)を本番D1に対して実行する | 該当レコードが0件、または該当レコードがあれば内容を確認し同節の対応方針に従って個別対応する |
| 同節のSQL(b)(originalUrl/targetUrlのスキーム確認)を実行する | 該当レコードが0件、または該当レコードがあれば同節の対応方針に従って個別対応する |
| 対応が必要なレコードがあった場合、対応内容(status変更・削除等)と対応日時を記録に残す | 「確認したが対応不要だった」場合も含め、確認を実施した事実が残る |

## 6. サインアップ→メール未確認は書き込み403→確認後は書き込み成功、のフロー確認

`requireVerifiedEmail`ミドルウェア(`docs/architecture.md` 第9.3節)が本番でも正しく機能するかを、
実際のメール送信を含めてEnd-to-Endで確認する(テストはモック環境のため、本番のメール到達性は
別途確認が必要)。

| 手順 | 期待結果 |
| --- | --- |
| 本番URLで、実際に受信できるメールアドレスを使ってサインアップする | アカウントが作成され、確認メール(Cloudflare Email Service経由)が届く |
| 確認メールのリンクをクリックする前に、`POST /api/v1/links`等の書き込み系エンドポイントを呼ぶ(ダッシュボードから短縮URL作成を試す) | 403(`code: 'EMAIL_NOT_VERIFIED'`)になり、作成できない |
| 確認メールのリンクをクリックしてメールアドレスを確認する | `emailVerified`がtrueになる |
| 再度同じ書き込み操作を試す | 正常に作成できる(201) |

## 7. 短縮URL作成・リダイレクト・期限切れ・モデレーション停止の一連の動作確認

| 手順 | 期待結果 |
| --- | --- |
| 本番URLでログインし、短縮URLを作成する | 短縮URL(`https://<本番ドメイン>/<shortCode>`)が発行される |
| 発行された短縮URLにアクセスする | 元のURLへ302リダイレクトされる(悪意あるURL検知でflaggedと判定された場合は警告インターステシャルが表示される。第4節参照) |
| その短縮URLの`expiresAt`を過去日時にはできないこと(PATCHで過去日時を指定して400になること)を確認する(公開前修正v2 T2) | 400エラーになり、`expiresAt`が更新されない |
| 別途、有効期限が既に過ぎている短縮URL(D1を直接操作するか、短い期限で作成し待つ)にアクセスする | 410 Goneが返る(`docs/architecture.md` 第6.3節の文言で表示される) |
| `docs/deployment.md` 第8.2節の手順で、対象linkを運営停止(`moderationStatus: 'suspended'`)にする | リダイレクトが410になる |
| 停止中のlinkについて、所有者が`PATCH /api/v1/links/:id`で`status`を`'active'`に戻そうとする | 403(`code: 'MODERATION_LOCKED'`)になり、所有者は停止を解除できない |

## 8. 警告ページの通報フォーム(Turnstile含む)の動作確認

| 手順 | 期待結果 |
| --- | --- |
| 悪意あるURL検知でflagged判定される短縮URL(またはヒューリスティックに該当するURLで作成した短縮URL)にアクセスする | 警告インターステシャル(`docs/architecture.md` 第6.3節の文言)が200で表示される |
| 「このまま進む」リンクをクリックする | `?proceed=1`付きの同一パスへ遷移し、通常通り302リダイレクトされる |
| 警告ページの通報フォームからTurnstileのチェックを完了し、通報を送信する | `reports`テーブルに新しいレコードが作成される(本番のTurnstileキー・第1節が設定済みであること) |
| Turnstileのチェックを完了せずに送信を試みる(フォームを直接操作する等) | 400(`code: 'TURNSTILE_VERIFICATION_FAILED'`)等で拒否され、通報が作成されない |

## 9. レスポンスヘッダーの確認・CSP違反の確認方法・enforce切り替え手順

| 手順 | 期待結果 |
| --- | --- |
| 本番URLの主要なレスポンス(トップページ・API・404・410・警告ページ)に対し、`curl -I`またはブラウザの開発者ツール(Network)でレスポンスヘッダーを確認する | HSTS(`Strict-Transport-Security`)・`X-Content-Type-Options: nosniff`・`Referrer-Policy`・`X-Frame-Options`が公開前修正v2 T8で設定した値で付与されている |
| `Content-Security-Policy-Report-Only`ヘッダーが付与され、`Content-Security-Policy`(enforce)は付与されていないことを確認する | 現段階ではReport-Onlyのみ(公開前修正v2 T9)。誤ってenforce側が有効化されていないことも合わせて確認する |
| 主要画面(トップページ・ダッシュボード・各作成/編集画面・サインアップ・404/410/警告インターステシャル)を一通り操作し、ブラウザの開発者ツール(Console)にCSP違反のログが出ていないか確認する | 違反ログが出ない、または出た場合は内容を記録し`src/index.tsx`のCSPディレクティブを見直す |
| enforceへの切り替えが必要になった場合の手順を確認する | `docs/deployment.md` 第9節に切り替え手順(`contentSecurityPolicyReportOnly` → `contentSecurityPolicy`へのリネーム、nonce対応は変更不要、ロールバック手段)が整備済みのため、それに従う |

## 10. Cloudflareの利用状況・課金アラートの設定

Browser Rendering・R2・Workersはいずれも従量課金であり、意図しない大量利用(バグ・悪用)による
高額請求を早期に検知できるようにする。

| 手順 | 期待結果 |
| --- | --- |
| Cloudflareダッシュボード → Billing → Notifications(またはAlerts)で、Workers Requests・Workers CPU Time等の利用量アラートを設定する | 想定利用量から余裕を持たせたしきい値で通知が届くようになる |
| Browser Rendering(掲示物PDF/PNG生成)の利用量アラートを設定する(`docs/architecture.md` 第5節の試算値を参考にしきい値を決める) | 想定を超える呼び出し(悪用・バグによる連続生成等)が発生した際に通知が届く |
| R2(`kyurl-link-posters`バケット)のストレージ・Class A/B オペレーション数のアラートを設定する | 想定を超えるオブジェクト数・操作回数が発生した際に通知が届く |
| Email Service(`no-reply@kyurl.link`)の送信量アラート、または定期的な送信数の目視確認方法を決める | 送信量の異常増加(アカウント削除フローの誤動作等)に気付ける状態になる |
| 上記アラートの通知先メールアドレスが実際に受信できることを確認する | テスト通知(可能な場合)またはダッシュボード上の設定確認で、通知が届く宛先になっていることを確認する |

## 11. リポジトリを公開する前のコミット履歴全体のシークレットスキャン

`.dev.vars`・`.env`等はgitignore対象で通常はコミットされないが(`AGENTS.md`のBoundaries参照)、
過去のコミットに誤って含まれていないかを、リポジトリを公開する直前に必ず確認する。

| 手順 | 期待結果 |
| --- | --- |
| `git log --all --source --remotes -- .dev.vars .env` 等、対象ファイル名でコミット履歴を検索する | 該当ファイルがコミットされた履歴が無い、またはあれば内容を確認する |
| `gitleaks detect --source . --log-opts="--all"`(または同等のシークレットスキャンツール)をリポジトリ全体・全コミット履歴に対して実行する | 検出結果が0件、または検出された場合は各項目を精査する |
| シークレットが過去のコミットに含まれていたことが判明した場合、該当するシークレット(`BETTER_AUTH_SECRET`・`TURNSTILE_SECRET_KEY`・`URLHAUS_API_KEY`・`ANALYTICS_API_TOKEN`等)をCloudflare側で必ずローテーション(再発行・差し替え)する | 古い値が無効化され、リポジトリ公開後に読まれても実害が無い状態になる。`git filter-repo`等による履歴書き換えは、ローテーションと比べて確実性・副作用の両面でリスクが高いため、シークレットのローテーションを優先する |
| 上記が全て完了してから、リポジトリの可視性をPrivateからPublicに変更する | この順序を守ることで、公開直後にシークレットを抜き取られるリスクを避ける |
