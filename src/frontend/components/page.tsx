/** @jsxImportSource react */
import type { ReactNode } from 'react'

type PageProps = {
  // 画面見出し(h1)。動的な値を含む場合はJSXで渡せる
  title: ReactNode
  // 見出しの右側に並べるボタン等(例: 一覧画面の「新しく作成」)
  actions?: ReactNode
  // trueの場合、公開画面向けに本文幅(720px)で中央寄せする。/app配下ではfalseのまま使う
  contained?: boolean
  children?: ReactNode
}

// Page: 1画面分の外枠。見出しと、直下の要素同士の間隔(global.cssの.page/.page-container)を担う。
// 画面ごとにh1やmarginを書かずに済むよう、すべての画面をこの部品で包む
export function Page({ title, actions, contained = false, children }: PageProps) {
  return (
    <div className={contained ? 'page-container' : 'page'}>
      {actions ? (
        <div className="page-header">
          <h1>{title}</h1>
          {actions}
        </div>
      ) : (
        <h1>{title}</h1>
      )}
      {children}
    </div>
  )
}
