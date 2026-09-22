import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

// React Router(data mode)導入により、'/'を含むフロントエンドの予約パスはASSETS binding
// (SPAシェル)へ委譲されるようになった。このテスト環境ではvite buildの成果物
// (dist/client)が存在しないため、ASSETS.fetch()自体は404を返すが、それでも構わない
// (本物のSPAシェルが返るかどうかはpnpm run buildで検証する対象であり、Definition of Done
// にも定義されている)。ここでユニットテストとして確認すべきなのは、これらのパスが
// 誤って/:shortCodeのリダイレクトハンドラ(最後に登録される、単一セグメントの
// catch-all)に捕まっていないこと。Honoのルーティングは登録順が優先されるため
// (src/index.tsxのコメント参照)、この前提が崩れると'/login'等が短縮コードとして
// DB照会され、存在しないshortCode用の404ページ(redirect-pages.tsのnotFoundPageHtml、
// 「見つかりませんでした」という文言を含む)が返ってしまう。それが起きていないことを
// 本文に当該文言が含まれないことで確認する
describe('フロントエンドの予約パスが/:shortCodeに奪われないこと', () => {
  it.each(['/', '/login', '/signup', '/terms', '/privacy', '/verify-email', '/reset-password', '/app', '/app/links/new'])(
    '%s は短縮コード用の404ページ(「見つかりませんでした」)を返さない',
    async (path) => {
      const response = await SELF.fetch(`https://example.com${path}`)
      const body = await response.text()
      expect(body).not.toContain('見つかりませんでした')
    },
  )
})
