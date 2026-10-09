/** @jsxImportSource react */
import { useState } from 'react'
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
import { Toast } from '@/frontend/components/toast'

// DashboardPage・AccountSettingsPageの実際の使い方(pendingDeletionRequestの有無で
// バナーを出し分け、トーストは親側で持つ)を模した最小限のホストコンポーネント。
// 「取り消し成功でloaderが再実行され、申請がpendingでなくなってバナーが消えた後も、
// トーストは(親が持っているため)表示され続ける」という実際の画面の挙動を再現する
function DeletionBannerHost() {
  const [pending, setPending] = useState(true)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  return (
    <>
      {pending && (
        <AccountDeletionBanner
          scheduledDeletionAt="2026-10-03T00:00:00+09:00"
          onCancelled={() => {
            setToastMessage('削除を取り消しました')
            // loaderの再実行(useRevalidator)により、実際の画面では申請がpendingで
            // なくなりバナーが取り除かれる。ここではその結果を親の状態変化として再現する
            setPending(false)
          }}
        />
      )}
      {toastMessage && <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />}
    </>
  )
}

describe('AccountDeletionBanner: 日付・残り日数の表示', () => {
  // 日付・残り日数の計算はDate.now()に依存するため、この1件のみ日時を固定する。
  // fake timersはuserEvent(クリック操作)と相性が悪く固まるため、クリックを伴うテストとは
  // describeブロックを分離する
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-26T00:00:00+09:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('完全削除予定日(日本時間)と残り日数を、見出し要素(h2)で表示する', () => {
    render(<AccountDeletionBanner scheduledDeletionAt="2026-10-03T00:00:00+09:00" onCancelled={() => {}} />)

    const heading = screen.getByRole('heading', { level: 2, name: 'このアカウントは 2026/10/03 に完全に削除されます(あと7日)' })
    expect(heading).toBeTruthy()
  })
})

describe('AccountDeletionBanner: 取り消しボタンの挙動', () => {
  beforeEach(() => {
    revalidateMock.mockClear()
    cancelMock.mockReset()
  })

  it('「削除を取り消す」を押すと取り消しAPIを呼び、成功するとonCancelledを呼びloaderを再検証する', async () => {
    const onCancelled = vi.fn()
    cancelMock.mockResolvedValueOnce({ ok: true, status: 200 })
    const user = userEvent.setup()
    render(<AccountDeletionBanner scheduledDeletionAt="2026-10-03T00:00:00+09:00" onCancelled={onCancelled} />)

    await user.click(screen.getByRole('button', { name: '削除を取り消す' }))

    await waitFor(() => expect(cancelMock).toHaveBeenCalledTimes(1))
    expect(revalidateMock).toHaveBeenCalledTimes(1)
    expect(onCancelled).toHaveBeenCalledTimes(1)
  })

  it('取り消しに成功しloaderの再実行でバナー自体が消えた後も、トースト(親が持つ)は表示され続ける', async () => {
    // AccountDeletionBanner単体ではなく、実際の画面(DashboardPage・AccountSettingsPage)の
    // 構造を再現したDeletionBannerHostで検証する。バナーの中にトーストを持つ実装だと、
    // バナーが消えるのと同時にトーストも消えてしまい、この確認では検出できない
    cancelMock.mockResolvedValueOnce({ ok: true, status: 200 })
    const user = userEvent.setup()
    render(<DeletionBannerHost />)

    await user.click(screen.getByRole('button', { name: '削除を取り消す' }))

    // バナー(見出し)が消えていること
    await waitFor(() => expect(screen.queryByRole('heading', { level: 2 })).toBeNull())
    // それでもなお、トーストは表示され続けていること
    expect(screen.getByRole('status').textContent).toBe('削除を取り消しました')
  })

  it('押している間はボタンが無効になり「取り消し中…」と表示される', async () => {
    let resolveCancel!: (value: { ok: boolean; status: number }) => void
    cancelMock.mockReturnValueOnce(new Promise((resolve) => (resolveCancel = resolve)))
    const user = userEvent.setup()
    render(<AccountDeletionBanner scheduledDeletionAt="2026-10-03T00:00:00+09:00" onCancelled={() => {}} />)

    const button = screen.getByRole('button', { name: '削除を取り消す' })
    await user.click(button)

    const pendingButton = (await screen.findByRole('button', { name: '取り消し中…' })) as HTMLButtonElement
    expect(pendingButton.disabled).toBe(true)

    resolveCancel({ ok: true, status: 200 })
    await waitFor(() => expect(screen.getByRole('button', { name: '削除を取り消す' })).toBeTruthy())
  })

  it('409(猶予期間切れ)の場合、専用の文言を表示する(バナーは消えないため、この中に表示したままでよい)', async () => {
    cancelMock.mockResolvedValueOnce({ ok: false, status: 409 })
    const user = userEvent.setup()
    render(<AccountDeletionBanner scheduledDeletionAt="2026-10-03T00:00:00+09:00" onCancelled={() => {}} />)

    await user.click(screen.getByRole('button', { name: '削除を取り消す' }))

    expect(await screen.findByText('猶予期間を過ぎているため、削除を取り消せません')).toBeTruthy()
    expect(revalidateMock).not.toHaveBeenCalled()
  })

  it('その他のエラー(500等)の場合、汎用のエラー文言を表示する', async () => {
    cancelMock.mockResolvedValueOnce({ ok: false, status: 500 })
    const user = userEvent.setup()
    render(<AccountDeletionBanner scheduledDeletionAt="2026-10-03T00:00:00+09:00" onCancelled={() => {}} />)

    await user.click(screen.getByRole('button', { name: '削除を取り消す' }))

    expect(await screen.findByText('取り消しに失敗しました。時間をおいて再度お試しください')).toBeTruthy()
  })

  it('404(既に別タブ等で取り消し済み)の場合、onCancelledは呼ばずloaderの再検証だけ行う', async () => {
    const onCancelled = vi.fn()
    cancelMock.mockResolvedValueOnce({ ok: false, status: 404 })
    const user = userEvent.setup()
    render(<AccountDeletionBanner scheduledDeletionAt="2026-10-03T00:00:00+09:00" onCancelled={onCancelled} />)

    await user.click(screen.getByRole('button', { name: '削除を取り消す' }))

    await waitFor(() => expect(revalidateMock).toHaveBeenCalledTimes(1))
    expect(onCancelled).not.toHaveBeenCalled()
  })
})
