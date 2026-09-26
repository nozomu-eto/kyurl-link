/** @jsxImportSource react */
import { useId } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { useHeaderDrawer } from '@/frontend/lib/use-header-drawer'

// HeaderDrawer: タブレット以下(1024px以下)で表示されるハンバーガーメニュー+ドロワーコンポーネント。
// 開閉・フォーカス管理・背景の固定等の共通処理はuseHeaderDrawer(use-header-drawer.ts)に
// まとめてあり、app-header-drawer.tsx(/app配下、切り替え幅768px)と共有する。
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
  const { isOpen, toggleButtonRef, panelRef, toggle, close } = useHeaderDrawer({
    // 1024px以下でハンバーガーメニューを表示する(global.css参照)ため、1025px以上を
    // デスクトップ幅として扱う
    desktopMediaQuery: '(min-width: 1025px)',
  })
  const navId = useId()

  return (
    <>
      {/* ハンバーガーメニューボタン。aria-expandedの値でCSS側が見た目(3本線⇔✗)を切り替える。
          ヘッダー自身が最前面にあるため、ドロワー表示中もこのボタンは常にクリック可能 */}
      <button
        ref={toggleButtonRef}
        type="button"
        className="header-drawer__toggle"
        aria-label={isOpen ? 'メニューを閉じる' : 'メニューを開く'}
        aria-expanded={isOpen}
        aria-controls={navId}
        onClick={toggle}
      >
        <span className="header-drawer__toggle-line"></span>
        <span className="header-drawer__toggle-line"></span>
        <span className="header-drawer__toggle-line"></span>
      </button>

      {createPortal(
        <>
          {/* モーダルオーバーレイ */}
          {isOpen && <div className="header-drawer__overlay" onClick={close} aria-hidden="true"></div>}

          {/* ドロワーパネル */}
          <nav
            ref={panelRef}
            id={navId}
            aria-label="メインメニュー"
            className={`header-drawer__panel ${isOpen ? 'header-drawer__panel--open' : ''}`}
            // 閉じている間(1025px以上でCSS上そもそも非表示の場合も含む)は、キーボード操作・
            // 読み上げの対象から外す。閉じるアニメーションの途中でもTab等で操作できてしまう
            // ことを防ぐ
            inert={!isOpen}
          >
            <div className="header-drawer__content">
              {isLoggedIn ? (
                <Link to="/app" className="button button--secondary header-drawer__item" onClick={close}>
                  ダッシュボードへ
                </Link>
              ) : (
                <>
                  <Link to="/login" className="button button--outline header-drawer__item" onClick={close}>
                    ログイン
                  </Link>
                  <Link to="/signup" className="button button--cta header-drawer__item" onClick={close}>
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
