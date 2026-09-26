/** @jsxImportSource react */
import { useEffect, useRef, useState } from 'react'
import { cx } from '@/frontend/components/class-names'

type CopyButtonProps = {
  // コピー対象の文字列(短縮URLの絶対URL等)。aria-labelにそのまま含めることで、
  // スクリーンリーダー利用者にもコピー対象が伝わるようにする
  value: string
  // trueの場合、アイコンのみ・44px角のスマホ向け表示にする(docs/mocks/Components.html)
  compact?: boolean
  className?: string
}

type CopyStatus = 'idle' | 'copied' | 'error'

// コピー完了表示を保持する時間(ミリ秒。docs/mocks/Components.htmlの「コピー後(2秒で戻す)」に合わせる)
const COPIED_DISPLAY_DURATION_MS = 2000

// CopyButton: navigator.clipboard.writeTextでvalueをコピーする共通部品。
// コピー後2秒間は成功表示(チェックアイコン+緑)に切り替え、失敗時はエラー文言を表示する
export function CopyButton({ value, compact = false, className }: CopyButtonProps) {
  const [status, setStatus] = useState<CopyStatus>('idle')
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // アンマウント時に「コピーしました」表示を戻すタイマーが残らないようにする
  useEffect(() => () => clearTimeout(resetTimerRef.current), [])

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      setStatus('error')
      return
    }
    setStatus('copied')
    clearTimeout(resetTimerRef.current)
    resetTimerRef.current = setTimeout(() => setStatus('idle'), COPIED_DISPLAY_DURATION_MS)
  }

  const isCopied = status === 'copied'

  return (
    <span className="copy-button__wrapper">
      <button
        type="button"
        className={cx('copy-button', compact && 'copy-button--compact', isCopied && 'copy-button--copied', className)}
        aria-label={isCopied ? `${value} をコピーしました` : `${value} をコピー`}
        onClick={handleClick}
      >
        {isCopied ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V6a2 2 0 0 1 2-2h8" />
          </svg>
        )}
        {!compact && <span>{isCopied ? 'コピーしました' : 'コピー'}</span>}
      </button>
      {status === 'error' && (
        <span className="copy-button__error" role="alert">
          コピーに失敗しました
        </span>
      )}
      {/* 画面上は非表示のまま「コピーしました」を読み上げる。ボタンの見た目自体もコピー後に
          変わるが(aria-labelの切り替えのみ)、視覚的な変化を伴わない読み上げ専用の通知として
          role="status"の領域を別に用意する */}
      <span className="visually-hidden" role="status">
        {isCopied ? 'コピーしました' : ''}
      </span>
    </span>
  )
}
