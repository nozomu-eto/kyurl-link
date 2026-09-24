# 公開前修正v2 進捗管理(fix/pre-release-hardening-v2)

このファイルは、公開前ハードニング作業(T0〜T9)の進捗と、作業中に行った判断の記録を管理する。

## タスク一覧

- [x] T0: 進捗管理ファイルの追加(このファイル自体)
- [x] T1: expiresAtの形式検証(ISO 8601 datetime、offset必須)
- [x] T2: 過去日時をexpiresAtに設定できないようにする
- [x] T3: 既存データ確認用SQLをdocs/deployment.mdに追記
- [ ] T4: 入力上限の定数を定義(src/shared/constants/input-limits.ts)
- [ ] T5: サーバー側スキーマ(URL・掲示物・通報)への上限適用
- [ ] T6: styleOptionsのスキーマ明示(z.record() → z.strictObject())
- [ ] T7: フロントエンドへの上限適用(maxLength)
- [ ] T8: セキュリティヘッダ(CSP以外)の付与
- [ ] T9: CSPをContent-Security-Policy-Report-Onlyで導入

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
