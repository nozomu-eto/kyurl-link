/** @jsxImportSource react */
import { MemoryRouter } from 'react-router'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { HeaderDrawer } from '@/frontend/components/header-drawer'
import { triggerMediaQueryChange } from '../../../test/frontend-setup'

function renderHeaderDrawer() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <HeaderDrawer isLoggedIn={false} />
    </MemoryRouter>,
  )
}

describe('HeaderDrawer', () => {
  it('メニューボタンをクリックすると開閉し、aria-expanded・ラベル・ドロワーの開閉クラスが切り替わる', async () => {
    const user = userEvent.setup()
    renderHeaderDrawer()

    const toggleButton = screen.getByRole('button', { name: 'メニューを開く' })
    expect(toggleButton.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('navigation', { name: 'メインメニュー' }).className).not.toContain('header-drawer__panel--open')

    await user.click(toggleButton)

    expect(toggleButton.getAttribute('aria-expanded')).toBe('true')
    // ボタン自身がハンバーガー⇔✗として開閉を示すため、同じボタンのラベルが切り替わる
    expect(screen.getByRole('button', { name: 'メニューを閉じる' })).toBe(toggleButton)
    expect(screen.getByRole('navigation', { name: 'メインメニュー' }).className).toContain('header-drawer__panel--open')

    await user.click(toggleButton)

    expect(toggleButton.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('button', { name: 'メニューを開く' })).toBe(toggleButton)
    expect(screen.getByRole('navigation', { name: 'メインメニュー' }).className).not.toContain('header-drawer__panel--open')
  })

  it('開いている状態でEscキーを押すと閉じ、メニューボタンへフォーカスが戻る', async () => {
    const user = userEvent.setup()
    renderHeaderDrawer()

    const toggleButton = screen.getByRole('button', { name: 'メニューを開く' })
    await user.click(toggleButton)
    expect(toggleButton.getAttribute('aria-expanded')).toBe('true')

    await user.keyboard('{Escape}')

    expect(screen.getByRole('button', { name: 'メニューを開く' }).getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(toggleButton)
  })

  it('閉じているときはinert属性が付き、ドロワー内のリンクにフォーカスできない', async () => {
    const user = userEvent.setup()
    renderHeaderDrawer()

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
    renderHeaderDrawer()

    const toggleButton = screen.getByRole('button', { name: 'メニューを開く' })
    await user.click(toggleButton)

    const loginLink = screen.getByRole('link', { name: 'ログイン' })
    expect(document.activeElement).toBe(loginLink)

    const signupLink = screen.getByRole('link', { name: '新規登録' })

    await user.tab()
    expect(document.activeElement).toBe(signupLink)

    // 最後の操作部品からさらにTabしても、ドロワー外へは出ずメニューボタンへ移る
    await user.tab()
    expect(document.activeElement).toBe(toggleButton)

    // メニューボタンからさらにTabすると、最初のメニュー項目に戻る(ループする)
    await user.tab()
    expect(document.activeElement).toBe(loginLink)

    // Shift+Tabでも同じ集合の中だけを逆順に循環する
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(toggleButton)
  })

  it('開いたまま画面幅が1025px以上に広がると、自動的に閉じて背景のスクロール固定も解除される', async () => {
    const user = userEvent.setup()
    renderHeaderDrawer()

    const toggleButton = screen.getByRole('button', { name: 'メニューを開く' })
    await user.click(toggleButton)
    expect(toggleButton.getAttribute('aria-expanded')).toBe('true')
    expect(document.body.style.overflow).toBe('hidden')

    await act(async () => {
      triggerMediaQueryChange('(min-width: 1025px)', true)
    })

    expect(screen.getByRole('button', { name: 'メニューを開く' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('navigation', { name: 'メインメニュー' }).className).not.toContain('header-drawer__panel--open')
    expect(document.body.style.overflow).toBe('')
  })
})
