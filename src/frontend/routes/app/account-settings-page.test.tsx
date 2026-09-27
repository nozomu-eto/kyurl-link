/** @jsxImportSource react */
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

// useCancelAccountDeletion(取り消し処理そのもの)はaccount-deletion-banner.test.tsxで
// 別途検証済みのため、ここでは呼び出し自体をモックし、この画面の表示切り替えのみを検証する
vi.mock('@/frontend/lib/use-cancel-account-deletion', () => ({
  useCancelAccountDeletion: () => ({ cancel: vi.fn(), isCancelling: false }),
}))

import { AccountSettingsPage } from '@/frontend/routes/app/account-settings-page'

type CurrentUser = { email: string; emailVerified: boolean }
type PendingDeletionRequest = {
  id: string
  status: 'pending'
  scheduledDeletionAt: string
  requestedAt: string
} | null

// AppLayoutのOutlet context(currentUser)を模した最小限のラッパー。
// AccountSettingsPage自体はuseOutletContextでcurrentUserを受け取る前提のため、
// テストでもOutletを経由してcontextを渡す必要がある
function renderAccountSettingsPage(pendingDeletionRequest: PendingDeletionRequest, currentUser: CurrentUser) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Outlet context={{ currentUser }} />,
        children: [{ index: true, element: <AccountSettingsPage />, loader: () => ({ pendingDeletionRequest }) }],
      },
    ],
    { initialEntries: ['/'] },
  )
  return render(<RouterProvider router={router} />)
}

describe('AccountSettingsPage', () => {
  it('申請なしの場合、削除ボタン(danger-outline)と通常の案内文を表示する', async () => {
    renderAccountSettingsPage(null, { email: 'owner@example.com', emailVerified: true })

    expect(await screen.findByText(/7日間の猶予期間中は、この画面から削除を取り消せます/)).toBeTruthy()
    const deleteButton = screen.getByRole('link', { name: 'アカウントを削除する' })
    expect(deleteButton.className).toContain('button--danger-outline')
  })

  it('申請中の場合、完全削除日・申請日・取り消しボタンを表示し、削除ボタンは表示しない', async () => {
    renderAccountSettingsPage(
      {
        id: 'req-1',
        status: 'pending',
        scheduledDeletionAt: '2026-10-03T00:00:00+09:00',
        requestedAt: '2026-09-26T00:00:00+09:00',
      },
      { email: 'owner@example.com', emailVerified: true },
    )

    expect(await screen.findByText('削除予定')).toBeTruthy()
    expect(screen.getByText(/2026\/10\/03 に完全削除/)).toBeTruthy()
    expect(screen.getByText(/申請日:2026\/09\/26/)).toBeTruthy()
    // AccountDeletionBanner(上部の常設バナー)にも同名のボタンがあるため、
    // 「アカウントの削除」欄と合わせて2つ表示されることを確認する
    expect(screen.getAllByRole('button', { name: '削除を取り消す' })).toHaveLength(2)
    expect(screen.queryByRole('link', { name: 'アカウントを削除する' })).toBeNull()
  })
})
