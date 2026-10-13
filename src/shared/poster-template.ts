// テンプレート・書き出し設定の版。テンプレートのHTML構造やCSS、あるいはposters.tsで
// puppeteerに渡す書き出し設定(POSTER_PDF_OPTIONS等)を変更した場合は、この値を上げること。
// R2キャッシュキーの計算にこの値を含めることで、修正前の(サイズや余白が誤った)PDF/PNGが
// R2から返り続けることを防ぐ。
// 3: 読み取りの案内文と短縮URLの表示を追加し、それに合わせてQRコードを60mmから56mmに縮めた
// 4: QRコードのSVGにviewBoxを追加し、枠に合わせて中身も縮むようにした(右端・下端が切れていた。POR-143)。
//    版3までに書き出したQRコードが切れたPDF/PNGを、R2キャッシュから返さないようにする
export const POSTER_TEMPLATE_VERSION = 4

// サイズごとのページ寸法(mm)。A6縦・A5縦を想定する
const PAGE_SIZES = {
  A6: { width: 105, height: 148 },
  A5: { width: 148, height: 210 },
} as const

// 掲示物1面の寸法(mm)。画面のプレビューが、書き出しと同じ縦横比で表示するために使う
export function getPosterPageSizeMm(size: 'A6' | 'A5'): { width: number; height: number } {
  return PAGE_SIZES[size]
}

// 各面の端から確保する安全域(mm)。家庭用プリンターやコンビニのプリントは用紙の端から
// 約5mmを印刷できないため、文字・QRコードをこの余白より内側に収める。
// 現在の内側余白(8mm)はこの値を下回らないようにすること
export const POSTER_SAFE_MARGIN_MM = 8

// 掲示物1面の中身の寸法(mm・倍率)。CSS(posterFaceStyle)の値の元であり、最長の入力でも
// 安全域の内側に収まることをテストで確かめるためにも使う
export const POSTER_LAYOUT = {
  titleFontMm: 8,
  titleLineHeight: 1.4,
  titleMarginBottomMm: 4,
  subtitleFontMm: 5,
  subtitleLineHeight: 1.5,
  subtitleMarginBottomMm: 6,
  qrcodeMm: 56,
  guideFontMm: 3.6,
  guideLineHeight: 1.4,
  guideMarginTopMm: 4,
  shortUrlFontMm: 4.2,
  shortUrlLineHeight: 1.3,
  shortUrlMarginTopMm: 1.5,
} as const

// QRコードのそばに出す読み取りの案内文
export const POSTER_SCAN_GUIDE_TEXT = 'スマートフォンのカメラで読み取ってください'

// 掲示物に表示する短縮URLの文字列を決める。短縮URL経由(targetType: 'link')のQRコードだけが対象で、
// 直接指定のURL(rawUrl)は長く入力の手がかりにならないためnull(表示しない)。
// contentはQRコードに埋め込む内容(resolveQrcodeContentの結果)をそのまま渡す。
// 書き出し(サーバー)と画面のプレビューが同じ文字列になるよう、この関数で整形する(https://は省く)
export function getPosterShortUrlText(targetType: 'link' | 'rawUrl', content: string): string | null {
  if (targetType !== 'link') {
    return null
  }
  return content.replace(/^https?:\/\//, '')
}

// 掲示物1面に表示する内容。shortUrlTextは省略またはnullなら短縮URLを出さない
type PosterFaceContent = { title: string; subtitle: string | null; size: 'A6' | 'A5'; shortUrlText?: string | null }

// GET /api/v1/posters/:id/exportでPDFを生成する際、page.pdf()に渡すオプション。
// @cloudflare/puppeteerの既定値のまま呼び出すと、用紙がレター(8.5×11インチ)固定になり、
// preferCSSPageSize: false(既定)のため@page(このテンプレートの用紙サイズ指定)が無視されて
// 内容が縮小されてしまうため、明示的に指定する
export const POSTER_PDF_OPTIONS = {
  // @pageのsize指定(getCssPageSize参照)を優先させる。これがfalse(既定)だと、
  // ブラウザの既定用紙(レター)に縮小されてしまう
  preferCSSPageSize: true,
  // 背景色・背景画像も出力する(既定はfalseで、印刷時に背景が省略される一般的なブラウザの
  // 既定動作に合わせているが、掲示物は背景も含めて掲示物のため必須)
  printBackground: true,
} as const

// GET /api/v1/posters/:id/exportでPNGを生成する際に使う設定。
// 既定のビューポート(800×600)のスクリーンショットでは掲示物の一部しか写らないため、
// 画面全体ではなく掲示物の要素(POSTER_PNG_ELEMENT_SELECTOR)だけを撮影する。
// deviceScaleFactorでSNS投稿に使える解像度にする
export const POSTER_PNG_ELEMENT_SELECTOR = '.poster'
export const POSTER_PNG_DEVICE_SCALE_FACTOR = 3

// HTMLの特殊文字をエスケープする(title/subtitleはユーザー入力のためXSS対策として必須)
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// @pageのsize指定を組み立てる。CSSの名前付きページサイズ(A4・A4 landscape・A5)が使える
// ものは名前で指定し、名前が無いA6はmm指定にする(mm指定は単位変換の丸めで、紙の端に
// 隙間が出たり空白の2ページ目が出たりする報告があるため、名前があるものは名前を優先する)。
// ChromeがA6の名前(size: A6;)に対応していることを確認できれば、A6も名前指定に変更してよい
// (未検証のため、安全側のmm指定のままにしている)
function getCssPageSize(size: 'A6' | 'A5'): string {
  if (size === 'A5') {
    return 'A5'
  }
  const { width, height } = PAGE_SIZES[size]
  return `${width}mm ${height}mm`
}

// 掲示物の見た目(フォント・タイトル・サブタイトル・QRコードのレイアウト)を定義する
// 共通スタイル。1面分の.poster要素(generatePosterFaceHtml)を、単体の掲示物HTML
// (generatePosterHtml)・A4シートHTML(generatePosterA4SheetHtml)の両方で同じ見た目に
// するため、共通の関数として切り出す
function posterFaceStyle(): string {
  const L = POSTER_LAYOUT
  return `
  .poster {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding: ${POSTER_SAFE_MARGIN_MM}mm;
    text-align: center;
    font-family: 'Noto Sans CJK JP', 'IPAGothic', sans-serif;
  }
  .title {
    font-size: ${L.titleFontMm}mm;
    line-height: ${L.titleLineHeight};
    font-weight: bold;
    margin: 0 0 ${L.titleMarginBottomMm}mm;
    overflow-wrap: anywhere;
    text-wrap: balance;
  }
  .subtitle {
    font-size: ${L.subtitleFontMm}mm;
    line-height: ${L.subtitleLineHeight};
    color: #333;
    margin: 0 0 ${L.subtitleMarginBottomMm}mm;
    overflow-wrap: anywhere;
    text-wrap: balance;
  }
  .qrcode {
    width: ${L.qrcodeMm}mm;
    height: ${L.qrcodeMm}mm;
  }
  .qrcode svg {
    width: 100%;
    height: 100%;
  }
  .scan-guide {
    font-size: ${L.guideFontMm}mm;
    line-height: ${L.guideLineHeight};
    color: #4a4a4a;
    margin: ${L.guideMarginTopMm}mm 0 0;
  }
  .short-url {
    font-size: ${L.shortUrlFontMm}mm;
    line-height: ${L.shortUrlLineHeight};
    font-weight: 600;
    color: #4a4a4a;
    margin: ${L.shortUrlMarginTopMm}mm 0 0;
    overflow-wrap: anywhere;
  }
`
}

// 掲示物1面分のHTMLフラグメント(タイトル・サブタイトル・QRコード・読み取りの案内・短縮URLを配置した.poster要素)を
// 生成する。generatePosterHtml(単体の掲示物)・generatePosterA4SheetHtml(A4に面付け)の
// 両方から呼び出し、同じ見た目の面を再利用する
export function generatePosterFaceHtml(poster: PosterFaceContent, qrCodeSvg: string): string {
  const { width, height } = PAGE_SIZES[poster.size]
  const title = escapeHtml(poster.title)
  const subtitleHtml = poster.subtitle ? `<p class="subtitle">${escapeHtml(poster.subtitle)}</p>` : ''
  // 案内文は常に出す。短縮URLは、短縮URL経由のQRコードのときだけ出す
  const shortUrlHtml = poster.shortUrlText ? `<p class="short-url">${escapeHtml(poster.shortUrlText)}</p>` : ''

  return `<div class="poster" style="width: ${width}mm; height: ${height}mm;">
    <h1 class="title">${title}</h1>
    ${subtitleHtml}
    <div class="qrcode">${qrCodeSvg}</div>
    <p class="scan-guide">${POSTER_SCAN_GUIDE_TEXT}</p>
    ${shortUrlHtml}
  </div>`
}

// 掲示物(poster)の印刷用HTMLを生成する(クエリpaper=fit、掲示物サイズのまま1面)。
// title/subtitleと、呼び出し側で生成済みのQRコードSVG文字列を、A6/A5サイズのページに
// シンプルなレイアウトで配置する(店舗掲示物として最低限見られる程度の簡易デザイン)。
// Browser Rendering(@cloudflare/puppeteer)でPDF/PNG化することを想定しており、
// @page(印刷時のページサイズ)とコンテナのwidth/heightの両方にmm単位で寸法を指定する。
// html・body・.poster(用紙全体を包む要素)を用紙と同じ大きさにしoverflow: hiddenにすることで、
// 中身が用紙からはみ出して意図しない2ページ目ができないようにする(POSTER_PDF_OPTIONSの
// preferCSSPageSize: trueとあわせて、用紙サイズを正しく書き出すため)
export function generatePosterHtml(poster: PosterFaceContent, qrCodeSvg: string): string {
  const { width, height } = PAGE_SIZES[poster.size]
  const title = escapeHtml(poster.title)

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<title>${title}</title>
<style>
  @page {
    size: ${getCssPageSize(poster.size)};
    margin: 0;
  }
  * {
    box-sizing: border-box;
  }
  html, body {
    margin: 0;
    width: ${width}mm;
    height: ${height}mm;
    overflow: hidden;
  }
  ${posterFaceStyle()}
</style>
</head>
<body>
  ${generatePosterFaceHtml(poster, qrCodeSvg)}
</body>
</html>`
}

// A4シートの面付けレイアウト(docs/architecture.mdの「API設計」・「画面ごとの確定仕様」)。
// A6縦(105×148mm)はA4縦向き(210×297mm)に2列×2行の4面、A5縦(148×210mm)はA4横向き
// (297×210mm)に2列×1行の2面になる。paperCssSizeは名前が使えるためgetCssPageSizeと同様に
// 名前で指定する
const A4_SHEET_LAYOUTS: Record<'A6' | 'A5', { paperCssSize: string; paperWidthMm: number; paperHeightMm: number; cols: number; rows: number }> = {
  A6: { paperCssSize: 'A4', paperWidthMm: 210, paperHeightMm: 297, cols: 2, rows: 2 },
  A5: { paperCssSize: 'A4 landscape', paperWidthMm: 297, paperHeightMm: 210, cols: 2, rows: 1 },
}

// A4シートに並べられる最大面数(「まとめて印刷」の上限チェックからも参照できるよう、
// 計算元のレイアウト定義と一緒にここへ置く)
export function getA4SheetMaxFaces(posterSize: 'A6' | 'A5'): number {
  const layout = A4_SHEET_LAYOUTS[posterSize]
  return layout.cols * layout.rows
}

// generatePosterA4SheetHtml: 掲示物1面分のHTMLフラグメントの配列を受け取り、A4用紙にまとめて
// 並べたHTML文書を組み立てる。「まとめて印刷」では面ごとに異なる掲示物のfaceHtmlを並べ、
// 単体の書き出し(paper=a4)では同じ掲示物のfaceHtmlを全面に並べる。どちらの場合もこの関数を使えるよう、
// 面の配列を受け取る形にしている。
// 各面は元のサイズのまま(拡大縮小しない)、左上から隙間を空けずに敷き詰め、割り切れず余る
// スペースは右端・下端に残す(面を並べる際、端数のミリ単位まではきっちり割り切れないため)。
// 面の境界には、面の枠線ではなく上に重ねる別の要素として、灰色の細い破線の切り取り線を入れる
export function generatePosterA4SheetHtml(posterSize: 'A6' | 'A5', faceHtmlList: string[]): string {
  const layout = A4_SHEET_LAYOUTS[posterSize]
  const { width: faceWidthMm, height: faceHeightMm } = PAGE_SIZES[posterSize]
  const maxFaces = layout.cols * layout.rows

  if (faceHtmlList.length === 0 || faceHtmlList.length > maxFaces) {
    throw new Error(`posterSize=${posterSize}のA4シートに並べられるのは1〜${maxFaces}面です(${faceHtmlList.length}面指定されました)`)
  }

  const facesHtml = faceHtmlList
    .map((faceHtml, index) => {
      const row = Math.floor(index / layout.cols)
      const col = index % layout.cols
      const left = col * faceWidthMm
      const top = row * faceHeightMm
      // 面ごとにoverflow: hiddenにし、長い文字が隣の面にはみ出さないようにする
      return `<div class="a4-face" style="left: ${left}mm; top: ${top}mm; width: ${faceWidthMm}mm; height: ${faceHeightMm}mm; overflow: hidden;">${faceHtml}</div>`
    })
    .join('')

  // 切り取り線は、実際に面を敷き詰めた範囲(端数の余りは含まない)の境界にだけ引く
  const contentWidthMm = layout.cols * faceWidthMm
  const contentHeightMm = layout.rows * faceHeightMm
  const cutLines: string[] = []
  for (let col = 1; col < layout.cols; col++) {
    const x = col * faceWidthMm
    cutLines.push(`<div class="a4-cut-line a4-cut-line--vertical" style="left: ${x}mm; height: ${contentHeightMm}mm;"></div>`)
  }
  for (let row = 1; row < layout.rows; row++) {
    const y = row * faceHeightMm
    cutLines.push(`<div class="a4-cut-line a4-cut-line--horizontal" style="top: ${y}mm; width: ${contentWidthMm}mm;"></div>`)
  }

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<style>
  @page {
    size: ${layout.paperCssSize};
    margin: 0;
  }
  * {
    box-sizing: border-box;
  }
  html, body {
    margin: 0;
    width: ${layout.paperWidthMm}mm;
    height: ${layout.paperHeightMm}mm;
    overflow: hidden;
  }
  .a4-sheet {
    position: relative;
    width: ${layout.paperWidthMm}mm;
    height: ${layout.paperHeightMm}mm;
    overflow: hidden;
  }
  .a4-face {
    position: absolute;
  }
  .a4-cut-line {
    position: absolute;
  }
  .a4-cut-line--vertical {
    top: 0;
    width: 0;
    border-left: 1px dashed #999999;
  }
  .a4-cut-line--horizontal {
    left: 0;
    height: 0;
    border-top: 1px dashed #999999;
  }
  ${posterFaceStyle()}
</style>
</head>
<body>
  <div class="a4-sheet">
    ${facesHtml}
    ${cutLines.join('')}
  </div>
</body>
</html>`
}
