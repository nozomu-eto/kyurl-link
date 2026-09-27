/** @jsxImportSource react */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// useRevalidatorはReact Routerのデータルーター機能に依存するため、テストでは
// revalidate呼び出しの有無だけを検証できるようモックする(react-router自体の他のエクスポート
// はそのまま使う)
const { revalidateMock } = vi.hoisted(() => ({ revalidateMock: vi.fn() }))
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return { ...actual, useRevalidator: () => ({ revalidate: revalidateMock, state: 'idle' }) }
})

// POST /api/v1/account-requests/cancelの呼び出しをモックする
const { cancelMock } = vi.hoisted(() => ({ cancelMock: vi.fn() }))
vi.mock('@/frontend/lib/api-client', () => ({
  apiClient: { api: { v1: { 'account-requests': { cancel: { $post: cancelMock } } } } },
}))

import { AccountDeletionBanner } from '@/frontend/components/account-deletion-banner'

describe('AccountDeletionBanner: 日付・残り日数の表示', () => {
  // 日付・残り日数の計算はDate.now()に依存するため、この2件のみ日時を固定する。
  // fake timersはuserEvent(クリック操作)と相性が悪く固まるため、クリックを伴うテストとは
  // describeブロックを分離する
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-26T00:00:00+09:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('完全削除予定日(日本時間)と残り日数を表示する', () => {
    render(<AccountDeletionBanner scheduledDeletionAt="2026-10-03T00:00:00+09:00" />)

    expect(screen.getByText('このアカウントは 2026/10/03 に完全に削除されます(あと7日)')).toBeTruthy()
  })
})

describe('AccountDeletionBanner: 取り消しボタンの挙動', () => {
  beforeEach(() => {
    revalidateMock.mockClear()
    cancelMock.mockReset()
  })

  it('「削除を取り消す」を押すと取り消しAPIを呼び、成功するとトースト表示とloaderの再検証(revalidate)を行う', async () => {
    cancelMock.mockResolvedValueOnce({ ok: true, status: 200 })
    const user = userEvent.setup()
    render(<AccountDeletionBanner scheduledDeletionAt="2026-10-03T00:00:00+09:00" />)

    await user.click(screen.getByRole('button', { name: '削除を取り消す' }))

    await waitFor(() => expect(cancelMock).toHaveBeenCalledTimes(1))
    expect(revalidateMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status').textContent).toBe('削除を取り消しました')
  })

  it('押している間はボタンが無効になり「取り消し中…」と表示される', async () => {
    let resolveCancel!: (value: { ok: boolean; status: number }) => void
    cancelMock.mockReturnValueOnce(new Promise((resolve) => (resolveCancel = resolve)))
    const user = userEvent.setup()
    render(<AccountDeletionBanner scheduledDeletionAt="2026-10-03T00:00:00+09:00" />)

    const button = screen.getByRole('button', { name: '削除を取り消す' })
    await user.click(button)

    const pendingButton = (await screen.findByRole('button', { name: '取り消し中…' })) as HTMLButtonElement
    expect(pendingButton.disabled).toBe(true)

    resolveCancel({ ok: true, status: 200 })
    await waitFor(() => expect(screen.getByRole('button', { name: '削除を取り消す' })).toBeTruthy())
  })

  it('409(猶予期間切れ)の場合、専用の文言を表示する', async () => {
    cancelMock.mockResolvedValueOnce({ ok: false, status: 409 })
    const user = userEvent.setup()
    render(<AccountDeletionBanner scheduledDeletionAt="2026-10-03T00:00:00+09:00" />)

    await user.click(screen.getByRole('button', { name: '削除を取り消す' }))

    expect(await screen.findByText('猶予期間を過ぎているため、削除を取り消せません')).toBeTruthy()
    expect(revalidateMock).not.toHaveBeenCalled()
  })

  it('その他のエラー(500等)の場合、汎用のエラー文言を表示する', async () => {
    cancelMock.mockResolvedValueOnce({ ok: false, status: 500 })
    const user = userEvent.setup()
    render(<AccountDeletionBanner scheduledDeletionAt="2026-10-03T00:00:00+09:00" />)

    await user.click(screen.getByRole('button', { name: '削除を取り消す' }))

    expect(await screen.findByText('取り消しに失敗しました。時間をおいて再度お試しください')).toBeTruthy()
  })

  it('404(既に別タブ等で取り消し済み)の場合、エラー表示はせずloaderを再検証する', async () => {
    cancelMock.mockResolvedValueOnce({ ok: false, status: 404 })
    const user = userEvent.setup()
    render(<AccountDeletionBanner scheduledDeletionAt="2026-10-03T00:00:00+09:00" />)

    await user.click(screen.getByRole('button', { name: '削除を取り消す' }))

    await waitFor(() => expect(revalidateMock).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('status')).toBeNull()
  })
})
