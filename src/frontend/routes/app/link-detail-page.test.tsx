/** @jsxImportSource react */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getLinkMock: vi.fn(),
  patchLinkMock: vi.fn(),
  deleteLinkMock: vi.fn(),
  getClicksMock: vi.fn(),
  getQrcodesMock: vi.fn(),
}))
vi.mock('@/frontend/lib/api-client', () => ({
  apiClient: {
    api: {
      v1: {
        links: { ':id': { $get: mocks.getLinkMock, $patch: mocks.patchLinkMock, $delete: mocks.deleteLinkMock, clicks: { $get: mocks.getClicksMock } } },
        qrcodes: { $get: mocks.getQrcodesMock },
      },
    },
  },
}))

import { LinkDetailPage, linkDetailLoader } from '@/frontend/routes/app/link-detail-page'

type LinkOverrides = Partial<{
  status: 'active' | 'expired' | 'suspended'
  displayStatus: 'active' | 'expired' | 'suspended'
  moderationStatus: 'none' | 'suspended'
  expiresAt: string | null
}>

function buildLink(overrides: LinkOverrides = {}) {
  return {
    id: 'link-1',
    shortCode: 'Ab3xK9',
    originalUrl: 'https://example.com/menu',
    status: 'active',
    displayStatus: 'active',
    moderationStatus: 'none',
    expiresAt: null,
    ...overrides,
  }
}

function ok(body: unknown) {
  return { ok: true, json: async () => body }
}

function setupApi({ link = buildLink(), qrcodes = [] as unknown[] } = {}) {
  mocks.getLinkMock.mockResolvedValue(ok(link))
  mocks.getClicksMock.mockResolvedValue(ok({ totalClicks: 145, dailyClicks: [{ day: '2026-09-25', clicks: 145 }] }))
  mocks.getQrcodesMock.mockResolvedValue(ok({ items: qrcodes }))
  mocks.patchLinkMock.mockResolvedValue(ok(link))
  mocks.deleteLinkMock.mockResolvedValue({ ok: true })
}

function renderLinkDetailPage(initialEntry = '/app/links/link-1') {
  const router = createMemoryRouter(
    [
      { path: '/app', element: <p>ダッシュボード</p> },
      { path: '/app/links/:linkId', element: <LinkDetailPage />, loader: linkDetailLoader },
    ],
    { initialEntries: [initialEntry] },
  )
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
})

describe('LinkDetailPage', () => {
  it('公開スイッチはstatus(保存値)で決まり、状態バッジはdisplayStatusを表示する', async () => {
    // 期限切れ: statusはactiveのままだがdisplayStatusはexpired
    setupApi({ link: buildLink({ displayStatus: 'expired', expiresAt: '2026-08-31T14:59:59.999Z' }) })
    renderLinkDetailPage()

    expect(await screen.findByText('期限切れ')).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'リダイレクトを有効にする' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('2026/08/31')).toBeTruthy()
    expect(screen.getByText(/有効期限を過ぎているため、現在は「期限切れ」です/)).toBeTruthy()
  })

  it('スイッチを切り替えると、statusをsuspendedで保存する', async () => {
    const user = userEvent.setup()
    setupApi()
    renderLinkDetailPage()

    await user.click(await screen.findByRole('switch', { name: 'リダイレクトを有効にする' }))

    expect(mocks.patchLinkMock).toHaveBeenCalledWith({ param: { id: 'link-1' }, json: { status: 'suspended' } })
    expect(await screen.findByText('公開をオフにしました')).toBeTruthy()
  })

  it('運営により停止されている場合は、スイッチを操作できない', async () => {
    setupApi({ link: buildLink({ status: 'suspended', displayStatus: 'suspended', moderationStatus: 'suspended' }) })
    renderLinkDetailPage()

    const toggle = (await screen.findByRole('switch', { name: 'リダイレクトを有効にする' })) as HTMLButtonElement
    expect(toggle.disabled).toBe(true)
    expect(screen.getByText('運営により停止されているため、変更できません。')).toBeTruthy()
  })

  it('有効期限の変更: 日付を指定すると、その日の23:59(日本時間)で保存する', async () => {
    const user = userEvent.setup()
    setupApi()
    renderLinkDetailPage()

    await user.click(await screen.findByRole('button', { name: '変更' }))
    const dialog = screen.getByRole('dialog', { name: '有効期限の変更' })
    await user.type(within(dialog).getByLabelText('日付を指定'), '2099-12-31')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(mocks.patchLinkMock).toHaveBeenCalledWith({ param: { id: 'link-1' }, json: { expiresAt: '2099-12-31T14:59:59.999Z' } }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('有効期限の変更: 期限切れのときは「保存して再開する」で、無期限を選ぶとnullで保存する', async () => {
    const user = userEvent.setup()
    setupApi({ link: buildLink({ displayStatus: 'expired', expiresAt: '2026-08-31T14:59:59.999Z' }) })
    renderLinkDetailPage()

    await user.click(await screen.findByRole('button', { name: '変更' }))
    const dialog = screen.getByRole('dialog', { name: '有効期限の変更' })
    expect(within(dialog).getByText(/印刷済みのQRコードからまた開けるようになります/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: '無期限' }))
    await user.click(within(dialog).getByRole('button', { name: '保存して再開する' }))

    await waitFor(() => expect(mocks.patchLinkMock).toHaveBeenCalledWith({ param: { id: 'link-1' }, json: { expiresAt: null } }))
  })

  it('有効期限の変更に失敗した場合は、ダイアログを閉じずにエラーを表示する', async () => {
    const user = userEvent.setup()
    setupApi()
    mocks.patchLinkMock.mockResolvedValue({ ok: false, json: async () => ({ error: { code: 'VALIDATION_ERROR', message: '有効期限には未来の日時を指定してください' } }) })
    renderLinkDetailPage()

    await user.click(await screen.findByRole('button', { name: '変更' }))
    const dialog = screen.getByRole('dialog', { name: '有効期限の変更' })
    await user.type(within(dialog).getByLabelText('日付を指定'), '2099-12-31')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    expect(await within(dialog).findByText('有効期限には未来の日時を指定してください')).toBeTruthy()
  })

  it('削除: 確認ダイアログで影響を案内し、「削除する」でDELETEしてダッシュボードへ戻る', async () => {
    const user = userEvent.setup()
    setupApi({ qrcodes: [{ id: 'qr-1', targetType: 'link', targetId: 'link-1', targetUrl: null, name: '店頭A5ポスター用' }] })
    renderLinkDetailPage()

    await user.click(await screen.findByRole('button', { name: 'この短縮URLを削除' }))
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText(/印刷済みのQRコード\(1件\)や掲示物/)).toBeTruthy()
    expect(mocks.deleteLinkMock).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: '削除する' }))

    await waitFor(() => expect(mocks.deleteLinkMock).toHaveBeenCalledWith({ param: { id: 'link-1' } }))
    expect(await screen.findByText('ダッシュボード')).toBeTruthy()
  })

  it('削除の確認ダイアログから「公開をオフ」にすると、削除せずstatusをsuspendedにする', async () => {
    const user = userEvent.setup()
    setupApi()
    renderLinkDetailPage()

    await user.click(await screen.findByRole('button', { name: 'この短縮URLを削除' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '公開をオフ' }))

    await waitFor(() => expect(mocks.patchLinkMock).toHaveBeenCalledWith({ param: { id: 'link-1' }, json: { status: 'suspended' } }))
    expect(mocks.deleteLinkMock).not.toHaveBeenCalled()
  })

  it('クリック統計は初期30日で、7日に切り替えるとdays=7で取得し直す', async () => {
    const user = userEvent.setup()
    setupApi()
    renderLinkDetailPage()

    expect(await screen.findByText('直近30日の合計')).toBeTruthy()
    expect(mocks.getClicksMock).toHaveBeenLastCalledWith({ param: { id: 'link-1' }, query: { days: '30' } })
    expect(screen.getByRole('button', { name: '30日' }).getAttribute('aria-pressed')).toBe('true')

    await user.click(screen.getByRole('button', { name: '7日' }))

    expect(await screen.findByText('直近7日の合計')).toBeTruthy()
    expect(mocks.getClicksMock).toHaveBeenLastCalledWith({ param: { id: 'link-1' }, query: { days: '7' } })
    expect(screen.getByText('145')).toBeTruthy()
    expect(screen.getByText('20.7')).toBeTruthy()
  })

  it('紐づくQRコードの件数と、名前・PNG/SVGダウンロード・掲示物作成のリンクを表示する', async () => {
    setupApi({
      qrcodes: [
        { id: 'qr-1', targetType: 'link', targetId: 'link-1', targetUrl: null, name: '店頭A5ポスター用' },
        { id: 'qr-2', targetType: 'link', targetId: 'link-1', targetUrl: null, name: null },
        { id: 'qr-3', targetType: 'link', targetId: 'other-link', targetUrl: null, name: '別のリンク' },
      ],
    })
    renderLinkDetailPage()

    expect(await screen.findByRole('heading', { name: '紐づくQRコード(2件)' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '店頭A5ポスター用をPNGでダウンロード' }).getAttribute('href')).toBe('/api/v1/qrcodes/qr-1/image?format=png&size=1024')
    expect(screen.getByRole('link', { name: '名前なしをSVGでダウンロード' }).getAttribute('href')).toBe('/api/v1/qrcodes/qr-2/image?format=svg')
    expect(screen.getAllByRole('link', { name: '掲示物を作成' })[0].getAttribute('href')).toBe('/app/qrcodes/qr-1/posters/new')
    expect(screen.queryByText('別のリンク')).toBeNull()
  })
})
