/** @jsxImportSource react */
import type { ReactNode } from 'react'

// AlertMessage: フォーム送信結果やAPIエラーを画面上部に帯状で表示する共通部品。
// tone='error'は失敗、tone='success'は成功・完了系の文言を表示する際に使う
type AlertMessageProps = {
  tone: 'error' | 'success'
  children: ReactNode
}

export function AlertMessage({ tone, children }: AlertMessageProps) {
  return (
    <p className={`alert alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  )
}
