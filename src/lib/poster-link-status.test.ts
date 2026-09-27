import { describe, expect, it } from 'vitest'
import { computePosterLinkStatus } from '@/lib/poster-link-status'

const activeLinkQrcode = { targetType: 'link' as const, deletedAt: null }
const rawUrlQrcode = { targetType: 'rawUrl' as const, deletedAt: null }

function makeLink(overrides: Partial<{ status: 'active' | 'expired' | 'suspended'; expiresAt: string | null; moderationStatus: 'none' | 'suspended'; deletedAt: Date | null }> = {}) {
  return {
    status: 'active' as const,
    expiresAt: null,
    moderationStatus: 'none' as const,
    deletedAt: null,
    ...overrides,
  }
}

describe('computePosterLinkStatus', () => {
  it('targetType: rawUrlの場合はnoneになる', () => {
    expect(computePosterLinkStatus(rawUrlQrcode, null)).toBe('none')
  })

  it('targetType: linkで、対象linkが有効な場合はactiveになる', () => {
    expect(computePosterLinkStatus(activeLinkQrcode, makeLink())).toBe('active')
  })

  it('expiresAtが過去のlinkはexpiredになる', () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    expect(computePosterLinkStatus(activeLinkQrcode, makeLink({ expiresAt: pastDate }))).toBe('expired')
  })

  it('statusがsuspendedのlinkはsuspendedになる', () => {
    expect(computePosterLinkStatus(activeLinkQrcode, makeLink({ status: 'suspended' }))).toBe('suspended')
  })

  it('moderationStatusがsuspendedのlinkはsuspendedになる', () => {
    expect(computePosterLinkStatus(activeLinkQrcode, makeLink({ moderationStatus: 'suspended' }))).toBe('suspended')
  })

  it('対象linkがソフトデリート済みの場合はdeletedになる', () => {
    expect(computePosterLinkStatus(activeLinkQrcode, makeLink({ deletedAt: new Date() }))).toBe('deleted')
  })

  it('対象linkの行自体が無い(leftJoinで一致しない)場合もdeletedになる', () => {
    expect(computePosterLinkStatus(activeLinkQrcode, null)).toBe('deleted')
  })

  it('QRコードがソフトデリート済みの場合はdeletedになる(targetTypeに関わらず最優先)', () => {
    expect(computePosterLinkStatus({ targetType: 'link', deletedAt: new Date() }, makeLink())).toBe('deleted')
    expect(computePosterLinkStatus({ targetType: 'rawUrl', deletedAt: new Date() }, null)).toBe('deleted')
  })

  it('QRコードの行自体が無い場合もdeletedになる', () => {
    expect(computePosterLinkStatus(null, null)).toBe('deleted')
  })
})
