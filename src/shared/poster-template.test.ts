import { describe, expect, it } from 'vitest'
import { POSTER_SUBTITLE_MAX_LENGTH, POSTER_TITLE_MAX_LENGTH } from '@/shared/constants/input-limits'
import {
  generatePosterA4SheetHtml,
  generatePosterFaceHtml,
  generatePosterHtml,
  getA4SheetMaxFaces,
  getPosterPageSizeMm,
  getPosterShortUrlText,
  POSTER_LAYOUT,
  POSTER_PDF_OPTIONS,
  POSTER_PNG_DEVICE_SCALE_FACTOR,
  POSTER_PNG_ELEMENT_SELECTOR,
  POSTER_SAFE_MARGIN_MM,
  POSTER_SCAN_GUIDE_TEXT,
  POSTER_TEMPLATE_VERSION,
} from '@/shared/poster-template'

describe('POSTER_PDF_OPTIONS', () => {
  it('preferCSSPageSize: trueが含まれる(@pageのサイズ指定を優先させ、レター用紙への縮小を防ぐ)', () => {
    expect(POSTER_PDF_OPTIONS.preferCSSPageSize).toBe(true)
  })

  it('printBackground: trueが含まれる(背景も出力対象にする)', () => {
    expect(POSTER_PDF_OPTIONS.printBackground).toBe(true)
  })
})

describe('PNGの撮影設定', () => {
  it('掲示物の要素(.poster)を対象にする', () => {
    expect(POSTER_PNG_ELEMENT_SELECTOR).toBe('.poster')
  })

  it('deviceScaleFactorが1より大きい値で指定されている(SNSで使える解像度にするため)', () => {
    expect(POSTER_PNG_DEVICE_SCALE_FACTOR).toBeGreaterThan(1)
  })
})

describe('generatePosterHtml', () => {
  it('html・bodyがoverflow: hiddenになっている(はみ出し防止)', () => {
    const html = generatePosterHtml({ title: 'テスト', subtitle: null, size: 'A6' }, '<svg></svg>')
    expect(html).toMatch(/html,\s*body\s*{[^}]*overflow:\s*hidden/)
  })

  it('.posterがoverflow: hiddenになっている', () => {
    const html = generatePosterHtml({ title: 'テスト', subtitle: null, size: 'A6' }, '<svg></svg>')
    expect(html).toMatch(/\.poster\s*{[^}]*overflow:\s*hidden/)
  })

  it("フォントに'Noto Sans CJK JP'・'IPAGothic'が指定されている", () => {
    const html = generatePosterHtml({ title: 'テスト', subtitle: null, size: 'A6' }, '<svg></svg>')
    expect(html).toContain("'Noto Sans CJK JP', 'IPAGothic', sans-serif")
  })

  it('A5は名前(A5)で@pageのサイズを指定する', () => {
    const html = generatePosterHtml({ title: 'テスト', subtitle: null, size: 'A5' }, '<svg></svg>')
    expect(html).toMatch(/@page\s*{\s*size:\s*A5;/)
  })

  it('A6は名前が無いためmm指定で@pageのサイズを指定する', () => {
    const html = generatePosterHtml({ title: 'テスト', subtitle: null, size: 'A6' }, '<svg></svg>')
    expect(html).toMatch(/@page\s*{\s*size:\s*105mm 148mm;/)
  })
})

describe('getA4SheetMaxFaces', () => {
  it('A6はA4縦向きに2列×2行の4面', () => {
    expect(getA4SheetMaxFaces('A6')).toBe(4)
  })

  it('A5はA4横向きに2列×1行の2面', () => {
    expect(getA4SheetMaxFaces('A5')).toBe(2)
  })
})

describe('generatePosterA4SheetHtml', () => {
  it('A6は用紙がA4縦(@page size: A4;)になる', () => {
    const faceHtml = generatePosterFaceHtml({ title: 'テスト', subtitle: null, size: 'A6' }, '<svg></svg>')
    const html = generatePosterA4SheetHtml('A6', Array(4).fill(faceHtml))
    expect(html).toMatch(/@page\s*{\s*size:\s*A4;/)
  })

  it('A5は用紙がA4横向き(@page size: A4 landscape;)になる', () => {
    const faceHtml = generatePosterFaceHtml({ title: 'テスト', subtitle: null, size: 'A5' }, '<svg></svg>')
    const html = generatePosterA4SheetHtml('A5', Array(2).fill(faceHtml))
    expect(html).toMatch(/@page\s*{\s*size:\s*A4 landscape;/)
  })

  it('A6は面(a4-face)が4つ生成される', () => {
    const faceHtml = generatePosterFaceHtml({ title: 'テスト', subtitle: null, size: 'A6' }, '<svg></svg>')
    const html = generatePosterA4SheetHtml('A6', Array(4).fill(faceHtml))
    expect(html.match(/class="a4-face"/g)).toHaveLength(4)
  })

  it('A5は面(a4-face)が2つ生成される', () => {
    const faceHtml = generatePosterFaceHtml({ title: 'テスト', subtitle: null, size: 'A5' }, '<svg></svg>')
    const html = generatePosterA4SheetHtml('A5', Array(2).fill(faceHtml))
    expect(html.match(/class="a4-face"/g)).toHaveLength(2)
  })

  it('切り取り線の要素(a4-cut-line)が、面の枠線ではなく独立した要素として含まれる', () => {
    const faceHtml = generatePosterFaceHtml({ title: 'テスト', subtitle: null, size: 'A6' }, '<svg></svg>')
    const html = generatePosterA4SheetHtml('A6', Array(4).fill(faceHtml))
    // A6(2列×2行)は縦線1本・横線1本の計2本
    expect(html.match(/class="a4-cut-line/g)).toHaveLength(2)
    expect(html).toContain('a4-cut-line--vertical')
    expect(html).toContain('a4-cut-line--horizontal')
  })

  it('A5(2列×1行)は切り取り線が縦線1本のみ', () => {
    const faceHtml = generatePosterFaceHtml({ title: 'テスト', subtitle: null, size: 'A5' }, '<svg></svg>')
    const html = generatePosterA4SheetHtml('A5', Array(2).fill(faceHtml))
    // スタイル定義自体はA6・A5どちらの出力にも含まれるため、実際に要素として使われているか
    // (class属性に含まれるか)で判定する
    expect(html.match(/class="a4-cut-line/g)).toHaveLength(1)
    expect(html).toContain('class="a4-cut-line a4-cut-line--vertical"')
    expect(html).not.toContain('class="a4-cut-line a4-cut-line--horizontal"')
  })

  it('html・body・.a4-sheet・各面(.a4-face)がoverflow: hiddenになっている', () => {
    const faceHtml = generatePosterFaceHtml({ title: 'テスト', subtitle: null, size: 'A6' }, '<svg></svg>')
    const html = generatePosterA4SheetHtml('A6', Array(4).fill(faceHtml))
    expect(html).toMatch(/html,\s*body\s*{[^}]*overflow:\s*hidden/)
    expect(html).toMatch(/\.a4-sheet\s*{[^}]*overflow:\s*hidden/)
    expect(html).toMatch(/overflow: hidden;">.*<div class="poster"/)
  })

  it('面数の上限を超えると例外になる', () => {
    const faceHtml = generatePosterFaceHtml({ title: 'テスト', subtitle: null, size: 'A6' }, '<svg></svg>')
    expect(() => generatePosterA4SheetHtml('A6', Array(5).fill(faceHtml))).toThrow()
  })

  it('面が0件だと例外になる', () => {
    expect(() => generatePosterA4SheetHtml('A6', [])).toThrow()
  })
})

describe('POSTER_TEMPLATE_VERSION', () => {
  it('案内文と短縮URLを追加した版(3)になっている', () => {
    expect(POSTER_TEMPLATE_VERSION).toBe(3)
  })
})

describe('getPosterShortUrlText', () => {
  it('短縮URL経由(link)ではhttps://を省いた文字列を返す', () => {
    expect(getPosterShortUrlText('link', 'https://kyurl.link/Ab3xK9a')).toBe('kyurl.link/Ab3xK9a')
  })

  it('http://も省く', () => {
    expect(getPosterShortUrlText('link', 'http://localhost:5173/Ab3xK9a')).toBe('localhost:5173/Ab3xK9a')
  })

  it('URLを直接指定したQRコード(rawUrl)ではnull(表示しない)', () => {
    expect(getPosterShortUrlText('rawUrl', 'https://example.com/very/long/path?x=1')).toBeNull()
  })
})

describe('読み取りの案内と短縮URLの表示', () => {
  const poster = { title: 'テスト', subtitle: null, size: 'A6' } as const

  it('案内文は短縮URLの有無によらず常に出る', () => {
    expect(generatePosterFaceHtml(poster, '<svg></svg>')).toContain(POSTER_SCAN_GUIDE_TEXT)
    expect(generatePosterFaceHtml({ ...poster, shortUrlText: 'kyurl.link/Ab3xK9a' }, '<svg></svg>')).toContain(POSTER_SCAN_GUIDE_TEXT)
  })

  it('shortUrlTextがあると短縮URLが出る', () => {
    const html = generatePosterFaceHtml({ ...poster, shortUrlText: 'kyurl.link/Ab3xK9a' }, '<svg></svg>')
    expect(html).toContain('<p class="short-url">kyurl.link/Ab3xK9a</p>')
  })

  it('shortUrlTextが無い・nullのときは短縮URLの要素を出さない', () => {
    expect(generatePosterFaceHtml(poster, '<svg></svg>')).not.toContain('class="short-url"')
    expect(generatePosterFaceHtml({ ...poster, shortUrlText: null }, '<svg></svg>')).not.toContain('class="short-url"')
  })

  it('短縮URLの文字列はエスケープされる', () => {
    const html = generatePosterFaceHtml({ ...poster, shortUrlText: '<b>x</b>' }, '<svg></svg>')
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
  })

  it('単体の掲示物HTMLにも出る', () => {
    const html = generatePosterHtml({ ...poster, shortUrlText: 'kyurl.link/Ab3xK9a' }, '<svg></svg>')
    expect(html).toContain('kyurl.link/Ab3xK9a')
    expect(html).toContain(POSTER_SCAN_GUIDE_TEXT)
  })
})

// 安全域のテスト。ここでは実際の描画ではなく、全角文字が最も幅を取るものとして行数を見積もり、
// 最長の入力(タイトル・ひとことメッセージが上限、短縮URLあり)でも、中身の高さと幅が
// 各面の安全域の内側に収まることを確かめる
describe('安全域(各面の端から5mm以内に文字やQRコードを置かない)', () => {
  const MIN_SAFE_MARGIN_MM = 5
  const L = POSTER_LAYOUT

  // 全角文字を並べたときの行数。1文字の幅は文字サイズと同じとして見積もる(最も幅を取る場合)
  function countLines(charCount: number, fontMm: number, widthMm: number): number {
    return Math.ceil(charCount / Math.floor(widthMm / fontMm))
  }

  // 最長の入力での、中身全体の高さ(mm)。案内文と短縮URLは1行で収まるものとして数える
  // (1行に収まることは別のテストで確かめる)
  function worstCaseContentHeightMm(size: 'A6' | 'A5'): number {
    const { width } = getPosterPageSizeMm(size)
    const innerWidth = width - POSTER_SAFE_MARGIN_MM * 2
    const titleLines = countLines(POSTER_TITLE_MAX_LENGTH, L.titleFontMm, innerWidth)
    const subtitleLines = countLines(POSTER_SUBTITLE_MAX_LENGTH, L.subtitleFontMm, innerWidth)
    return (
      titleLines * L.titleFontMm * L.titleLineHeight +
      L.titleMarginBottomMm +
      subtitleLines * L.subtitleFontMm * L.subtitleLineHeight +
      L.subtitleMarginBottomMm +
      L.qrcodeMm +
      L.guideMarginTopMm +
      L.guideFontMm * L.guideLineHeight +
      L.shortUrlMarginTopMm +
      L.shortUrlFontMm * L.shortUrlLineHeight
    )
  }

  it('内側の余白が5mm以上ある', () => {
    expect(POSTER_SAFE_MARGIN_MM).toBeGreaterThanOrEqual(MIN_SAFE_MARGIN_MM)
    expect(generatePosterFaceHtml({ title: 't', subtitle: null, size: 'A6' }, '')).toBeTypeOf('string')
    expect(generatePosterHtml({ title: 't', subtitle: null, size: 'A6' }, '')).toContain(`padding: ${POSTER_SAFE_MARGIN_MM}mm;`)
  })

  it.each(['A6', 'A5'] as const)('%s: 最長の入力でも、中身の高さが安全域の内側に収まる', (size) => {
    const { height } = getPosterPageSizeMm(size)
    expect(worstCaseContentHeightMm(size)).toBeLessThanOrEqual(height - POSTER_SAFE_MARGIN_MM * 2)
  })

  it.each(['A6', 'A5'] as const)('%s: QRコードが安全域の内側の幅に収まる', (size) => {
    const { width } = getPosterPageSizeMm(size)
    expect(L.qrcodeMm).toBeLessThanOrEqual(width - POSTER_SAFE_MARGIN_MM * 2)
  })

  it.each(['A6', 'A5'] as const)('%s: 案内文が1行で安全域の内側の幅に収まる', (size) => {
    const { width } = getPosterPageSizeMm(size)
    expect(POSTER_SCAN_GUIDE_TEXT.length * L.guideFontMm).toBeLessThanOrEqual(width - POSTER_SAFE_MARGIN_MM * 2)
  })

  it.each(['A6', 'A5'] as const)('%s: 短縮URL(7文字のコード)が1行で安全域の内側の幅に収まる', (size) => {
    const { width } = getPosterPageSizeMm(size)
    // 英数字は全角より細いが、安全側に全角幅として見積もる。ドメインは本番の kyurl.link
    const text = 'kyurl.link/Ab3xK9a'
    expect(text.length * L.shortUrlFontMm).toBeLessThanOrEqual(width - POSTER_SAFE_MARGIN_MM * 2)
  })

  it.each(['A6', 'A5'] as const)('%s: タイトル・ひとことメッセージは折り返し、はみ出さない指定になっている', (size) => {
    const html = generatePosterHtml({ title: 't', subtitle: 's', size }, '')
    expect(html).toMatch(/\.title\s*{[^}]*overflow-wrap:\s*anywhere/)
    expect(html).toMatch(/\.subtitle\s*{[^}]*overflow-wrap:\s*anywhere/)
  })

  // A4への面付け: 各面が用紙の内側に収まり、面の中身は面の端から安全域だけ内側にある
  // (面自体が用紙の端に接していても、中身は用紙の端から5mm以上内側になる)
  it.each(['A6', 'A5'] as const)('%s: A4に面付けしても、すべての面が用紙の内側に収まり、中身は端から5mm以上内側にある', (size) => {
    const faceHtml = generatePosterFaceHtml({ title: 'テスト', subtitle: null, size, shortUrlText: 'kyurl.link/Ab3xK9a' }, '<svg></svg>')
    const html = generatePosterA4SheetHtml(size, Array(getA4SheetMaxFaces(size)).fill(faceHtml))
    const sheetSize = html.match(/html,\s*body\s*{[^}]*?width:\s*([\d.]+)mm;\s*height:\s*([\d.]+)mm;/)
    expect(sheetSize).not.toBeNull()
    const paperWidth = Number(sheetSize?.[1])
    const paperHeight = Number(sheetSize?.[2])

    const faces = [...html.matchAll(/class="a4-face" style="left: ([\d.]+)mm; top: ([\d.]+)mm; width: ([\d.]+)mm; height: ([\d.]+)mm; overflow: hidden;"/g)]
    expect(faces).toHaveLength(getA4SheetMaxFaces(size))
    for (const [, left, top, width, height] of faces) {
      expect(Number(left) + Number(width)).toBeLessThanOrEqual(paperWidth)
      expect(Number(top) + Number(height)).toBeLessThanOrEqual(paperHeight)
      // 面の中身は面の端から余白だけ内側。面が用紙の端にあっても、用紙の端からの距離は余白以上になる
      expect(POSTER_SAFE_MARGIN_MM).toBeGreaterThanOrEqual(MIN_SAFE_MARGIN_MM)
    }
    // 面の中身を面の中に閉じ込める指定(はみ出した文字が隣の面や用紙の端に出ない)
    expect(html).toMatch(/\.poster\s*{[^}]*overflow:\s*hidden/)
  })
})
