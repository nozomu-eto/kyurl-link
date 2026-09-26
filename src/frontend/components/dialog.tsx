/** @jsxImportSource react */
import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '@/frontend/components/class-names'
import { useBodyScrollLock } from '@/frontend/lib/use-body-scroll-lock'

// キーボード操作でフォーカス移動の対象にする要素(Tabキーのフォーカストラップ、
// 開いたときの初期フォーカスの両方で使う)
const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

type DialogProps = {
  isOpen: boolean
  onClose: () => void
  // 見出し(aria-labelledbyで関連付ける)
  title: string
  // 補足説明(aria-describedbyで関連付ける)。省略可
  description?: string
  // trueの場合は確認・警告用(role="alertdialog")。既定は入力・情報表示用のrole="dialog"
  isAlertDialog?: boolean
  // trueの場合、画面幅768px未満では全画面表示にする(設計書第6.5節のスマホ対応ルール)
  fullScreenOnMobile?: boolean
  children?: ReactNode
  // フッターのボタン等(本文の下に表示)
  footer?: ReactNode
}

// Dialog: モーダルダイアログの共通部品(createPortalでdocument.body直下に描画する。
// 理由はheader-drawer.tsxと同様、z-indexによる重なり順の制御を効かせるため)。
// アクセシビリティ要件(role/aria-modal・見出しとの関連付け・初期フォーカス・
// フォーカストラップ・Escで閉じる・閉じたら元の要素へフォーカスを戻す)をここに集約する
export function Dialog({ isOpen, onClose, title, description, isAlertDialog = false, fullScreenOnMobile = false, children, footer }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  // onCloseを常に最新の値で呼び出すためのref。呼び出し元(親)がレンダーのたびに
  // 新しい関数を渡してくる場合でも、下のuseEffectの依存配列にonCloseを含めずに済み、
  // 再描画のたびに初期フォーカスの再設定・スクロール固定の解除/再固定が起きないようにする
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // ダイアログ表示中は背後のコンテンツがスクロールしないようにし、閉じたら元に戻す
  // (iOS Safariのタッチスクロールにも対応するため、document.body.style.overflowの直接操作ではなく
  // 専用フックを使う)
  useBodyScrollLock(isOpen)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    // 開く前にフォーカスがあった要素を覚えておき、閉じたときに戻す
    previouslyFocusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

    // 開いたときに最初の操作部品へフォーカスする
    const panel = panelRef.current
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    firstFocusable?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab' || !panel) {
        return
      }

      // Tabキーでダイアログ外へフォーカスが出ないようにする(フォーカストラップ)
      const focusableElements = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (focusableElements.length === 0) {
        return
      }
      const first = focusableElements[0]
      const last = focusableElements[focusableElements.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      // 閉じたら開く前にフォーカスがあった要素へ戻す
      previouslyFocusedElementRef.current?.focus()
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  return createPortal(
    <div
      className={cx('dialog__overlay', fullScreenOnMobile && 'dialog__overlay--full-screen-on-mobile')}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role={isAlertDialog ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cx('dialog__panel', fullScreenOnMobile && 'dialog__panel--full-screen-on-mobile')}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="dialog__title">
          {title}
        </h2>
        {description && (
          <p id={descriptionId} className="dialog__description">
            {description}
          </p>
        )}
        <div className="dialog__body">{children}</div>
        {footer && <div className="dialog__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
