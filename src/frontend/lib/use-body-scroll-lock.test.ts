import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBodyScrollLock } from '@/frontend/lib/use-body-scroll-lock'

// jsdomは実際のタッチスクロール・レイアウトを再現できないため、position: fixed等の
// スタイルの設定と、window.scrollToの呼び出し内容で確認する
describe('useBodyScrollLock', () => {
  beforeEach(() => {
    document.body.style.overflow = 'auto'
    document.body.style.position = ''
    document.body.style.top = ''
    document.body.style.left = ''
    document.body.style.right = ''
    document.body.style.width = ''

    // jsdomはwindow.scrollToを実装していない(呼ぶと警告が出るだけの空実装)ため、
    // 呼び出し内容を確認できるようmockする
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    Object.defineProperty(window, 'scrollY', { value: 240, configurable: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('ロック中はbodyがposition: fixedになり、解除すると元のスタイルに戻って記録した位置へスクロールが戻る', () => {
    const { rerender, unmount } = renderHook(({ isLocked }) => useBodyScrollLock(isLocked), {
      initialProps: { isLocked: false },
    })

    expect(document.body.style.position).toBe('')

    rerender({ isLocked: true })

    expect(document.body.style.position).toBe('fixed')
    expect(document.body.style.top).toBe('-240px')
    expect(document.body.style.left).toBe('0px')
    expect(document.body.style.right).toBe('0px')
    expect(document.body.style.width).toBe('100%')
    expect(document.body.style.overflow).toBe('hidden')

    rerender({ isLocked: false })

    expect(document.body.style.position).toBe('')
    expect(document.body.style.overflow).toBe('auto')
    expect(window.scrollTo).toHaveBeenCalledWith(0, 240)

    unmount()
  })

  it('2つの部品が重なってロックした場合、両方解除されるまでロックが続く', () => {
    const first = renderHook(({ isLocked }) => useBodyScrollLock(isLocked), { initialProps: { isLocked: false } })
    const second = renderHook(({ isLocked }) => useBodyScrollLock(isLocked), { initialProps: { isLocked: false } })

    first.rerender({ isLocked: true })
    expect(document.body.style.position).toBe('fixed')

    second.rerender({ isLocked: true })
    expect(document.body.style.position).toBe('fixed')

    // 1つ目を解除しても、2つ目がまだロック中のためスタイルは維持される
    first.rerender({ isLocked: false })
    expect(document.body.style.position).toBe('fixed')
    expect(window.scrollTo).not.toHaveBeenCalled()

    // 最後の1つを解除して初めて元に戻る
    second.rerender({ isLocked: false })
    expect(document.body.style.position).toBe('')
    expect(window.scrollTo).toHaveBeenCalledWith(0, 240)

    first.unmount()
    second.unmount()
  })
})
