/** @jsxImportSource react */
import { MemoryRouter } from 'react-router'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppHeaderDrawer } from '@/frontend/components/app-header-drawer'
import { triggerMediaQueryChange } from '../../../test/frontend-setup'

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

  it('閉じているときはinert属性が付き、ドロワー内のリンクにフォーカスできない', async () => {
    const user = userEvent.setup()
    renderAppHeaderDrawer()

    // getByRoleはinertを考慮したアクセシビリティツリーの計算をしない可能性があるため、
    // 属性の有無はDOMから直接確認する
    const panel = document.querySelector('nav[aria-label="メインメニュー"]')
    if (!panel) {
      throw new Error('ドロワーのnav要素が見つかりません')
    }
    expect(panel.hasAttribute('inert')).toBe(true)

    const toggleButton = screen.getByRole('button', { name: 'メニューを開く' })
    await user.click(toggleButton)
    expect(panel.hasAttribute('inert')).toBe(false)

    await user.click(screen.getByRole('button', { name: 'メニューを閉じる' }))
    expect(panel.hasAttribute('inert')).toBe(true)
  })

  it('開くと最初のメニュー項目にフォーカスが移り、Tabを繰り返してもメニューボタンとドロワーの外へフォーカスが出ない', async () => {
    const user = userEvent.setup()
    renderAppHeaderDrawer()

    const toggleButton = screen.getByRole('button', { name: 'メニューを開く' })
    await user.click(toggleButton)

    const firstLink = screen.getByRole('link', { name: '短縮URL' })
    expect(document.activeElement).toBe(firstLink)

    const secondLink = screen.getByRole('link', { name: 'アカウント設定' })
    const logoutButton = screen.getByRole('button', { name: 'ログアウト' })

    await user.tab()
    expect(document.activeElement).toBe(secondLink)

    await user.tab()
    expect(document.activeElement).toBe(logoutButton)

    // 最後の操作部品からさらにTabしても、ドロワー外へは出ずメニューボタンへ移る
    await user.tab()
    expect(document.activeElement).toBe(toggleButton)

    // メニューボタンからさらにTabすると、最初のメニュー項目に戻る(ループする)
    await user.tab()
    expect(document.activeElement).toBe(firstLink)

    // Shift+Tabでも同じ集合の中だけを逆順に循環する
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(toggleButton)
  })

  it('開いたまま画面幅が769px以上に広がると、自動的に閉じて背景のスクロール固定も解除される', async () => {
    const user = userEvent.setup()
    renderAppHeaderDrawer()

    const toggleButton = screen.getByRole('button', { name: 'メニューを開く' })
    await user.click(toggleButton)
    expect(toggleButton.getAttribute('aria-expanded')).toBe('true')
    expect(document.body.style.overflow).toBe('hidden')

    await act(async () => {
      triggerMediaQueryChange('(min-width: 769px)', true)
    })

    expect(screen.getByRole('button', { name: 'メニューを開く' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('navigation', { name: 'メインメニュー' }).className).not.toContain('app-drawer__panel--open')
    expect(document.body.style.overflow).toBe('')
  })
})
