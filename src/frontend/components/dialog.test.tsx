/** @jsxImportSource react */
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { Dialog } from '@/frontend/components/dialog'

// Dialogを開閉する状態を持つ、テスト専用の呼び出し元コンポーネント。
// onCloseは呼び出しのたびに新しい関数を生成する(実際の画面と同様、親の再描画のたびに
// 新しい参照になる状況を再現するため)
function TestHarness() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div>
      <button type="button" onClick={() => setIsOpen(true)}>
        開く
      </button>
      <Dialog isOpen={isOpen} onClose={() => setIsOpen(false)} title="確認">
        <button type="button">最初のボタン</button>
        <button type="button">最後のボタン</button>
      </Dialog>
    </div>
  )
}

describe('Dialog', () => {
  afterEach(() => {
    // テスト間でスクロール固定状態が残らないようにする
    document.body.style.overflow = ''
  })

  it('開くと最初の操作部品にフォーカスし、Escで閉じると開く前の要素へフォーカスが戻る', async () => {
    const user = userEvent.setup()
    render(<TestHarness />)

    const openButton = screen.getByRole('button', { name: '開く' })
    await user.click(openButton)

    const firstFocusable = screen.getByRole('button', { name: '最初のボタン' })
    expect(document.activeElement).toBe(firstFocusable)

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('button', { name: '最初のボタン' })).toBeNull()
    expect(document.activeElement).toBe(openButton)
  })

  it('Tabキーを繰り返してもダイアログ外へフォーカスが出ない', async () => {
    const user = userEvent.setup()
    render(<TestHarness />)

    await user.click(screen.getByRole('button', { name: '開く' }))

    const first = screen.getByRole('button', { name: '最初のボタン' })
    const last = screen.getByRole('button', { name: '最後のボタン' })
    expect(document.activeElement).toBe(first)

    // 最後の要素までは通常どおり進む
    await user.tab()
    expect(document.activeElement).toBe(last)

    // 最後の要素からさらにTabすると、ダイアログ外(「開く」ボタン)へは出ず最初の要素に戻る
    await user.tab()
    expect(document.activeElement).toBe(first)
  })

  it('開いている間はdocument.bodyのスクロールを止め、閉じたら元の値に戻す', async () => {
    const user = userEvent.setup()
    document.body.style.overflow = 'auto'
    render(<TestHarness />)

    await user.click(screen.getByRole('button', { name: '開く' }))
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')
    expect(document.body.style.overflow).toBe('auto')
  })

  it('親が再描画してonCloseの参照が変わっても、開いている間の初期フォーカスが再設定されない', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<TestHarness />)

    await user.click(screen.getByRole('button', { name: '開く' }))
    const last = screen.getByRole('button', { name: '最後のボタン' })

    // ダイアログ内で最後のボタンへ手動でフォーカスを移す
    last.focus()
    expect(document.activeElement).toBe(last)

    // 親を再描画させる(isOpenは変わらずtrueのまま、onCloseは新しい関数参照になる)
    rerender(<TestHarness />)

    // 初期フォーカス(最初のボタン)に戻されていないことを確認する
    expect(document.activeElement).toBe(last)
  })
})
