import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// 各テスト後にDOMをクリーンアップし、前のテストのレンダリング結果が残らないようにする
afterEach(() => {
  cleanup()
})

// jsdomはwindow.matchMediaを実装していないため、最小限のモックを用意する。
// クエリ文字列ごとにリスナーを保持するだけの単純な実装で、実際のビューポート幅とは連動しない。
// テスト側は下のtriggerMediaQueryChange()で「変化」を疑似的に発生させる
type MediaQueryChangeListener = (event: MediaQueryListEvent) => void

const mediaQueryListenersByQuery = new Map<string, Set<MediaQueryChangeListener>>()

window.matchMedia = (query: string): MediaQueryList => {
  if (!mediaQueryListenersByQuery.has(query)) {
    mediaQueryListenersByQuery.set(query, new Set())
  }
  const listeners = mediaQueryListenersByQuery.get(query) as Set<MediaQueryChangeListener>

  return {
    media: query,
    // 実際のビューポート幅は評価しないため、常にfalseを返す
    matches: false,
    onchange: null,
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.add(listener as MediaQueryChangeListener)
    },
    removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.delete(listener as MediaQueryChangeListener)
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  } as unknown as MediaQueryList
}

// テストから、指定したメディアクエリの購読者へ「変化」を疑似的に通知するヘルパー
export function triggerMediaQueryChange(query: string, matches: boolean): void {
  const listeners = mediaQueryListenersByQuery.get(query)
  listeners?.forEach((listener) => listener({ matches } as MediaQueryListEvent))
}
