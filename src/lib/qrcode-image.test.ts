import { describe, expect, it } from 'vitest'
import { QRCODE_IMAGE_SIZE_OPTIONS, renderQrcodePng, renderQrcodeSvg } from '@/lib/qrcode-image'
import { decodeGrayscalePixels, readPngDimensions } from '../../test/png-inspect'

describe('renderQrcodeSvg', () => {
  it('SVG文字列を返す(既存のqrcode-svgの出力のまま)', () => {
    const svg = renderQrcodeSvg('https://example.com')
    expect(svg).toContain('<svg')
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
})
