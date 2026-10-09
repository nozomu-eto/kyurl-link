import { useCallback, useEffect, useRef, useState } from 'react'

// useElementWidth: 要素の表示幅(px)を追い続ける。掲示物のプレビューを、置かれた場所の幅に合わせて
// 縮小するために使う。ResizeObserverが無い環境(テスト等)では、取得できた最初の幅のままにする
export function useElementWidth<T extends HTMLElement>(): [(element: T | null) => void, number | null] {
  const [width, setWidth] = useState<number | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)

  const ref = useCallback((element: T | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null

    if (!element) {
      return
    }

    setWidth(element.getBoundingClientRect().width || null)
    if (typeof ResizeObserver !== 'undefined') {
      observerRef.current = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width || null))
      observerRef.current.observe(element)
    }
  }, [])

  useEffect(() => () => observerRef.current?.disconnect(), [])

  return [ref, width]
}
