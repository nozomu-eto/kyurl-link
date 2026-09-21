// サイズごとのページ寸法(mm)。A6縦・A5縦を想定する
const PAGE_SIZES = {
  A6: { width: 105, height: 148 },
  A5: { width: 148, height: 210 },
} as const

// HTMLの特殊文字をエスケープする(title/subtitleはユーザー入力のためXSS対策として必須)
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// 掲示物(poster)の印刷用HTMLを生成する。
// title/subtitleと、呼び出し側で生成済みのQRコードSVG文字列を、A6/A5サイズのページに
// シンプルなレイアウトで配置する(店舗掲示物として最低限見られる程度の簡易デザイン)。
// Browser Rendering(@cloudflare/puppeteer)でPDF/PNG化することを想定しており、
// @page(印刷時のページサイズ)とコンテナのwidth/heightの両方にmm単位で寸法を指定する
export function generatePosterHtml(poster: { title: string; subtitle: string | null; size: 'A6' | 'A5' }, qrCodeSvg: string): string {
  const { width, height } = PAGE_SIZES[poster.size]
  const title = escapeHtml(poster.title)
  const subtitleHtml = poster.subtitle ? `<p class="subtitle">${escapeHtml(poster.subtitle)}</p>` : ''

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<title>${title}</title>
<style>
  @page {
    size: ${width}mm ${height}mm;
    margin: 0;
  }
  * {
    box-sizing: border-box;
  }
  body {
    margin: 0;
    font-family: sans-serif;
  }
  .poster {
    width: ${width}mm;
    height: ${height}mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 8mm;
    text-align: center;
  }
  .title {
    font-size: 8mm;
    font-weight: bold;
    margin: 0 0 4mm;
  }
  .subtitle {
    font-size: 5mm;
    color: #333;
    margin: 0 0 8mm;
  }
  .qrcode {
    width: 60mm;
    height: 60mm;
  }
  .qrcode svg {
    width: 100%;
    height: 100%;
  }
</style>
</head>
<body>
  <div class="poster">
    <h1 class="title">${title}</h1>
    ${subtitleHtml}
    <div class="qrcode">${qrCodeSvg}</div>
  </div>
</body>
</html>`
}
