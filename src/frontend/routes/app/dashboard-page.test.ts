import { describe, expect, it, vi } from 'vitest'

const { getLinksMock } = vi.hoisted(() => ({ getLinksMock: vi.fn() }))
vi.mock('@/frontend/lib/api-client', () => ({
  apiClient: { api: { v1: { links: { $get: getLinksMock } } } },
}))

const { loadPendingDeletionRequestMock } = vi.hoisted(() => ({ loadPendingDeletionRequestMock: vi.fn() }))
vi.mock('@/frontend/lib/account-deletion', () => ({
  loadPendingDeletionRequest: loadPendingDeletionRequestMock,
}))

import { dashboardLoader } from '@/frontend/routes/app/dashboard-page'

describe('dashboardLoader', () => {
  it('申請状況の取得(loadPendingDeletionRequest)が失敗しても、短縮URL一覧は返す(バナーを出さないだけにする)', async () => {
    const linkListItems = [{ id: 'link-1' }]
    getLinksMock.mockResolvedValueOnce({ ok: true, json: async () => ({ items: linkListItems }) })
    loadPendingDeletionRequestMock.mockRejectedValueOnce(new Response('error', { status: 500 }))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await dashboardLoader()

    expect(result).toEqual({ linkListItems, pendingDeletionRequest: null })
    expect(errorSpy).toHaveBeenCalledTimes(1)

    errorSpy.mockRestore()
  })

  it('申請状況の取得に成功した場合は、その値をそのまま返す', async () => {
    const linkListItems = [{ id: 'link-1' }]
    const pendingDeletionRequest = { id: 'req-1', status: 'pending', scheduledDeletionAt: '2026-10-03T00:00:00+09:00' }
    getLinksMock.mockResolvedValueOnce({ ok: true, json: async () => ({ items: linkListItems }) })
    loadPendingDeletionRequestMock.mockResolvedValueOnce(pendingDeletionRequest)

    const result = await dashboardLoader()

    expect(result).toEqual({ linkListItems, pendingDeletionRequest })
  })

  it('短縮URL一覧の取得自体に失敗した場合は、これまでどおりResponseをthrowする', async () => {
    getLinksMock.mockResolvedValueOnce({ ok: false, status: 500 })
    loadPendingDeletionRequestMock.mockResolvedValueOnce(null)

    await expect(dashboardLoader()).rejects.toBeInstanceOf(Response)
  })
})
