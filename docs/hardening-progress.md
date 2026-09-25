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

- [ ] T1: テスト・型チェックのスクリプト整備
- [ ] T2: ポスターexportのレート制限テストを安定させる
- [ ] T3: 編集画面でサーバーのエラー内容を表示する
- [ ] T4: 本番公開前の確認手順書
- [ ] T5: PRの作成

