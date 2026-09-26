/** @jsxImportSource react */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'

// HeaderDrawer: タブレット以下(1024px以下)で表示されるハンバーガーメニュー+ドロワーコンポーネント。
// 重なり順(奥から手前): ヘッダーより下の通常コンテンツ < モーダルオーバーレイ < ドロワーパネル < ヘッダー。
//
// 注意: このコンポーネントは<header class="site-header">の中でレンダリングされる(public-layout.tsx)。
// もしオーバーレイ・パネルをこの場でそのまま描画すると、それらは.site-headerの「子要素」になり、
// 子は親のz-index値に関係なく必ず親自身の背景より手前に描画されてしまう(z-indexは兄弟間・
// 独立したスタッキングコンテキスト間でしか効かないため、親のz-indexをいくら上げても子は
// 隠せない)。そのためオーバーレイ・パネルはcreatePortalでdocument.body直下に描画し、
// .site-header(z-index: 101)と実際に兄弟関係になるようにすることで、z-indexによる
// 重なり順の制御を効かせ、ドロワー表示中も常にヘッダーが最前面に来るようにしている。
// このアプリはCSR専用のSPA(main.tsxでcreateRoot、SSRなし)のため、
// document.bodyへの直接アクセスも問題ない
interface HeaderDrawerProps {
  isLoggedIn: boolean
}

export function HeaderDrawer({ isLoggedIn }: HeaderDrawerProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      {/* ハンバーガーメニューボタン。aria-expandedの値でCSS側が見た目(3本線⇔✗)を切り替える。
          ヘッダー自身が最前面にあるため、ドロワー表示中もこのボタンは常にクリック可能 */}
      <button
        type="button"
        className="header-drawer__toggle"
        aria-label={isOpen ? 'メニューを閉じる' : 'メニューを開く'}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="header-drawer__toggle-line"></span>
        <span className="header-drawer__toggle-line"></span>
        <span className="header-drawer__toggle-line"></span>
      </button>

      {createPortal(
        <>
          {/* モーダルオーバーレイ */}
          {isOpen && (
            <div
              className="header-drawer__overlay"
              onClick={() => setIsOpen(false)}
              aria-hidden="true"
            ></div>
          )}

          {/* ドロワーパネル */}
          <nav
            className={`header-drawer__panel ${isOpen ? 'header-drawer__panel--open' : ''}`}
          >
            <div className="header-drawer__content">
              {isLoggedIn ? (
                <Link
                  to="/app"
                  className="button button--secondary header-drawer__item"
                  onClick={() => setIsOpen(false)}
                >
                  ダッシュボードへ
                </Link>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="button button--outline header-drawer__item"
                    onClick={() => setIsOpen(false)}
                  >
                    ログイン
                  </Link>
                  <Link
                    to="/signup"
                    className="button button--cta header-drawer__item"
                    onClick={() => setIsOpen(false)}
                  >
                    新規登録
                  </Link>
                </>
              )}
            </div>
          </nav>
        </>,
        document.body,
      )}
    </>
  )
}
