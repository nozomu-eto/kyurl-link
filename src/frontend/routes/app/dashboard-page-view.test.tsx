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
  it('0件の場合は案内・最初の作成ボタン・3ステップを表示し、一覧は表示しない', async () => {
    renderDashboardPage([])

    expect(await screen.findByRole('heading', { name: 'まだ短縮URLがありません' })).toBeTruthy()
    const createLink = screen.getByRole('link', { name: '最初の短縮URLを作成' })
    expect(createLink.getAttribute('href')).toBe('/app/links/new')
    expect(screen.getByText('STEP 3')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    // 0件のときは見出し横の作成ボタンを出さない(案内内のボタンに一本化する)
    expect(screen.queryByRole('link', { name: '新しい短縮URLを作成' })).toBeNull()
  })

  it('一覧には全行にコピーボタンと詳細リンクがあり、状態はdisplayStatusのバッジで表示する', async () => {
    renderDashboardPage([
      createLinkListItem({ id: 'link-1', shortCode: 'Ab3xK9' }),
      // statusがactiveでも、期限切れならdisplayStatusのexpiredが表示される想定の入力
      createLinkListItem({ id: 'link-2', shortCode: 'Hn2cV5', displayStatus: 'expired', expiresAt: '2026-08-31T14:59:59.999Z' }),
    ])

    expect(await screen.findByText('全2件')).toBeTruthy()
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
