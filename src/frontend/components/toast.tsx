/** @jsxImportSource react */
import { useEffect, useRef } from 'react'

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
  // onDismissを常に最新の値で呼び出すためのref。呼び出し元(親)がレンダーのたびに
  // 新しい関数を渡してくる場合でも、下のuseEffectの依存配列にonDismissを含めずに済み、
  // 親の再描画のたびにタイマーがリセットされない(表示時間が延び続けない)ようにする
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    const timer = setTimeout(() => onDismissRef.current(), durationMs)
    return () => clearTimeout(timer)
  }, [durationMs])

  return (
    <div className="toast" role="status">
      {message}
    </div>
  )
}
