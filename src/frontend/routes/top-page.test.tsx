/** @jsxImportSource react */
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { TopPage } from '@/frontend/routes/top-page'

function renderTopPage(session: unknown, isSessionPending = false) {
  const router = createMemoryRouter([
    {
      path: '/',
      element: <Outlet context={{ session, isSessionPending }} />,
      children: [{ index: true, element: <TopPage /> }],
    },
  ])

  return render(<RouterProvider router={router} />)
}

describe('TopPage', () => {
  it('掲示物の成果・対象ユーザー・登録が必要なCTAを表示する', () => {
    renderTopPage(null)

    expect(screen.getByRole('heading', { level: 1, name: 'QRコードを、店頭で使える案内に。' })).toBeTruthy()
    expect(screen.getByText('飲食店・カフェ・美容室など、小さなお店のスタッフへ')).toBeTruthy()
    expect(screen.getByText(/URLを入力するだけでQRコード付きの案内を作成。A4用紙に印刷できるPDF/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'QR付き掲示物を作る' }).getAttribute('href')).toBe('/signup')
    expect(screen.getByText('作成には無料登録が必要です')).toBeTruthy()
    expect(screen.getByText('短縮URLを発行して、アクセス数を集計')).toBeTruthy()
  })

  it('ログイン済みなら登録を勧めず、掲示物作成へ案内する', () => {
    renderTopPage({ user: { id: 'user-1' } })

    expect(screen.getByRole('link', { name: 'QR付き掲示物を作る' }).getAttribute('href')).toBe('/app/posters/new')
    expect(screen.queryByText('作成には無料登録が必要です')).toBeNull()
    expect(screen.getByText('ログイン中です。掲示物の作成を始められます。')).toBeTruthy()
  })

  it('セッション確認中はCTAの誤表示を避ける', () => {
    renderTopPage(null, true)

    expect(screen.queryByRole('link', { name: 'QR付き掲示物を作る' })).toBeNull()
  })
})
