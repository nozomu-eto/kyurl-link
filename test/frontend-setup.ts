import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// 各テスト後にDOMをクリーンアップし、前のテストのレンダリング結果が残らないようにする
afterEach(() => {
  cleanup()
})
