# 公開前修正v2 進捗管理(fix/pre-release-hardening-v2)

このファイルは、公開前ハードニング作業(T0〜T9)の進捗と、作業中に行った判断の記録を管理する。

## タスク一覧

- [x] T0: 進捗管理ファイルの追加(このファイル自体)
- [x] T1: expiresAtの形式検証(ISO 8601 datetime、offset必須)
- [x] T2: 過去日時をexpiresAtに設定できないようにする
- [x] T3: 既存データ確認用SQLをdocs/deployment.mdに追記
- [x] T4: 入力上限の定数を定義(src/shared/constants/input-limits.ts)
- [x] T5: サーバー側スキーマ(URL・掲示物・通報)への上限適用
- [x] T6: styleOptionsのスキーマ明示(z.record() → z.strictObject())
- [x] T7: フロントエンドへの上限適用(maxLength)
- [x] T8: セキュリティヘッダ(CSP以外)の付与
- [x] T9: CSPをContent-Security-Policy-Report-Onlyで導入

## 作業環境に関する記録

- 作業に使用しているgit worktreeは当初`fix/pre-release-hardening-v2`ブランチではなく、
  別名の`worktree-agent-*`ブランチ(コミットb1a5d34、`feat/design-tokens`合流直後)が
  チェックアウトされた状態だった。`fix/pre-release-hardening-v2`ブランチは別のworktree
  (リポジトリのメインディレクトリ)で既にチェックアウト済みのため、同一ブランチを
  このworktreeで重複チェックアウトすることはgitの制約上できない。
  そのため、このworktree内でローカルブランチ`hardening-v2-work`を
  `fix/pre-release-hardening-v2`の先端コミット(34ffba7)から作成し、そこで作業する。
  各タスックのコミット後は `git push origin hardening-v2-work:fix/pre-release-hardening-v2`
  の形でリモートの`fix/pre-release-hardening-v2`ブランチを更新する(ローカルのブランチ名が
  異なるのみで、pushの結果としてリモートブランチ名は指示どおりになる)。
- 作業開始前のworking treeは(このworktree内では)clean。stashされたものは無い。

## テストに関するベースライン記録

- 作業開始前に`pnpm test`をベースラインとして実行した結果、
  `src/middleware/rate-limit.test.ts`の「同一ユーザーから11回目のexportは429になる」テストが
  1回失敗した(`Can't call WebSocket send() after close()`というMiniflareのBrowser Rendering
  バインディングのシミュレーション由来のuncaught exceptionが先行している)。再実行したところ
  全131件成功した。既存コード・本タスクの変更とは無関係な、ローカル実行環境依存の
  既知のフレーキーテストと判断し、以後は各タスクごとに`pnpm test`を実行し、
  このテストのみが単発で失敗し再実行で通る場合は無視して先へ進む。

## 判断メモ(各タスク完了時に追記)

### T1: expiresAtの形式検証

- `z.iso.datetime({ offset: true })`をzod v4のソース(`node_modules/zod/v4/classic/iso.d.ts`・
  `core/schemas.d.ts`の`$ZodISODateTimeDef`)で確認し、`offset: true`でタイムゾーン情報
  (`Z`または`+09:00`等)を必須にできることを確認して採用した。
- フロントエンド(`link-create-page.tsx`)は元から`new Date(...).toISOString()`で
  offset付き('Z'終端)の文字列を送信済みだったため、フロント側の変更は不要だった。
  `link-detail-page.tsx`はexpiresAtをPATCHで送信していない(statusのみ)ため対象外。
- テストは既存のAPIレベルテスト(`src/routes/links.test.ts`)に追加した。スキーマ単体の
  テストファイルはこのプロジェクトに存在しない(既存のURLスキーム検証等もAPI越しにテストする
  方針のため、それに合わせた)。

### T2: 過去日時の拒否

- POST/PATCHハンドラで、zodのスキーマ検証(safeParse)成功後・DBアクセス前に、
  `new Date(expiresAt).getTime() <= Date.now()`で過去または現在時刻と同時刻かどうかを
  判定する処理を追加した。null(無期限指定)はチェック対象外。
- 既存テスト`src/redirect.test.ts`の「expiresAtが過去の日時の場合、statusが"active"のままでも
  410になる」テストが、PATCH経由で意図的に過去日時を設定して期限切れ状態を再現していたため、
  このタスクの変更によりPATCHそのものが400になり失敗するようになった。これは想定通りの挙動
  (過去日時を設定できなくする、が本タスクの目的そのもの)なので、テスト側を
  「moderationStatusのテストと同じパターンでD1を直接更新して期限切れ状態を再現する」方式に
  修正した(APIの挙動を弱めたのではなく、テストの前提が矛盾したため修正した点に注意)。

### T3: 既存データ確認用SQL

- `docs/deployment.md`第8節に第8.3節として追記した。既存の第8.1節(スキーム検証)と
  重複する内容(originalUrl/targetUrlのスキーム確認)も再掲したが、これはAGENTS.mdの
  「docs配下は直接編集し、更新版・追補で重複させない」という方針に反する新規ファイル作成では
  なく、同一ファイル内の既存節への追記(かつ「関連する確認のため再掲する」旨を明記)である
  ため問題ないと判断した。
- expiresAtの不正値検出には、SQLiteの`datetime()`組み込み関数が不正な日時文字列(形式不正・
  月日の範囲外等)に対してNULLを返す挙動を利用した(正規表現が使えないSQLite方言でも、
  `2026-13-45`のような値も含めて検出できる)。

### T4: 入力上限の定数

- `src/shared/constants/`ディレクトリを新規作成し、`input-limits.ts`にURL・掲示物タイトル/
  サブタイトル・通報理由/shortCodeの上限値を定数として定義した。値自体はタスク指示に明記された
  数値(2048/60/120/1000/32)をそのまま採用した。

### T5: サーバー側スキーマへの上限適用

- `httpUrlSchema`(url.ts)に`.max(URL_MAX_LENGTH)`を追加した。link/qrcodeの両方が
  このスキーマを再利用しているため、1箇所の変更で両方に適用される。
- `poster.ts`のtitle/subtitle、`report.ts`のreason/shortCodeにそれぞれ`.max()`を追加した。
- テスト中、`src/routes/reports.test.ts`にshortCode/reasonの上限テストを追加したところ、
  `reportRateLimitMiddleware`が`cf-connecting-ip`ヘッダー単位(未指定時は`'unknown'`固定)で
  60秒5回のレート制限をかけているため、同一テストファイル内の既存テストと合わせて上限を
  超え、429が返るようになって既存テストが失敗した。新規追加した4件のテストに
  一意な`cf-connecting-ip`ヘッダー(203.0.113.1〜4、テスト用に予約されたIPレンジ)を
  付与してバケットを分離することで解決した(`src/middleware/rate-limit.test.ts`の
  既存パターンを参考にした)。

### T6: styleOptionsのスキーマ明示

- `qrcode-editor-page.tsx`を確認したところ、実際に送信されるキーは`foregroundColor`・
  `backgroundColor`の2項目(いずれも`<input type="color">`が返すHEXカラー文字列)のみだった。
  これに合わせて`qcodeStyleOptionsSchema`(実装上は`qrcodeStyleOptionsSchema`)を
  `z.strictObject({ foregroundColor: z.string().max(100).optional(), backgroundColor: ... })`
  として定義した。
- **判断が必要だった点**: `poster-editor-page.tsx`を確認したところ、現時点ではposterの
  styleOptionsを送信するUIが一切無い(title/subtitleのみPATCHしている)。そのため
  「実際に送信されているキー」という基準では対象キーが0件になってしまう。
  `db/schema.ts`のコメントで「将来のカスタマイズ機能用の受け皿」と説明されており、
  posterはQRコード画像を埋め込む構成(poster-template.ts)のため、QRコード側と同じ
  前景色・背景色の2キーに揃える判断をした(ユーザーに確認せず進めるため、この判断根拠を
  ここに明記する)。空のstrictObject({})にする案も検討したが、それでは「将来のカスタマイズ
  機能用の受け皿」という既存の設計意図(architecture.md・schema.tsコメント)を実装で
  先取りして潰してしまうことになり、後で手を入れ直す前提のstrictObjectを今回作る意味が
  薄れるため見送った。
- 既存テストのうち、`src/routes/qrcodes.test.ts`が任意キーの例として`{ color: '#000000' }`を
  使っていたため、有効なキー`{ foregroundColor: '#000000' }`に修正した(strictObjectの導入に伴う
  必然的な追随修正)。あわせて、未知のキーを指定すると400になることを確認するテストを
  qrcode・poster双方に追加した。

### T7: フロントエンドへの上限適用

- link作成(originalUrl)・QRコード作成(rawUrl)・掲示物作成/編集(title・subtitle)の各入力に
  `maxLength`(src/shared/constants/input-limits.tsの定数)を設定した。
- 「上限超えエラーを日本語で、既存のエラー表示パターンに合わせて表示する」という指示について:
  各作成画面(link-create-page.tsx・qrcode-create-page.tsx・poster-create-page.tsx)は
  元々サーバーからの400エラー時に`body.error.message`をそのまま`AlertMessage`に表示する
  実装になっており、この`message`は既に日本語(例:「リクエストボディが不正です」)のため、
  追加の実装をしなくても既存の仕組みでエラーが日本語表示される。またブラウザの`maxLength`
  属性自体が、通常の入力操作ではその文字数を超えて入力できないようにするため、実際に
  サーバー側の上限エラーに到達するのは、貼り付け等でmaxLengthをすり抜けた場合や
  スキーマ変更前に保存された既存データを編集する場合等に限られる。この判断により、
  各画面のエラー表示ロジック自体には変更を加えていない(既存の仕組みで要件を満たすため)。
  掲示物編集画面(poster-editor-page.tsx)・QRコード編集画面(qrcode-editor-page.tsx)は
  元々固定文言のエラー表示(例:「保存に失敗しました」)のままで、この点は本タスクの
  スコープ(入力欄へのmaxLength付与)外と判断し変更していない。

### T8: セキュリティヘッダ(CSP以外)

- `src/index.tsx`に`app.use('*', secureHeaders({...}))`をルート定義(`/api/auth/*`マウント等)より
  前に追加し、全ルートに一律で適用した。指定した4項目(HSTS・nosniff・Referrer-Policy・
  X-Frame-Options)は`hono/secure-headers`の既定値と異なる値だったため、文字列で明示的に指定した
  (既定はそれぞれ`max-age=15552000; includeSubDomains`・`no-referrer`・`SAMEORIGIN`)。
  他のヘッダー(Cross-Origin-Resource-Policy等)は既定値のままにした(指示に無く、既定値も
  妥当なセキュリティ設定のため変更不要と判断)。
- テストで判明した問題: `c.env.ASSETS.fetch()`が返すResponseの`headers`は読み取り専用
  (immutable)で、`hono/secure-headers`がミドルウェアとして後付けでヘッダーを設定しようとすると
  `TypeError: Can't modify immutable headers.`で例外になった(タスク指示で事前に想定されていた
  問題そのもの)。`serveSpaShell()`を、ASSETS.fetch()の結果を`new Response(body, response)`で
  複製してから返す実装に変更することで解決した(bodyはそのまま、headersだけ書き込み可能な
  新しいHeadersインスタンスとして複製される)。
- テストは`src/index.test.ts`に追加し、302(リダイレクト)・404・410・警告インターステシャル
  (200)・APIレスポンス(401)・ASSETS委譲(SPA)の6パターンすべてで4項目のヘッダー値を確認した。

### T9: CSP(Content-Security-Policy-Report-Only)

- T8で追加した`secureHeaders(...)`呼び出しに`contentSecurityPolicyReportOnly`を追加した。
  `Content-Security-Policy`(enforce)ではなく`-Report-Only`のみにし、既存ページを壊さない
  よう指示通り導入した。
- 許可したホスト: 自ドメイン(`'self'`)と、サインアップ画面(SPA、turnstile-widget.tsx)・
  警告インターステシャルの通報フォームの両方が使うCloudflare Turnstile
  (`https://challenges.cloudflare.com`、script-src・frame-src・connect-src)のみ。
  architecture.md第6.6節の方針(フォントは自前配信・Google Fonts等の外部フォントホストは
  使わない)に従い、`fontSrc`は`'self'`のみとした。
- nonce対応: `hono/secure-headers`がエクスポートする`NONCE`ハンドラをscript-srcに含め、
  ミドルウェアの実装(`headersToSetForReq`の算出が`await next()`より前に行われる、
  `node_modules/hono/dist/middleware/secure-headers/secure-headers.js`で確認済み)により、
  ハンドラ実行時点で`c.get('secureHeadersNonce')`が既に設定されていることを確認して利用した。
  `src/lib/redirect-pages.ts`の`securityWarningPageHtml()`に`nonce`引数を追加し、
  通報フォームのインラインscriptタグに`nonce`属性として埋め込んだ。外部スクリプト
  (Turnstile本体の`<script src="https://challenges.cloudflare.com/...">`)はホスト一致で
  許可されるため、nonceの付与は不要と判断した。
- `styleSrc`は`'self' 'unsafe-inline'`とした。404/410/警告ページ(redirect-pages.ts)が
  静的な(利用者入力を含まない)インライン`<style>`タグを使っているため。nonce化も可能だが、
  タスク指示がnonce対応を明示していたのはscriptタグのみだったため、styleは
  `'unsafe-inline'`で許容する判断とした。
- `docs/deployment.md`に第9節として、将来Report-OnlyからContent-Security-Policy(enforce)へ
  切り替える際の手順(違反確認→ヘッダー名変更→ロールバック手段)を追記した。
- テストは`src/index.test.ts`に追加し、(a) `Content-Security-Policy-Report-Only`ヘッダーが
  付与され`Content-Security-Policy`(enforce)は付与されないこと、(b) 警告インターステシャルの
  インラインscriptのnonce属性値とレスポンスヘッダー中のnonce値が一致することを確認した。

## v3

- [x] T1: テスト・型チェックのスクリプト整備
- [x] T2: ポスターexportのレート制限テストを安定させる
- [x] T3: 編集画面でサーバーのエラー内容を表示する
- [x] T4: 本番公開前の確認手順書
- [ ] T5: PRの作成

## 判断メモ(v3、各タスク完了時に追記)

### T1: テスト・型チェックのスクリプト整備

- `package.json`の`scripts`を次のように変更した。
  - `"test": "vitest run"`(1回実行して終了する。CI・DoD確認向け)
  - `"test:watch": "vitest"`(旧`pnpm test`の挙動そのまま。実装中の継続実行向け)
  - `"typecheck": "tsc --noEmit"`(新規追加)
- `tsc -b`(プロジェクト参照によるビルドモード)を使うかどうかを`tsconfig.json`で確認したところ、
  `references`・`composite`のいずれも設定されておらずプロジェクトは単一構成だった。
  `tsc -b`はプロジェクト参照が無い場合は通常の`--noEmit`と大きな差が無い一方、参照が無い構成へ
  `-b`を使う意味が無く既存の`pnpm exec tsc --noEmit`という運用実績とも合わないため、
  単純に`tsc --noEmit`を採用した(TypeScript 7.0.2がインストール済みであることは
  `pnpm exec tsc --version`で確認済み。7系での`-b`/`--noEmit`の扱いも6系までと同様、
  プロジェクト参照が無ければ単一プロジェクトのフルチェックとして動作する)。
- `pnpm typecheck`を実行したところ、型エラーは0件だった。
- AGENTS.mdの「Commands」節を、`pnpm test`(1回実行)・`pnpm test:watch`(watch)・
  `pnpm typecheck`の3行に更新した。「Definition of Done」節の`pnpm exec tsc --noEmit`という
  記述も`pnpm typecheck`に統一した。README.mdにはテスト・型チェックに関する記述が
  無かったため変更していない。
- **判断が必要だった点(環境構築)**: このworktreeには`.dev.vars`が存在せず(gitignore対象・
  新規worktreeのため未作成)、この状態で`pnpm vitest run`を実行すると
  `BETTER_AUTH_SECRET`未設定等に起因して19ファイル中14ファイル・97件のテストが失敗した
  (サインイン関連が200を期待して403になる、`signUpAndGetUserId`がuser.idを読めない、等)。
  これは今回の変更(スクリプト追加のみ)による回帰ではなく、AGENTS.mdの「Setup」節が明記する
  「初回のみ`.dev.vars.example`を`.dev.vars`にコピーし`BETTER_AUTH_SECRET`をランダムな値に
  変更する」という前提セットアップをこのworktreeでまだ行っていなかったことが原因と判断した。
  `.dev.vars.example`をコピーして`.dev.vars`を作成し、`BETTER_AUTH_SECRET`を
  `crypto.randomBytes(32).toString('hex')`で生成したランダムな値に変更したところ、
  `pnpm vitest run`は19ファイル162件全て成功した(`.dev.vars`はgitignore対象のためコミット対象外)。
  以後のタスクもこのセットアップ済みの状態で作業する。
- テスト実行結果(`.dev.vars`セットアップ後の`pnpm vitest run`): 19ファイル・162件全て成功。
  T2で対応する`POSTER_EXPORT_RATE_LIMITER`関連の`Can't call WebSocket send() after close()`という
  Miniflare由来のuncaught exceptionログ自体は出力されたが、v2のベースライン記録通りテストの
  成否には影響しなかった(全件成功)。

### T2: ポスターexportのレート制限テストを安定させる

- **採用した方式**: 指示の優先順位どおり、まず1番目の方式(R2キャッシュの事前投入)を検討したところ
  `src/routes/posters.ts`のexportハンドラは「認可チェック→R2(POSTER_CACHE)キャッシュ確認→
  ヒットすればそのまま返す(Browser Renderingを起動しない)」という順序になっており、
  キャッシュキー(`${poster.id}/${format}/${sha256(title・subtitle・size・styleOptions・
  QRコードSVGのJSON)}`)さえ再現できれば実現可能と判断し、こちらを採用した(2番目の
  `vi.mock`によるpuppeteer.launchの差し替えは不要だった)。
- `src/middleware/rate-limit.test.ts`に`computePosterExportCacheKey()`ヘルパーを追加し、
  posters.tsのハンドラと全く同じ手順(`qrcode-svg`でSVGを生成→
  `{ title, subtitle, size, styleOptions, qrCodeSvg }`という同じキー順のオブジェクトを
  `JSON.stringify`→`crypto.subtle.digest('SHA-256', ...)`→16進文字列化)でキャッシュキーを
  計算した。QRコードの内容(`qrContent`)は、テストが`targetType: 'link'`で作成した
  linkの`shortCode`から`https://example.com/${link.shortCode}`として組み立てた(ハンドラが
  `new URL(c.req.url).origin`から求めるoriginと、テストが`SELF.fetch('https://example.com/...')`
  で使うoriginが一致することを確認した上で採用)。
- 計算したキーに対し、テスト内で`env.POSTER_CACHE.put(cacheKey, ダミーのPDFバイト列)`を
  export呼び出しループの前に実行しておくことで、11回のexport呼び出し(10回成功+11回目の429)を
  通じて一度もBrowser Rendering(`@cloudflare/puppeteer`の`launch`)が起動しないようにした。
  検証していること自体(10回成功・11回目が429・エラーコードが`RATE_LIMITED`)は変更していない。
- `it.skipIf(process.env.CI_SKIP_BROWSER_TEST)`を外した。このテストはもうBrowser Renderingの
  実起動に依存しないため、`CI_SKIP_BROWSER_TEST`環境変数によるスキップ対象から外れるのが
  実態に合っていると判断した(スキップ条件を残すと「Browser Renderingに依存しないテストに
  した」というこのタスクの目的と矛盾するため)。
- `pnpm vitest run src/middleware/rate-limit.test.ts`を5回連続実行し、5回とも全5件成功した
  (`Can't call WebSocket send() after close()`のログも一切出力されなかった)。
- v2のベースライン記録(「既知のフレーキーテスト」)は本タスクで解消済み。ただし、
  `src/routes/posters.test.ts`側には引き続き実際にBrowser Renderingを起動するテストが残っており
  (`pnpm test`実行時に同種のuncaught exceptionログが1回出力されることを確認したが、
  このテストファイル自体は全件成功しており、テストの成否には影響していない)、これは
  T2のスコープ(`rate-limit.test.ts`のみ)外のため今回は変更していない。

### T3: 編集画面でサーバーのエラー内容を表示する

- `qrcode-editor-page.tsx`の`handleStyleSubmit`・`poster-editor-page.tsx`の`handleSubmit`の
  それぞれ、保存(PATCH)失敗時のエラー表示を、作成画面(`qrcode-create-page.tsx`・
  `poster-create-page.tsx`)と同じ`'error' in body`パターンに揃えた。具体的には
  `const body = await response.json().catch(() => null)`でレスポンスボディを取得し、
  `body`が存在し`'error' in body`かつ`body.error.message`が存在すればそれを表示、
  そうでなければ既存の固定文言(「スタイル設定の保存に失敗しました」「保存に失敗しました」)に
  フォールバックする。
- **429(レート制限)専用の特別な文言は追加していない**。第9.2節の「フロントエンドは429受信時に
  日本語の案内メッセージを表示する」という要件は、作成画面側で個別のステータスコード分岐を
  していない(`response.json()`の`error.message`をそのまま表示するだけで、サーバー側が
  返す`RATE_LIMITED`のmessage「リクエストが多すぎます。しばらく時間をおいてから再度
  お試しください」が既に日本語であるためそのまま満たされる)ことを`src/middleware/rate-limit.ts`で
  確認済み。編集画面も同じ`body.error.message`表示方式にしたことで、作成画面と全く同じ形で
  この要件を満たす。
- **スコープの判断**: 指示は「保存失敗時」のエラー表示のみを対象にしていたため、
  同じ画面にある削除(DELETE)失敗時のエラー表示(「削除に失敗しました」固定文言)は
  意図的に変更していない。大きなリファクタは避ける方針(指示・AGENTS.mdのBoundaries)に従い、
  共通ヘルパー関数への抽出も行わず、作成画面のパターンをそのまま複製する形にとどめた。
  EMAIL_NOT_VERIFIED時の「メール確認待ち」画面への導線リンク(作成画面のみに実装済み、
  第9.3節)も、指示にエラーメッセージ表示のみが明記されていたため今回は追加していない。

### T4: 本番公開前の確認手順書

- `docs/deployment.md`と役割を分離した。`docs/deployment.md`は「デプロイの仕組み・恒久的な
  運用手順」(既に整備済み)を扱うのに対し、`docs/production-verification.md`は「一般公開の
  直前に1回、上から順に手動で実施するチェックリスト」という位置づけにした。指示にある
  「`docs/deployment.md`が既にカバーしている内容は重複させずリンクする」という方針に従い、
  マイグレーション適用手順(第4・5節)・既存データ確認SQL(第8.3節)・CSP切り替え手順(第9節)・
  ロールバック(第6節)は内容を再掲せず、該当節へのリンク(節番号の参照)にとどめた。一方、
  「本番D1に対して実際にそのSQLを実行し、結果を確認する」という確認作業そのものは
  重複ではなくこのドキュメントの目的そのものであるため、実行手順自体は本ドキュメント側に書いた。
- 11項目全てを指示の順序どおりに並べ、各項目を「手順→期待結果」の表形式にした
  (`docs/architecture.md`の既存の表形式に合わせた)。
- 項目4(ANALYTICS_API_TOKENのスコープ)は、実装(`src/routes/links.ts`・
  `src/types/cloudflare-bindings.d.ts`)を確認し、実際にこのトークンがAnalytics Engine SQL APIへの
  問い合わせ専用に使われていることを踏まえ、「Account Analytics: Read」の1件のみであることを
  確認する手順にした。
- 項目11(シークレットスキャン)は、AGENTS.mdのBoundaries(`.env`や秘密鍵をコミットしない)を
  踏まえ、万一過去のコミットに含まれていた場合は「履歴の書き換え(`git filter-repo`等)」ではなく
  「シークレットのローテーション」を優先する方針を明記した。理由は、公開リポジトリのフォーク・
  クローンが既に取得された後では履歴書き換えだけでは漏えいを防げない一方、シークレットの
  再発行・差し替えであれば古い値自体を無効化でき、より確実に実害を防げるため。
- ドキュメントのみの変更のため、`pnpm typecheck`のみ実行しエラー無しを確認した
  (`pnpm test`も念のため実行し、既存の162件が全て成功することを確認した)。


