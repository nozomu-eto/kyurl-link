import { useEffect } from 'react'

// document.body.style.overflow = 'hidden'だけではiOS Safariのタッチスクロール(背景の
// バウンス・スクロール)を止められないため、bodyをposition: fixedにして現在のスクロール位置を
// topのマイナス値で保持する定番の手法を使う。
//
// Dialog・AppHeaderDrawer等、複数の部品が同時にロックする可能性があるため、モジュールスコープの
// カウンタで管理する。最初にロックした時だけ元のスタイル・スクロール位置を記録して適用し、
// 最後に解除された時だけ元に戻す(例: Dialogを開いたままドロワーも開いた場合、ドロワーを
// 閉じてもDialogが開いている間はロックが続き、Dialogを閉じたときに初めて元のスクロール位置へ戻る)
let lockCount = 0
let savedScrollY = 0
let savedBodyStyle: {
  position: string
  top: string
  left: string
  right: string
  width: string
  overflow: string
} | null = null

function lockBodyScroll(): void {
  lockCount += 1
  if (lockCount > 1) {
    // 既に他の部品がロック中のため、スタイルの記録・適用は最初の1件だけで行う
    return
  }

  savedScrollY = window.scrollY
  savedBodyStyle = {
    position: document.body.style.position,
    top: document.body.style.top,
    left: document.body.style.left,
    right: document.body.style.right,
    width: document.body.style.width,
    overflow: document.body.style.overflow,
  }

  document.body.style.position = 'fixed'
  document.body.style.top = `-${savedScrollY}px`
  document.body.style.left = '0'
  document.body.style.right = '0'
  document.body.style.width = '100%'
  document.body.style.overflow = 'hidden'
}

function unlockBodyScroll(): void {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount > 0) {
    // 他の部品がまだロック中のため、ここでは戻さない
    return
  }

  if (savedBodyStyle) {
    document.body.style.position = savedBodyStyle.position
    document.body.style.top = savedBodyStyle.top
    document.body.style.left = savedBodyStyle.left
    document.body.style.right = savedBodyStyle.right
    document.body.style.width = savedBodyStyle.width
    document.body.style.overflow = savedBodyStyle.overflow
    savedBodyStyle = null
  }

  // position: fixedの間はスクロール位置が失われる(bodyがビューポートに固定されるため)ので、
  // 元に戻した後に記録していた位置へ改めてスクロールする
  window.scrollTo(0, savedScrollY)
}

// useBodyScrollLock: isLockedがtrueの間、document.bodyのスクロール(iOS Safariのタッチ
// スクロールを含む)を止める共通フック。Dialog・AppHeaderDrawer等、背景を操作させたくない
// モーダル・ドロワー系の部品から使う
export function useBodyScrollLock(isLocked: boolean): void {
  useEffect(() => {
    if (!isLocked) {
      return
    }

    lockBodyScroll()
    return () => {
      unlockBodyScroll()
    }
  }, [isLocked])
}
