import { describe, expect, it } from 'vitest'
import { computeLinkDisplayStatus } from '@/lib/link-status'

// テストのたびに書き換えたいフィールドだけ指定できるよう、既定値(有効なlink)を用意する
function makeRecord(overrides: Partial<{ status: 'active' | 'expired' | 'suspended'; expiresAt: string | null; moderationStatus: 'none' | 'suspended' }> = {}) {
  return {
    status: 'active' as const,
    expiresAt: null,
    moderationStatus: 'none' as const,
    ...overrides,
  }
}

describe('computeLinkDisplayStatus', () => {
  it('status: active、expiresAt: null(無期限)の場合はactiveになる', () => {
    expect(computeLinkDisplayStatus(makeRecord())).toBe('active')
  })

  it('expiresAtが未来の場合はactiveになる', () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    expect(computeLinkDisplayStatus(makeRecord({ expiresAt: futureDate }))).toBe('active')
  })

  it('expiresAtが過去の場合はexpiredになる(statusがactiveのままでも)', () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    expect(computeLinkDisplayStatus(makeRecord({ status: 'active', expiresAt: pastDate }))).toBe('expired')
  })

  it('statusがsuspendedの場合はsuspendedになる(expiresAtに関わらず)', () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    expect(computeLinkDisplayStatus(makeRecord({ status: 'suspended', expiresAt: pastDate }))).toBe('suspended')
    expect(computeLinkDisplayStatus(makeRecord({ status: 'suspended', expiresAt: null }))).toBe('suspended')
  })

  it('moderationStatusがsuspendedの場合はsuspendedになる(statusやexpiresAtに関わらず最優先)', () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    expect(computeLinkDisplayStatus(makeRecord({ moderationStatus: 'suspended' }))).toBe('suspended')
    expect(computeLinkDisplayStatus(makeRecord({ moderationStatus: 'suspended', status: 'active', expiresAt: futureDate }))).toBe('suspended')
  })

  it('DB保存値のstatusが直接expiredになっていても、expiresAtが未来・nullならactiveになる(status: expiredは参照しない)', () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    expect(computeLinkDisplayStatus(makeRecord({ status: 'expired', expiresAt: futureDate }))).toBe('active')
    expect(computeLinkDisplayStatus(makeRecord({ status: 'expired', expiresAt: null }))).toBe('active')
  })
})
