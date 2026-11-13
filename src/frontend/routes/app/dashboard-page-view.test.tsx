/** @jsxImportSource react */
import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { DashboardPage } from '@/frontend/routes/app/dashboard-page'

type LinkListItem = {
  id: string
  shortCode: string
  originalUrl: string
  expiresAt: string | null
  displayStatus: 'active' | 'expired' | 'suspended'
}

function createLinkListItem(overrides: Partial<LinkListItem> = {}): LinkListItem {
  return {
    id: 'link-1',
    shortCode: 'Ab3xK9',
    originalUrl: 'https://www.example-cafe.jp/menu/autumn-2026',
    expiresAt: null,
    displayStatus: 'active',
    ...overrides,
  }
}

// loaderの戻り値を直接差し込んでDashboardPageを描画する(loader自体はdashboard-page.test.ts で検証済み)
function renderDashboardPage(linkListItems: LinkListItem[]) {
  const router = createMemoryRouter(
    [{ path: '/', element: <DashboardPage />, loader: () => ({ linkListItems, pendingDeletionRequest: null }) }],
    { initialEntries: ['/'] },
  )
  return render(<RouterProvider router={router} />)
}

describe('DashboardPage', () => {
  it('0件の場合も目的別の作成導線と短縮URLの空状態を表示する', async () => {
    renderDashboardPage([])

    expect(await screen.findByRole('heading', { name: 'ホーム' })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'まだ短縮URLがありません' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '何を作りますか？' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /QRコードを作る/ }).getAttribute('href')).toBe('/app/qrcodes/new')
    expect(screen.getByRole('link', { name: /短縮URLを作る/ }).getAttribute('href')).toBe('/app/links/new?intent=link')
    expect(screen.getByRole('link', { name: /掲示物を作る/ }).getAttribute('href')).toBe('/app/posters/new')
    expect(screen.getByRole('link', { name: '掲示物一覧' }).getAttribute('href')).toBe('/app/posters')
    expect(screen.getByRole('heading', { name: '短縮URLを管理' })).toBeTruthy()
    expect(screen.getByText('STEP 3')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('データがある場合も用途別導線を表示し、短縮URL一覧の管理機能を保つ', async () => {
    renderDashboardPage([
      createLinkListItem({ id: 'link-1', shortCode: 'Ab3xK9' }),
      // statusがactiveでも、期限切れならdisplayStatusのexpiredが表示される想定の入力
      createLinkListItem({ id: 'link-2', shortCode: 'Hn2cV5', displayStatus: 'expired', expiresAt: '2026-08-31T14:59:59.999Z' }),
    ])

    expect(await screen.findByText('全2件')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'ホーム' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '何を作りますか？' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /QRコードを作る/ }).getAttribute('href')).toBe('/app/qrcodes/new')
    expect(screen.getByRole('link', { name: /短縮URLを作る/ }).getAttribute('href')).toBe('/app/links/new?intent=link')
    expect(screen.getByRole('link', { name: /掲示物を作る/ }).getAttribute('href')).toBe('/app/posters/new')
    expect(screen.getByRole('link', { name: '掲示物一覧' }).getAttribute('href')).toBe('/app/posters')
    expect(screen.getByRole('heading', { name: '短縮URLを管理' })).toBeTruthy()
    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)

    const expiredRow = rows[1]
    expect(within(expiredRow).getByText('期限切れ')).toBeTruthy()
    // 2026-08-31T23:59:59.999+09:00 は日本時間で8/31
    expect(within(expiredRow).getByText('2026/08/31')).toBeTruthy()
    expect(within(expiredRow).getByRole('button', { name: `${window.location.origin}/Hn2cV5 をコピー` })).toBeTruthy()
    expect(within(expiredRow).getByRole('link', { name: '詳細' }).getAttribute('href')).toBe('/app/links/link-2')

    const activeRow = rows[0]
    expect(within(activeRow).getByText('有効')).toBeTruthy()
    expect(within(activeRow).getByText('無期限')).toBeTruthy()
  })

  it('スマホ用のカードにも同じ件数・コピーボタン・詳細リンクがある', async () => {
    renderDashboardPage([createLinkListItem({ id: 'link-1' }), createLinkListItem({ id: 'link-2', shortCode: 'Qm7pR2' })])

    const cards = (await screen.findAllByRole('listitem')).filter((item) => item.className.includes('link-card'))
    expect(cards).toHaveLength(2)
    expect(within(cards[1]).getByRole('button', { name: `${window.location.origin}/Qm7pR2 をコピー` })).toBeTruthy()
    expect(within(cards[1]).getByRole('link', { name: '詳細' }).getAttribute('href')).toBe('/app/links/link-2')
  })
})
