/** @jsxImportSource react */
import { useEffect } from 'react'

type ToastProps = {
  message: string
  // 自動的に消えるまでの時間(ミリ秒)
  durationMs?: number
  // 表示時間の経過を親に伝えるコールバック。表示のON/OFF自体は呼び出し側(状態)が持つ
  onDismiss: () => void
}

const DEFAULT_DURATION_MS = 3000

// Toast: 画面下部に一時的なメッセージを表示する共通部品。role="status"で読み上げられ、
// 指定時間が経過すると自動的に消える
export function Toast({ message, durationMs = DEFAULT_DURATION_MS, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(timer)
  }, [durationMs, onDismiss])

  return (
    <div className="toast" role="status">
      {message}
    </div>
  )
}
