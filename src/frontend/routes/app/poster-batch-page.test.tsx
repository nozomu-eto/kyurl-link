/** @jsxImportSource react */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getPostersMock: vi.fn() }))
vi.mock('@/frontend/lib/api-client', () => ({
  apiClient: { api: { v1: { posters: { $get: mocks.getPostersMock } } } },
}))

import { PosterBatchPage, posterBatchLoader } from '@/frontend/routes/app/poster-batch-page'

function buildPoster(overrides: Record<string, unknown> = {}) {
  return {
    id: 'poster-1',
    title: '秋の新メニュー',
    subtitle: 'メニューはこちら',
    layoutTemplate: 'default',
    styleOptions: null,
    size: 'A6',
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

function setupPosters(items: unknown[]) {
  mocks.getPostersMock.mockResolvedValue(ok({ items, total: items.length, limit: 20, offset: 0 }))
}

function renderBatch() {
  const router = createMemoryRouter(
    [
      { path: '/app/posters', element: <p>掲示物一覧</p> },
      { path: '/app/posters/new', element: <p>新規作成</p> },
      { path: '/app/posters/batch', element: <PosterBatchPage />, loader: posterBatchLoader },
    ],
    { initialEntries: ['/app/posters/batch'] },
  )
  return render(<RouterProvider router={router} />)
}

const fetchMock = vi.fn()

beforeEach(() => {
  mocks.getPostersMock.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (url: string) => (url.includes('/batch-export') ? new Response(new Blob(['pdf']), { status: 200 }) : new Response('<svg viewBox="0 0 256 256"></svg>', { status: 200 })))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() }))
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function plus(user: ReturnType<typeof userEvent.setup>, title: string, times = 1) {
  for (let i = 0; i < times; i++) {
    await user.click(screen.getByRole('button', { name: `${title}の枚数を増やす` }))
  }
}

describe('PosterBatchPage', () => {
  it('選んだサイズの掲示物だけを並べる。A5とA6は切り替えで分けて扱う', async () => {
    const user = userEvent.setup()
    setupPosters([buildPoster(), buildPoster({ id: 'poster-2', title: 'A5の掲示物', size: 'A5' })])
    renderBatch()

    expect(await screen.findByText('秋の新メニュー')).toBeTruthy()
    expect(screen.queryByText('A5の掲示物')).toBeNull()
    expect(screen.getByText('A6の掲示物:1件')).toBeTruthy()

    await user.click(screen.getByRole('radio', { name: /A5/ }))
    expect(screen.getByText('A5の掲示物')).toBeTruthy()
    expect(screen.queryByText('秋の新メニュー')).toBeNull()
  })

  it('枚数を増減すると、合計とA4用紙の枚数・空きの案内が変わる(A6は1枚に4面)', async () => {
    const user = userEvent.setup()
    setupPosters([buildPoster(), buildPoster({ id: 'poster-2', title: 'ご予約はこちら' })])
    renderBatch()
    await screen.findByText('秋の新メニュー')

    expect(screen.getByRole('button', { name: /PDFをダウンロード/ }).hasAttribute('disabled')).toBe(true)

    await plus(user, '秋の新メニュー', 2)
    await plus(user, 'ご予約はこちら', 1)
    expect(screen.getByText(/合計/).textContent).toBe('合計 3枚 → A4用紙 1枚')
    expect(screen.getByText('1枚目に空きが1面あります。あと1枚追加できます(空きのまま印刷もできます)。')).toBeTruthy()

    await plus(user, 'ご予約はこちら', 1)
    expect(screen.getByText(/合計/).textContent).toBe('合計 4枚 → A4用紙 1枚')
    expect(screen.queryByText(/空きが/)).toBeNull()

    await plus(user, 'ご予約はこちら', 1)
    expect(screen.getByText(/合計/).textContent).toBe('合計 5枚 → A4用紙 2枚')
    expect(screen.getByText('2枚目に空きが3面あります。あと3枚追加できます(空きのまま印刷もできます)。')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'ご予約はこちらの枚数を減らす' }))
    expect(screen.getByText(/合計/).textContent).toBe('合計 4枚 → A4用紙 1枚')
  })

  it('0枚より減らせず、上限(A6は40枚)に達すると増やせなくなる', async () => {
    const user = userEvent.setup()
    setupPosters([buildPoster()])
    renderBatch()
    await screen.findByText('秋の新メニュー')

    expect(screen.getByRole('button', { name: '秋の新メニューの枚数を減らす' }).hasAttribute('disabled')).toBe(true)

    await plus(user, '秋の新メニュー', 40)
    expect(screen.getByText(/合計/).textContent).toBe('合計 40枚 → A4用紙 10枚')
    expect(screen.getByRole('button', { name: '秋の新メニューの枚数を増やす' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/上限\(A4用紙10枚\)に達しました/)).toBeTruthy()
  })

  it('A5は1枚に2面、上限は20枚', async () => {
    const user = userEvent.setup()
    setupPosters([buildPoster({ id: 'poster-5', title: 'A5の掲示物', size: 'A5' })])
    renderBatch()
    await user.click(await screen.findByRole('radio', { name: /A5/ }))

    await plus(user, 'A5の掲示物', 3)
    expect(screen.getByText(/合計/).textContent).toBe('合計 3枚 → A4用紙 2枚')
    expect(screen.getByText('2枚目に空きが1面あります。あと1枚追加できます(空きのまま印刷もできます)。')).toBeTruthy()
  })

  it('1枚目の用紙のプレビューに、選んだ掲示物が枚数ぶん並び、短縮URLの表示も出る', async () => {
    const user = userEvent.setup()
    setupPosters([buildPoster(), buildPoster({ id: 'poster-2', title: '直接指定', qrCodeId: 'qr-2', targetShortCode: null })])
    const { container } = renderBatch()
    await screen.findByText('秋の新メニュー')

    await plus(user, '秋の新メニュー', 2)
    await plus(user, '直接指定', 1)

    await waitFor(() => {
      const preview = container.querySelector('iframe[title^="A4用紙1枚目のプレビュー"]')
      expect(preview).not.toBeNull()
      const srcdoc = preview?.getAttribute('srcdoc') ?? ''
      expect(srcdoc.match(/class="a4-face"/g)).toHaveLength(3)
      expect(srcdoc.match(/class="short-url"/g)).toHaveLength(2)
      expect(srcdoc).toContain('<svg viewBox="0 0 256 256"')
    })
  })

  it('PDFのダウンロードは、サイズと掲示物ごとの枚数(一覧の並び順)をPOSTする', async () => {
    const user = userEvent.setup()
    setupPosters([buildPoster(), buildPoster({ id: 'poster-2', title: 'ご予約はこちら' })])
    renderBatch()
    await screen.findByText('秋の新メニュー')
    await plus(user, 'ご予約はこちら', 1)
    await plus(user, '秋の新メニュー', 2)

    await user.click(screen.getByRole('button', { name: 'PDFをダウンロード(A4・1枚)' }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => url === '/api/v1/posters/batch-export')
      expect(call).toBeTruthy()
      expect(call?.[1]?.method).toBe('POST')
      expect(JSON.parse(call?.[1]?.body as string)).toEqual({
        size: 'A6',
        items: [
          { posterId: 'poster-1', count: 2 },
          { posterId: 'poster-2', count: 1 },
        ],
      })
    })
  })

  it('書き出しに失敗したら、サーバーのエラー文言を表示する', async () => {
    const user = userEvent.setup()
    setupPosters([buildPoster()])
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('/batch-export') ? new Response(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'リクエストが多すぎます' } }), { status: 429 }) : new Response('<svg></svg>'),
    )
    renderBatch()
    await screen.findByText('秋の新メニュー')
    await plus(user, '秋の新メニュー')

    await user.click(screen.getByRole('button', { name: /PDFをダウンロード/ }))
    expect((await screen.findByRole('alert')).textContent).toBe('リクエストが多すぎます')
  })

  it('単体の書き出しと同じ印刷の案内を出す', async () => {
    setupPosters([buildPoster()])
    renderBatch()
    await screen.findByText('秋の新メニュー')

    expect(screen.getByText('倍率は「100%(実際のサイズ)」で印刷し、切り取り線に沿って切ってください')).toBeTruthy()
    expect(screen.getByText('貼る前に、スマートフォンのカメラで読み取れるか確認してください')).toBeTruthy()
  })

  it('リンクが期限切れの掲示物は注意書きを出し、選んで書き出すときは該当の掲示物を示す確認ダイアログを出す。「このまま書き出す」で書き出す', async () => {
    const user = userEvent.setup()
    setupPosters([buildPoster(), buildPoster({ id: 'poster-2', title: '夏のキャンペーン', linkStatus: 'expired' }), buildPoster({ id: 'poster-3', title: '停止中の掲示物', linkStatus: 'suspended' })])
    renderBatch()
    await screen.findByText('夏のキャンペーン')
    expect(screen.getByText('リンクが期限切れです')).toBeTruthy()

    await plus(user, '秋の新メニュー')
    await plus(user, '夏のキャンペーン')
    await user.click(screen.getByRole('button', { name: /PDFをダウンロード/ }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('夏のキャンペーン')).toBeTruthy()
    expect(within(dialog).getByText('リンクが期限切れです')).toBeTruthy()
    // 選んでいない掲示物や、リンクが有効な掲示物は出さない
    expect(within(dialog).queryByText('停止中の掲示物')).toBeNull()
    expect(within(dialog).queryByText('秋の新メニュー')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalledWith('/api/v1/posters/batch-export', expect.anything())

    await user.click(within(dialog).getByRole('button', { name: 'このまま書き出す' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/posters/batch-export', expect.anything()))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('リンクが使えない掲示物が0枚なら、確認なしで書き出す。ダイアログの「戻る」では書き出さない', async () => {
    const user = userEvent.setup()
    setupPosters([buildPoster(), buildPoster({ id: 'poster-2', title: '削除済みのリンク', linkStatus: 'deleted' })])
    renderBatch()
    await screen.findByText('削除済みのリンク')

    await plus(user, '秋の新メニュー')
    await user.click(screen.getByRole('button', { name: /PDFをダウンロード/ }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/posters/batch-export', expect.anything()))
    expect(screen.queryByRole('alertdialog')).toBeNull()

    fetchMock.mockClear()
    await plus(user, '削除済みのリンク')
    await user.click(screen.getByRole('button', { name: /PDFをダウンロード/ }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('リンクが削除されています')).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: '戻る' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(fetchMock).not.toHaveBeenCalledWith('/api/v1/posters/batch-export', expect.anything())
  })

  it('そのサイズの掲示物が無いときは、作成への案内を出す', async () => {
    setupPosters([buildPoster({ size: 'A5' })])
    renderBatch()
    expect(await screen.findByText(/A6の掲示物がありません/)).toBeTruthy()
  })
})
