/** @jsxImportSource react */
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink } from 'react-router'
import { APP_NAV_ITEMS } from '@/frontend/components/app-nav-items'
import { Button } from '@/frontend/components/button'
import { cx } from '@/frontend/components/class-names'

type AppHeaderDrawerProps = {
  currentUserEmail: string
  onSignOut: () => void
}

// AppHeaderDrawer: 画面幅768px未満で表示される、/app配下のハンバーガーメニュー+ドロワー。
// メニュー項目はサイドメニュー(app-layout.tsx)と共有するAPP_NAV_ITEMSを使う。
// header-drawer.tsx(公開画面向け)と同じ考え方で、開閉のトグルボタン自体で状態を示し
// (アイコンをハンバーガー⇔✗で切り替える)、ドロワー内に別の閉じるボタンは置かない。
// 2-AのDialogと同様、Escで閉じる・閉じたらメニューボタンへフォーカスを戻す動作を持つ
// (フォーカスの戻し先は常にこのトグルボタン自身のため、Dialogのように開く前の要素を
// 覚えておく必要はない)
export function AppHeaderDrawer({ currentUserEmail, onSignOut }: AppHeaderDrawerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const toggleButtonRef = useRef<HTMLButtonElement>(null)
  const navId = useId()

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      // 閉じたらメニューボタンへフォーカスを戻す
      toggleButtonRef.current?.focus()
    }
  }, [isOpen])

  function handleSignOutClick() {
    setIsOpen(false)
    onSignOut()
  }

  return (
    <>
      <button
        ref={toggleButtonRef}
        type="button"
        className="app-shell__menu-toggle"
        aria-label={isOpen ? 'メニューを閉じる' : 'メニューを開く'}
        aria-expanded={isOpen}
        aria-controls={navId}
        onClick={() => setIsOpen((current) => !current)}
      >
        {isOpen ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 6l12 12" />
            <path d="M18 6L6 18" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 7h16" />
            <path d="M4 12h16" />
            <path d="M4 17h16" />
          </svg>
        )}
      </button>

      {createPortal(
        <>
          {isOpen && <div className="app-drawer__overlay" onClick={() => setIsOpen(false)} aria-hidden="true"></div>}

          <nav
            id={navId}
            aria-label="メインメニュー"
            className={cx('app-drawer__panel', isOpen && 'app-drawer__panel--open')}
          >
            <div className="app-drawer__nav">
              {APP_NAV_ITEMS.map((navItem) => (
                <NavLink
                  key={navItem.to}
                  to={navItem.to}
                  end={navItem.end}
                  className={({ isActive }) => cx('app-drawer__nav-link', isActive && 'is-active')}
                  onClick={() => setIsOpen(false)}
                >
                  {navItem.renderIcon()}
                  {navItem.label}
                </NavLink>
              ))}
            </div>
            <div className="app-drawer__account">
              <span className="app-drawer__account-label">ログイン中</span>
              <span className="app-drawer__account-email">{currentUserEmail}</span>
              <Button variant="neutral" onClick={handleSignOutClick}>
                ログアウト
              </Button>
            </div>
          </nav>
        </>,
        document.body,
      )}
    </>
  )
}
