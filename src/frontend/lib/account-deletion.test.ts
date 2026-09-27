import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// loadPendingDeletionRequestが依存するapiClientをモックする。vi.mockはファイル先頭に
// 巻き上げられるため、account-deletion.tsのimportより前にこの位置で呼ぶ必要がある
const { getAccountRequestsMock } = vi.hoisted(() => ({ getAccountRequestsMock: vi.fn() }))
vi.mock('@/frontend/lib/api-client', () => ({
  apiClient: { api: { v1: { 'account-requests': { $get: getAccountRequestsMock } } } },
}))

import { calculateRemainingDays, formatDateJst, loadPendingDeletionRequest } from '@/frontend/lib/account-deletion'

describe('calculateRemainingDays', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-26T00:00:00+09:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('7日後の日時に対して7を返す', () => {
    expect(calculateRemainingDays('2026-10-03T00:00:00+09:00')).toBe(7)
  })

  it('端数は切り上げる(6日と1時間後は7)', () => {
    expect(calculateRemainingDays('2026-10-02T01:00:00+09:00')).toBe(7)
  })

  it('過去の日時は0にクランプする(マイナスにならない)', () => {
    expect(calculateRemainingDays('2026-09-01T00:00:00+09:00')).toBe(0)
  })
})

describe('formatDateJst', () => {
  it('UTCのISO文字列を日本時間のYYYY/MM/DD形式に変換する', () => {
    // UTC 2026-10-02T15:00:00Z は日本時間で2026-10-03 00:00
    expect(formatDateJst('2026-10-02T15:00:00.000Z')).toBe('2026/10/03')
  })
})

describe('loadPendingDeletionRequest', () => {
  it('404の場合はnullを返す(申請なし)', async () => {
    getAccountRequestsMock.mockResolvedValueOnce({ status: 404, ok: false })
    await expect(loadPendingDeletionRequest()).resolves.toBeNull()
  })

  it('status: pendingの申請があれば、その申請を返す', async () => {
    const accountRequest = { id: 'req-1', status: 'pending', scheduledDeletionAt: '2026-10-03T00:00:00+09:00' }
    getAccountRequestsMock.mockResolvedValueOnce({ status: 200, ok: true, json: async () => accountRequest })
    await expect(loadPendingDeletionRequest()).resolves.toEqual(accountRequest)
  })

  it('直近の申請がstatus: cancelled等(pending以外)の場合はnullを返す', async () => {
    const accountRequest = { id: 'req-1', status: 'cancelled', scheduledDeletionAt: '2026-10-03T00:00:00+09:00' }
    getAccountRequestsMock.mockResolvedValueOnce({ status: 200, ok: true, json: async () => accountRequest })
    await expect(loadPendingDeletionRequest()).resolves.toBeNull()
  })

  it('404・200以外(サーバーエラー等)の場合はResponseをthrowする', async () => {
    getAccountRequestsMock.mockResolvedValueOnce({ status: 500, ok: false })
    await expect(loadPendingDeletionRequest()).rejects.toBeInstanceOf(Response)
  })
})
