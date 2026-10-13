/** @jsxImportSource react */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPostersMock: vi.fn(),
  postPosterMock: vi.fn(),
}))
vi.mock('@/frontend/lib/api-client', () => ({
  apiClient: {
    api: {
      v1: {
        posters: { $get: mocks.getPostersMock, $post: mocks.postPosterMock },
      },
    },
  },
}))

import { PosterListPage, posterListLoader } from '@/frontend/routes/app/poster-list-page'

function buildPoster(overrides: Record<string, unknown> = {}) {
  return {
    id: 'poster-1',
    title: '秋の新メニューはじめました',
    subtitle: 'メニューと写真はこちらから',
    layoutTemplate: 'default',
    styleOptions: null,
    size: 'A5',
    qrCodeId: 'qr-1',
    linkStatus: 'active',
    createdAt: '2026-09-26T00:00:00.000Z',
    qrCodeName: '店頭A5ポスター用',
    qrCodeCreatedAt: '2026-09-21T00:00:00.000Z',
    targetShortCode: 'Ab3xK9a',
    targetLinkId: 'link-1',
    linkExpiresAt: null,
    ...overrides,
  }
}

function ok(body: unknown) {
  return { ok: true, json: async () => body }
}

function renderList() {
  const router = createMemoryRouter(
    [
      { path: '/app/posters', element: <PosterListPage />, loader: posterListLoader },
      { path: '/app/posters/new', element: <p>新規作成</p> },
      { path: '/app/posters/:posterId', element: <p>編集画面</p> },
    ],
    { initialEntries: ['/app/posters'] },
  )
  return render(<RouterProvider router={router} />)
}

const fetchMock = vi.fn()

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (url: string) =>
    url.includes('/export') ? new Response(new Blob(['pdf']), { status: 200 }) : new Response('<svg id="qr"></svg>', { status: 200 }),
  )
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() }))
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('PosterListPage', () => {
  it('掲示物のタイトル・サイズ・使っているQRコード・作成日と、編集へのリンクを表示する', async () => {
    mocks.getPostersMock.mockResolvedValue(ok({ items: [buildPoster()], total: 1, limit: 20, offset: 0 }))
    renderList()

    expect(await screen.findByText('秋の新メニューはじめました')).toBeTruthy()
    expect(screen.getByText('QR:店頭A5ポスター用')).toBeTruthy()
    expect(screen.getByText('作成 2026/09/26')).toBeTruthy()
    expect(screen.getByRole('link', { name: '編集' }).getAttribute('href')).toBe('/app/posters/poster-1')
  })

  it('名前が未設定のQRコードは「名前なし(M/D作成)」で表示する', async () => {
    mocks.getPostersMock.mockResolvedValue(ok({ items: [buildPoster({ qrCodeName: null })], total: 1, limit: 20, offset: 0 }))
    renderList()

    expect(await screen.findByText('QR:名前なし(9/21作成)')).toBeTruthy()
  })

  it('掲示物が無いときは案内と作成ボタンを出す', async () => {
    mocks.getPostersMock.mockResolvedValue(ok({ items: [], total: 0, limit: 20, offset: 0 }))
    renderList()

    expect(await screen.findByText('まだ掲示物がありません')).toBeTruthy()
    expect(screen.getByRole('link', { name: /新しい掲示物を作成/ })).toBeTruthy()
  })

  it('キーワードでタイトルとQRコード名を絞り込める', async () => {
    const user = userEvent.setup()
    mocks.getPostersMock.mockResolvedValue(
      ok({
        items: [buildPoster(), buildPoster({ id: 'poster-2', title: 'ご予約はこちらから', qrCodeName: '予約ページ用' })],
        total: 2,
        limit: 20,
        offset: 0,
      }),
    )
    renderList()
    await screen.findByText('秋の新メニューはじめました')

    await user.type(screen.getByLabelText('キーワードで絞り込み'), '予約')
    expect(screen.queryByText('秋の新メニューはじめました')).toBeNull()
    expect(screen.getByText('ご予約はこちらから')).toBeTruthy()

    await user.clear(screen.getByLabelText('キーワードで絞り込み'))
    await user.type(screen.getByLabelText('キーワードで絞り込み'), 'zzz')
    expect(screen.getByText('条件に合う掲示物がありません。')).toBeTruthy()
  })

  it('12件ずつ表示し、「さらに表示」で続きを出す', async () => {
    const user = userEvent.setup()
    const items = Array.from({ length: 14 }, (_, index) => buildPoster({ id: `poster-${index}`, title: `掲示物${index}` }))
    mocks.getPostersMock.mockResolvedValue(ok({ items, total: 14, limit: 20, offset: 0 }))
    renderList()
    await screen.findByText('掲示物0')

    expect(screen.queryByText('掲示物12')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'さらに表示(2件)' }))
    expect(screen.getByText('掲示物13')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /さらに表示/ })).toBeNull()
  })

  it('PDFはA4用紙に並べる形式、PNGは用紙指定なしで書き出す', async () => {
    const user = userEvent.setup()
    mocks.getPostersMock.mockResolvedValue(ok({ items: [buildPoster()], total: 1, limit: 20, offset: 0 }))
    renderList()

    await user.click(await screen.findByRole('button', { name: '秋の新メニューはじめましたをPDFでダウンロード' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/posters/poster-1/export?format=pdf&paper=a4'))
    await user.click(screen.getByRole('button', { name: '秋の新メニューはじめましたをPNGでダウンロード' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/posters/poster-1/export?format=png'))
  })

  it('書き出しに失敗したら、サーバーのエラー文言を表示する', async () => {
    const user = userEvent.setup()
    mocks.getPostersMock.mockResolvedValue(ok({ items: [buildPoster()], total: 1, limit: 20, offset: 0 }))
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('/export') ? new Response(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'リクエストが多すぎます' } }), { status: 429 }) : new Response('<svg></svg>'),
    )
    renderList()

    await user.click(await screen.findByRole('button', { name: '秋の新メニューはじめましたをPDFでダウンロード' }))
    expect((await screen.findByRole('alert')).textContent).toBe('リクエストが多すぎます')
  })

  it('リンクが期限切れの掲示物は注意書きを出し、書き出す前に編集画面と同じ確認ダイアログを出す。「このまま書き出す」で書き出す', async () => {
    const user = userEvent.setup()
    mocks.getPostersMock.mockResolvedValue(
      ok({ items: [buildPoster({ linkStatus: 'expired', targetShortCode: 'Hn2cV5', linkExpiresAt: '2026-08-31T14:59:59.999Z' })], total: 1, limit: 20, offset: 0 }),
    )
    renderList()

    expect(await screen.findByText('リンクが期限切れです')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '秋の新メニューはじめましたをPDFでダウンロード' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'この掲示物のQRコードは、今は開けません' })
    expect(within(dialog).getByText('Hn2cV5')).toBeTruthy()
    expect(within(dialog).getByText('2026/08/31 に期限切れになりました')).toBeTruthy()
    expect(within(dialog).getByRole('link', { name: '有効期限を変更して再開' }).getAttribute('href')).toBe('/app/links/link-1')
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/export'))

    await user.click(within(dialog).getByRole('button', { name: 'このまま書き出す' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/posters/poster-1/export?format=pdf&paper=a4'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('リンクが停止中の掲示物は、公開設定を確認する導線つきの確認ダイアログを出す。閉じると書き出さない', async () => {
    const user = userEvent.setup()
    mocks.getPostersMock.mockResolvedValue(ok({ items: [buildPoster({ linkStatus: 'suspended' })], total: 1, limit: 20, offset: 0 }))
    renderList()

    await user.click(await screen.findByRole('button', { name: '秋の新メニューはじめましたをPNGでダウンロード' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByRole('link', { name: '公開設定を確認する' })).toBeTruthy()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/export'))
  })

  it('リンクまたはQRコードが削除された掲示物は、再開の導線なしの確認ダイアログを出す', async () => {
    const user = userEvent.setup()
    mocks.getPostersMock.mockResolvedValue(ok({ items: [buildPoster({ linkStatus: 'deleted' })], total: 1, limit: 20, offset: 0 }))
    renderList()

    expect(await screen.findByText('リンクが削除されています')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '秋の新メニューはじめましたをPDFでダウンロード' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).queryByRole('link')).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'このまま書き出す' })).toBeTruthy()
  })

  it('サムネイルには、編集画面のプレビューと同じ短縮URLの表示が出る。直接指定のQRコードでは出さない', async () => {
    mocks.getPostersMock.mockResolvedValue(
      ok({
        items: [buildPoster(), buildPoster({ id: 'poster-2', title: '直接指定', qrCodeId: 'qr-2', targetShortCode: null, targetLinkId: null })],
        total: 2,
        limit: 20,
        offset: 0,
      }),
    )
    const { container } = renderList()
    await screen.findByText('直接指定')

    // IntersectionObserverが無いテスト環境では、サムネイルがすぐ描画される
    await waitFor(() => expect(container.querySelectorAll('iframe')).toHaveLength(2))
    const [linked, direct] = Array.from(container.querySelectorAll('iframe')).map((iframe) => iframe.getAttribute('srcdoc') ?? '')
    expect(linked).toContain(`${window.location.host}/Ab3xK9a`)
    expect(linked).toContain('class="short-url"')
    expect(direct).not.toContain('class="short-url"')
  })

  it('サムネイルのQRコードは、viewBox付きのSVGで描画される(枠いっぱいに縮む)', async () => {
    mocks.getPostersMock.mockResolvedValue(ok({ items: [buildPoster()], total: 1, limit: 20, offset: 0 }))
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('/image') ? new Response('<svg viewBox="0 0 256 256" width="256" height="256"></svg>') : new Response(new Blob(['pdf'])),
    )
    const { container } = renderList()

    await waitFor(() => expect(container.querySelector('iframe')?.getAttribute('srcdoc')).toContain('<svg viewBox="0 0 256 256"'))
    expect(container.querySelector('iframe')?.getAttribute('srcdoc')).toContain('.qrcode svg')
  })

  it('複製すると、同じ内容でタイトルに「のコピー」を付けて作成し、その編集画面へ移る', async () => {
    const user = userEvent.setup()
    mocks.getPostersMock.mockResolvedValue(ok({ items: [buildPoster()], total: 1, limit: 20, offset: 0 }))
    mocks.postPosterMock.mockResolvedValue(ok(buildPoster({ id: 'poster-new' })))
    renderList()

    await user.click(await screen.findByRole('button', { name: '秋の新メニューはじめましたを複製して作る' }))

    await waitFor(() =>
      expect(mocks.postPosterMock).toHaveBeenCalledWith({
        json: { title: '秋の新メニューはじめました'.slice(0, 16) + 'のコピー', subtitle: 'メニューと写真はこちらから', size: 'A5', qrCodeId: 'qr-1' },
      }),
    )
    expect(await screen.findByText('編集画面')).toBeTruthy()
  })

  it('複製に失敗したら、サーバーのエラー文言を表示して一覧に留まる', async () => {
    const user = userEvent.setup()
    mocks.getPostersMock.mockResolvedValue(ok({ items: [buildPoster({ title: '短いタイトル' })], total: 1, limit: 20, offset: 0 }))
    mocks.postPosterMock.mockResolvedValue({ ok: false, json: async () => ({ error: { code: 'INVALID_TARGET', message: '指定されたqrcodeが存在しないか、削除されています' } }) })
    renderList()

    await user.click(await screen.findByRole('button', { name: '短いタイトルを複製して作る' }))
    const alert = await screen.findByRole('alert')
    expect(within(alert.parentElement ?? document.body).getByText('指定されたqrcodeが存在しないか、削除されています')).toBeTruthy()
    expect(screen.getByText('短いタイトル')).toBeTruthy()
  })
})
