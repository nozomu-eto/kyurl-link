/** @jsxImportSource react */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CopyButton } from '@/frontend/components/copy-button'

const COPY_TARGET = 'https://kyurl.link/abc123'

describe('CopyButton', () => {
  const writeText = vi.fn()

  beforeEach(() => {
    writeText.mockReset()
    // jsdomはClipboard APIを実装していないため、navigator.clipboardをテスト用に定義する
    Object.assign(navigator, { clipboard: { writeText } })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('クリックするとvalueをコピーし、2秒間「コピーしました」の表示に切り替わったのち元に戻る', async () => {
    writeText.mockResolvedValue(undefined)
    render(<CopyButton value={COPY_TARGET} />)

    fireEvent.click(screen.getByRole('button', { name: `${COPY_TARGET} をコピー` }))
    // navigator.clipboard.writeText()のPromise解決とsetStateをまとめて反映させる
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(writeText).toHaveBeenCalledWith(COPY_TARGET)
    expect(screen.getByRole('button', { name: `${COPY_TARGET} をコピーしました` })).toBeTruthy()
    // 視覚的には隠れているが、読み上げ用の領域(role="status")にも反映されている
    expect(screen.getByRole('status').textContent).toBe('コピーしました')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(screen.getByRole('button', { name: `${COPY_TARGET} をコピー` })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('コピーに失敗した場合はエラー文言を表示する', async () => {
    writeText.mockRejectedValue(new Error('permission denied'))
    render(<CopyButton value={COPY_TARGET} />)

    fireEvent.click(screen.getByRole('button', { name: `${COPY_TARGET} をコピー` }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByRole('alert').textContent).toBe('コピーに失敗しました')
    // 失敗時は成功表示に切り替わらない
    expect(screen.getByRole('button', { name: `${COPY_TARGET} をコピー` })).toBeTruthy()
  })
})
