/** @jsxImportSource react */
import type { ReactNode } from 'react'

export type AppNavItem = {
  to: string
  label: string
  // trueの項目は完全一致のときだけアクティブ表示にする
  // (/appを完全一致にしないと、/app/links/new等の子画面でも常にアクティブになってしまうため)
  end?: boolean
  renderIcon: () => ReactNode
}

// /app配下のサイドメニュー(app-layout.tsx)とスマホのドロワー(app-header-drawer.tsx)で
// 共有するメニュー項目(docs/architecture.mdの「フロントデザインの全面見直し」の4項目)。
// 掲示物は一覧画面がまだ無いため、メニューに出していない
// (一覧画面と同時に追加する。追加時は下のコメントアウトを外すだけで済むようにしてある)
export const APP_NAV_ITEMS: AppNavItem[] = [
  {
    to: '/app',
    label: '短縮URL',
    end: true,
    renderIcon: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
        <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
      </svg>
    ),
  },
  {
    to: '/app/qrcodes',
    label: 'QRコード',
    renderIcon: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="4" width="6" height="6" />
        <rect x="14" y="4" width="6" height="6" />
        <rect x="4" y="14" width="6" height="6" />
        <path d="M14 14h2v2" />
        <path d="M20 14v6h-6" />
      </svg>
    ),
  },
  // {
  //   to: '/app/posters',
  //   label: '掲示物',
  //   renderIcon: () => (
  //     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  //       <rect x="6" y="3" width="12" height="18" rx="1" />
  //       <path d="M9 7h6" />
  //       <rect x="9.5" y="11" width="5" height="5" />
  //     </svg>
  //   ),
  // },
  {
    to: '/app/account',
    label: 'アカウント設定',
    renderIcon: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
      </svg>
    ),
  },
]
