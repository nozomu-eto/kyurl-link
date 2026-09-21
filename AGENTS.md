# AGENTS.md

kyurl.link — URL短縮 + QRコード生成 + 掲示物(ポスター)生成サービス。
詳細な設計は `docs/architecture.md` を参照。利用規約・プライバシーポリシー・障害対応・漏えい対応は `docs/` 配下の各ファイルを参照。

## Commands

- Install: `pnpm install`
- Dev: `pnpm dev`
- Build: `pnpm build`
- Deploy: `pnpm deploy`
- Test: `pnpm test`(Vitest + `@cloudflare/vitest-plugin`)
- Type check: `pnpm exec tsc --noEmit`

## Code style

- TypeScript統一。コメントは日本語で、処理内容と役割(何をして、なぜそうするか)がわかるように書く
- パスエイリアス: `@/*` は `src/*` を指す(baseUrlは使わず、tsconfig.jsonの`paths`に直接相対パスを書く形。TypeScript 6.0以降の推奨)
- Honoルートはメソッドチェーンで定義する(型推論を保つため、後から`.get()`を個別に呼ばない)
  例: `new Hono().basePath('/links').get('/', handler)`
- APIレスポンスの一覧形式: `{ items, total, limit, offset }`
- APIエラー形式: `{ error: { code, message, details? } }`

## Boundaries

- React Routerは **data mode** のみ使用する。`@react-router/dev`によるFramework modeは使わない
- `src/renderer.tsx`と`vite-ssr-components`は、React Router導入時にまとめて置き換える(それまで個別に消さない)
- `docs/`配下の各ドキュメントは直接編集する。「更新版」「追補」といった別ファイルを新設して重複させない(バージョン管理はgit commitで行う)

## Git

- コミットメッセージ: Conventional Commits形式・日本語
  例: `feat: linkリソースのzodスキーマを追加` / `fix: tsconfig pathsのエイリアス解決を反映`
