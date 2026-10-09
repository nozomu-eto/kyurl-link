/** @jsxImportSource react */
import type { ReactNode } from 'react'

export type EmptyStateStep = {
  // 「STEP 1」などの見出し
  label: string
  title: string
  text: string
}

type EmptyStateProps = {
  // 上部に表示するアイコン(装飾のためスクリーンリーダーには読み上げない)
  icon?: ReactNode
  title: string
  // 補足の説明文。<br />を含められるようReactNodeで受ける
  description?: ReactNode
  // 次の操作を促すボタン(ButtonLink等)
  action?: ReactNode
  // 利用の流れを示す手順(省略可)
  steps?: EmptyStateStep[]
}

// EmptyState: 一覧が0件のときの案内(アイコン・見出し・説明・作成ボタン・手順)をカード内に表示する共通部品。
// 一覧ごとに「まだ◯◯がありません」の見た目がばらつかないよう、この部品に揃える
export function EmptyState({ icon, title, description, action, steps }: EmptyStateProps) {
  return (
    <section className="card empty-state">
      {icon && (
        <span className="empty-state__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <h2 className="empty-state__title">{title}</h2>
      {description && <p className="empty-state__description">{description}</p>}
      {action}
      {steps && (
        <ol className="empty-state__steps">
          {steps.map((step) => (
            <li key={step.label} className="empty-state__step">
              <span className="empty-state__step-label">{step.label}</span>
              <span className="empty-state__step-title">{step.title}</span>
              <span className="empty-state__step-text">{step.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
