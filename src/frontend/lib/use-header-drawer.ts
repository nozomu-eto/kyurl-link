import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useBodyScrollLock } from '@/frontend/lib/use-body-scroll-lock'

// キーボード操作でフォーカス移動の対象にする要素(開いたときの初期フォーカス、
// Tab/Shift+Tabでの循環の両方で使う。dialog.tsxと同じ考え方)
const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

type UseHeaderDrawerOptions = {
  // ドロワーを自動的に閉じる画面幅の条件(matchMediaのクエリ文字列)。
  // 例: 公開画面のHeaderDrawerは'(min-width: 1025px)'(1024px以下でハンバーガー表示)、
  // /app配下のAppHeaderDrawerは'(min-width: 769px)'(768px未満でハンバーガー表示)
  desktopMediaQuery: string
}

type UseHeaderDrawerResult = {
  isOpen: boolean
  toggleButtonRef: RefObject<HTMLButtonElement | null>
  // ドロワーのパネル本体(<nav>)に付けるref。<nav>はHTMLElementなのでこの型にする
  panelRef: RefObject<HTMLElement | null>
  toggle: () => void
  close: () => void
}

// useHeaderDrawer: ヘッダーのハンバーガーメニュー+ドロワーに共通する開閉・アクセシビリティの
// 処理をまとめたフック。header-drawer.tsx(公開画面、切り替え幅1024px)とapp-header-drawer.tsx
// (/app配下、切り替え幅768px)の両方から使う。見た目(トグルボタンのアイコン・パネルの
// レイアウト等)や中身は呼び出し側が組み立て、このフックはrefと開閉状態だけを提供する。
//
// 次の挙動を実装する:
// - 開いたら最初の操作部品へフォーカスを移し、開いている間はメニューボタンとパネル内の
//   操作部品だけをTab/Shift+Tabで循環できるようにする(パネルはcreatePortalでdocument.body
//   直下に描画されトグルボタンとDOM上つながっていないため、境界だけ防いで残りはブラウザ標準の
//   移動に任せる方式では外へ漏れる。常にフォーカス可能要素のリスト内でのインデックスを計算し、
//   移動先を明示的に指定する)
// - 開いている間はdocument.bodyのスクロールを止め(useBodyScrollLock、iOS Safariのタッチ
//   スクロールにも対応)、閉じたら元に戻す
// - Escで閉じる・閉じたらメニューボタンへフォーカスを戻す
// - desktopMediaQueryに一致する画面幅になったら自動的に閉じる(開いたまま画面回転・
//   ウィンドウ幅変更でデスクトップ幅になっても、幕・パネルが隠れるだけでなく開閉状態自体を
//   閉じ、スクロール固定も解除されるようにするため)
//
// パネルへのinert(閉じている間、キーボード操作・読み上げの対象から外す)は、呼び出し側で
// `inert={!isOpen}`をパネル要素に付けてもらう(JSXの属性のため、このフックからは返さない)
export function useHeaderDrawer({ desktopMediaQuery }: UseHeaderDrawerOptions): UseHeaderDrawerResult {
  const [isOpen, setIsOpen] = useState(false)
  const toggleButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)

  useBodyScrollLock(isOpen)

  useEffect(() => {
    const desktopMediaQueryList = window.matchMedia(desktopMediaQuery)

    function handleDesktopMediaQueryChange(event: MediaQueryListEvent) {
      if (event.matches) {
        setIsOpen(false)
      }
    }

    desktopMediaQueryList.addEventListener('change', handleDesktopMediaQueryChange)
    return () => desktopMediaQueryList.removeEventListener('change', handleDesktopMediaQueryChange)
  }, [desktopMediaQuery])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    // 開いたときに最初の操作部品へフォーカスする
    const firstPanelFocusable = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    firstPanelFocusable?.focus()

    // メニューボタン自身とパネル内の操作部品をまとめて、Tabで循環する対象を返す。
    // メニューボタンはヘッダー側(パネルより手前のz-index)にあり、ドロワー表示中も常に
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

      const currentIndex = focusables.indexOf(document.activeElement as HTMLElement)
      const step = event.shiftKey ? -1 : 1
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + step + focusables.length) % focusables.length

      event.preventDefault()
      focusables[nextIndex]?.focus()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      // 閉じたらメニューボタンへフォーカスを戻す
      toggleButtonRef.current?.focus()
    }
  }, [isOpen])

  return {
    isOpen,
    toggleButtonRef,
    panelRef,
    toggle: () => setIsOpen((current) => !current),
    close: () => setIsOpen(false),
  }
}
