/** @jsxImportSource react */
import { useId } from 'react'
import { createPortal } from 'react-dom'
import { NavLink } from 'react-router'
import { APP_NAV_ITEMS } from '@/frontend/components/app-nav-items'
import { Button } from '@/frontend/components/button'
import { cx } from '@/frontend/components/class-names'
import { useHeaderDrawer } from '@/frontend/lib/use-header-drawer'

type AppHeaderDrawerProps = {
  currentUserEmail: string
  onSignOut: () => void
}

// AppHeaderDrawer: 画面幅768px未満で表示される、/app配下のハンバーガーメニュー+ドロワー。
// メニュー項目はサイドメニュー(app-layout.tsx)と共有するAPP_NAV_ITEMSを使う。
// header-drawer.tsx(公開画面向け)と同じく、開閉・フォーカス管理・背景の固定等の共通処理は
// useHeaderDrawer(use-header-drawer.ts)にまとめてあり、両方から使う。
// トグルボタン自体のアイコン(ハンバーガー⇔✗)で開閉を示し、ドロワー内に別の閉じるボタンは置かない
export function AppHeaderDrawer({ currentUserEmail, onSignOut }: AppHeaderDrawerProps) {
  const { isOpen, toggleButtonRef, panelRef, toggle, close } = useHeaderDrawer({
    // 768px未満でハンバーガーメニューを表示する(global.css参照)ため、769px以上を
    // デスクトップ幅として扱う
    desktopMediaQuery: '(min-width: 769px)',
  })
  const navId = useId()

  function handleSignOutClick() {
    close()
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
        onClick={toggle}
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
          {isOpen && <div className="app-drawer__overlay" onClick={close} aria-hidden="true"></div>}

          <nav
            ref={panelRef}
            id={navId}
            aria-label="メインメニュー"
            className={cx('app-drawer__panel', isOpen && 'app-drawer__panel--open')}
            // 閉じている間(769px以上でCSS上そもそも非表示の場合も含む)は、キーボード操作・
            // 読み上げの対象から外す。閉じるアニメーションの途中でもTab等で操作できてしまう
            // ことを防ぐ
            inert={!isOpen}
          >
            <div className="app-drawer__nav">
              {APP_NAV_ITEMS.map((navItem) => (
                <NavLink
                  key={navItem.to}
                  to={navItem.to}
                  end={navItem.end}
                  className={({ isActive }) => cx('app-drawer__nav-link', isActive && 'is-active')}
                  onClick={close}
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
