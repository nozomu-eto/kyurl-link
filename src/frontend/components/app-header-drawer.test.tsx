/** @jsxImportSource react */
import { MemoryRouter } from 'react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppHeaderDrawer } from '@/frontend/components/app-header-drawer'

function renderAppHeaderDrawer() {
  return render(
    <MemoryRouter initialEntries={['/app']}>
      <AppHeaderDrawer currentUserEmail="owner@example-cafe.jp" onSignOut={vi.fn()} />
    </MemoryRouter>,
  )
}

describe('AppHeaderDrawer', () => {
  it('メニューボタンをクリックすると開閉し、aria-expanded・ラベル・ドロワーの開閉クラスが切り替わる', async () => {
    const user = userEvent.setup()
    renderAppHeaderDrawer()

    const toggleButton = screen.getByRole('button', { name: 'メニューを開く' })
    expect(toggleButton.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('navigation', { name: 'メインメニュー' }).className).not.toContain('app-drawer__panel--open')

    await user.click(toggleButton)

    expect(toggleButton.getAttribute('aria-expanded')).toBe('true')
    // ボタン自身がハンバーガー⇔✗として開閉を示すため、同じボタンのラベルが切り替わる
    expect(screen.getByRole('button', { name: 'メニューを閉じる' })).toBe(toggleButton)
    expect(screen.getByRole('navigation', { name: 'メインメニュー' }).className).toContain('app-drawer__panel--open')

    await user.click(toggleButton)

    expect(toggleButton.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('button', { name: 'メニューを開く' })).toBe(toggleButton)
    expect(screen.getByRole('navigation', { name: 'メインメニュー' }).className).not.toContain('app-drawer__panel--open')
  })

  it('開いている状態でEscキーを押すと閉じ、メニューボタンへフォーカスが戻る', async () => {
    const user = userEvent.setup()
    renderAppHeaderDrawer()

    const toggleButton = screen.getByRole('button', { name: 'メニューを開く' })
    await user.click(toggleButton)
    expect(toggleButton.getAttribute('aria-expanded')).toBe('true')

    await user.keyboard('{Escape}')

    expect(screen.getByRole('button', { name: 'メニューを開く' }).getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(toggleButton)
  })
})
