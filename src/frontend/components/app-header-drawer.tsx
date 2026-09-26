/** @jsxImportSource react */
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink } from 'react-router'
import { APP_NAV_ITEMS } from '@/frontend/components/app-nav-items'
import { Button } from '@/frontend/components/button'
import { cx } from '@/frontend/components/class-names'

// キーボード操作でフォーカス移動の対象にする要素(開いたときの初期フォーカス、
// Tab/Shift+Tabでの循環の両方で使う。dialog.tsxと同じ考え方)
const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

type AppHeaderDrawerProps = {
  currentUserEmail: string
  onSignOut: () => void
}

// AppHeaderDrawer: 画面幅768px未満で表示される、/app配下のハンバーガーメニュー+ドロワー。
// メニュー項目はサイドメニュー(app-layout.tsx)と共有するAPP_NAV_ITEMSを使う。
// header-drawer.tsx(公開画面向け)と同じ考え方で、開閉のトグルボタン自体で状態を示し
// (アイコンをハンバーガー⇔✗で切り替える)、ドロワー内に別の閉じるボタンは置かない。
// 2-AのDialogと同様の考え方で、次の挙動を実装する:
// - 閉じている間はパネルにinert属性を付け、キーボード操作・読み上げの対象から外す
//   (閉じるアニメーションの途中も操作できないようにするため)。768px以上ではCSS側で
//   そもそも非表示(display: none)にしており、inertはその保険として働く
// - 開いたら最初のメニュー項目へフォーカスを移し、開いている間はメニューボタンとパネル内の
//   操作部品だけをTab/Shift+Tabで循環できるようにする(パネルはcreatePortalでdocument.body
//   直下に描画されトグルボタンとDOM上つながっていないため、Dialogのような単純な境界判定
//   ではなく、フォーカス可能要素を並べたリスト内でのインデックス計算により常に手動で
//   移動先を決める)
// - 開いている間はdocument.bodyのスクロールを止め、閉じたら元に戻す
// - Escで閉じる・閉じたらメニューボタンへフォーカスを戻す
export function AppHeaderDrawer({ currentUserEmail, onSignOut }: AppHeaderDrawerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const toggleButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const navId = useId()

  useEffect(() => {
    if (!isOpen) {
      return
    }

    // 開いたときに最初のメニュー項目へフォーカスする
    const firstPanelFocusable = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    firstPanelFocusable?.focus()

    // ドロワー表示中は背後のコンテンツがスクロールしないようにし、閉じたら元に戻す
    const previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // メニューボタン自身とパネル内の操作部品をまとめて、Tabで循環する対象を返す。
    // メニューボタンはヘッダー側(z-index: 101)にあり、ドロワー表示中も常に手前で
    // クリック可能なままのため、循環対象にメニューボタンも含める
    function getFocusables(): HTMLElement[] {
      const panelFocusables = panelRef.current ? Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : []
      return toggleButtonRef.current ? [toggleButtonRef.current, ...panelFocusables] : panelFocusables
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsOpen(false)
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const focusables = getFocusables()
      if (focusables.length === 0) {
        return
      }

      // メニューボタンとパネルはDOM上つながっていない(パネルはdocument.body直下に
      // portalされる)ため、「境界(最初/最後)だけ防いで残りはブラウザ標準の移動に任せる」
      // 方式ではドロワー外へフォーカスが漏れてしまう。常にこのリスト内でのインデックスを
      // 計算し、行き先を明示的に指定する
      const currentIndex = focusables.indexOf(document.activeElement as HTMLElement)
      const step = event.shiftKey ? -1 : 1
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + step + focusables.length) % focusables.length

      event.preventDefault()
      focusables[nextIndex]?.focus()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousBodyOverflow
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
            ref={panelRef}
            id={navId}
            aria-label="メインメニュー"
            className={cx('app-drawer__panel', isOpen && 'app-drawer__panel--open')}
            // 閉じている間(768px以上でCSS上そもそも非表示の場合も含む)は、キーボード操作・
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
