import QRCode from 'qrcode-svg'
import { describe, expect, it } from 'vitest'
import { QRCODE_IMAGE_SIZE_OPTIONS, renderQrcodePng, renderQrcodeSvg } from '@/lib/qrcode-image'
import { decodeGrayscalePixels, readPngDimensions } from '../../test/png-inspect'

// qrcode-svgのsvg()はデフォルトwidth/height=256、padding=4で描画する(renderQrcodeSvgは
// どちらも指定していないため既定値のまま)。テスト側でもこの前提でセルサイズ・座標を計算する
const SVG_DEFAULT_SIZE = 256
const SVG_DEFAULT_PADDING = 4

describe('renderQrcodeSvg', () => {
  it('SVG文字列を返す(既存のqrcode-svgの出力のまま)', () => {
    const svg = renderQrcodeSvg('https://example.com')
    expect(svg).toContain('<svg')
  })

  it('出力される<rect>の位置が、QRコードの規格どおりの向き(isDark(row, col))と一致する', () => {
    const content = 'https://example.com/svg-orientation-check'
    const modules = new QRCode({ content }).qrcode.modules
    const moduleCount = modules.length

    const svg = renderQrcodeSvg(content)
    const cellSize = SVG_DEFAULT_SIZE / (moduleCount + SVG_DEFAULT_PADDING * 2)

    // 背景のrect(x="0" y="0" width="256"の全面矩形)を除いた、モジュール1つ分のrectだけを集める
    const rectPattern = /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g
    const darkPositions = new Set<string>()
    for (const match of svg.matchAll(rectPattern)) {
      const width = Number(match[3])
      if (width === SVG_DEFAULT_SIZE) {
        continue // 背景の全面矩形
      }
      const x = Number(match[1])
      const y = Number(match[2])
      const col = Math.round(x / cellSize - SVG_DEFAULT_PADDING)
      const row = Math.round(y / cellSize - SVG_DEFAULT_PADDING)
      darkPositions.add(`${row},${col}`)
    }

    // 3つの位置検出パターン(大きな四角)は縦横を入れ替えても同じ位置にあるため、それだけでは
    // 向きの誤りを検出できない。全マスを1つずつ比較する
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        const expectedDark = modules[row][col]
        const actualDark = darkPositions.has(`${row},${col}`)
        expect(actualDark, `row=${row}, col=${col}`).toBe(expectedDark)
      }
    }
  })
})

describe('renderQrcodePng', () => {
  it.each(QRCODE_IMAGE_SIZE_OPTIONS)('sizeに%iを指定すると、その通りの縦横のPNGを返す', async (size) => {
    const png = await renderQrcodePng('https://example.com/abc', size)

    // PNGのシグネチャ(先頭8バイト)
    expect(Array.from(png.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    const { width, height } = readPngDimensions(png)
    expect(width).toBe(size)
    expect(height).toBe(size)
  })

  it('画素が白(255)と黒(0)だけであること(中間色が無いこと)', async () => {
    const png = await renderQrcodePng('https://example.com/abc', 512)
    const pixels = await decodeGrayscalePixels(png)

    const uniqueValues = new Set(pixels)
    expect(Array.from(uniqueValues).sort((a, b) => a - b)).toEqual([0, 255])
  })

  it('同じ内容から生成すると、常に同じPNGになる(決定的である)', async () => {
    const first = await renderQrcodePng('https://example.com/deterministic', 512)
    const second = await renderQrcodePng('https://example.com/deterministic', 512)
    expect(Array.from(first)).toEqual(Array.from(second))
  })

  it('各マスの中心の画素が、QRコードの規格どおりの向き(isDark(row, col))と一致する', async () => {
    const content = 'https://example.com/png-orientation-check'
    const modules = new QRCode({ content }).qrcode.modules
    const moduleCount = modules.length
    const size = 512

    const png = await renderQrcodePng(content, size)
    const pixels = await decodeGrayscalePixels(png)

    // renderQrcodePng内部と同じ計算式で、各マスの中心座標を求める
    const paddingModules = 4
    const totalModules = moduleCount + paddingModules * 2
    const pixelsPerModule = Math.max(1, Math.floor(size / totalModules))
    const usedPixels = pixelsPerModule * totalModules
    const extraPixels = size - usedPixels
    const marginBefore = pixelsPerModule * paddingModules + Math.floor(extraPixels / 2)

    // 3つの位置検出パターン(大きな四角)は縦横を入れ替えても同じ位置にあるため、それだけでは
    // 向きの誤りを検出できない。全マスを1つずつ比較する
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        const centerX = marginBefore + col * pixelsPerModule + Math.floor(pixelsPerModule / 2)
        const centerY = marginBefore + row * pixelsPerModule + Math.floor(pixelsPerModule / 2)
        const pixelValue = pixels[centerY * size + centerX]

        const expectedDark = modules[row][col]
        const actualDark = pixelValue === 0
        expect(actualDark, `row=${row}, col=${col}`).toBe(expectedDark)
      }
    }
  })
})
