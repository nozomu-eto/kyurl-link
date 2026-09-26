/** @jsxImportSource react */
import type { ComponentProps, ReactNode } from 'react'
import { cx } from '@/frontend/components/class-names'

type CardProps = {
  // カード見出し(h2)。省略した場合は見出しなしのカードになる
  title?: ReactNode
  // 見出しの右側に並べるボタン等。titleと併用する
  actions?: ReactNode
  className?: string
  children?: ReactNode
}

// Card: 詳細情報・設定項目などのまとまりを表す共通部品(<section class="card">)
export function Card({ title, actions, className, children }: CardProps) {
  return (
    <section className={cx('card', className)}>
      {title !== undefined && actions !== undefined && (
        <div className="card__header">
          <h2 className="card__title">{title}</h2>
          {actions}
        </div>
      )}
      {title !== undefined && actions === undefined && <h2 className="card__title">{title}</h2>}
      {children}
    </section>
  )
}

// FormCard: カードの見た目のフォーム(<form class="card">)。onSubmit等は<form>にそのまま渡す
export function FormCard({ className, ...formProps }: ComponentProps<'form'>) {
  return <form className={cx('card', className)} {...formProps} />
}
