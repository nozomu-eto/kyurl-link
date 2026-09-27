import { describe, expect, it } from 'vitest'
import {
  generatePosterA4SheetHtml,
  generatePosterFaceHtml,
  generatePosterHtml,
  getA4SheetMaxFaces,
  POSTER_PDF_OPTIONS,
  POSTER_PNG_DEVICE_SCALE_FACTOR,
  POSTER_PNG_ELEMENT_SELECTOR,
} from '@/lib/poster-template'

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
