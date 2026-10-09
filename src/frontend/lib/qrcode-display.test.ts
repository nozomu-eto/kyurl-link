import { describe, expect, it } from 'vitest'
import { getQrcodeDisplayName, getQrcodeImageUrl } from '@/frontend/lib/qrcode-display'

describe('qrcode-display', () => {
  it('getQrcodeDisplayName: 名前があればそのまま、無ければ日本時間の作成日付きの「名前なし」', () => {
    expect(getQrcodeDisplayName({ name: '店頭A5ポスター用', createdAt: '2026-09-21T00:00:00.000Z' })).toBe('店頭A5ポスター用')
    // 2026-09-21T16:00:00Z は日本時間の9/22
    expect(getQrcodeDisplayName({ name: null, createdAt: '2026-09-21T16:00:00.000Z' })).toBe('名前なし(9/22作成)')
  })

  it('getQrcodeImageUrl: 形式とサイズからURLを組み立てる', () => {
    expect(getQrcodeImageUrl('qr-1')).toBe('/api/v1/qrcodes/qr-1/image')
    expect(getQrcodeImageUrl('qr-1', { format: 'png', size: 2048 })).toBe('/api/v1/qrcodes/qr-1/image?format=png&size=2048')
    expect(getQrcodeImageUrl('qr-1', { format: 'svg' })).toBe('/api/v1/qrcodes/qr-1/image?format=svg')
  })
})
