import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  // @cloudflare/vite-pluginは、ルートのindex.html(クライアントSPAのエントリ)と
  // wrangler.jsoncのmain(Workerのエントリ)の両方を検出し、client/workerの2環境を
  // まとめてビルドする。ssrPlugin(vite-ssr-components)はrenderer.tsx(hono/jsx-renderer)を
  // 使ったSSR方式専用のプラグインだったため、React Router(data mode)導入に伴い
  // renderer.tsxごと廃止し、こちらも取り除く
  plugins: [cloudflare()],
})
