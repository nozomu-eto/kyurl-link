/** @jsxImportSource react */
import { Link, NavLink, Outlet, redirect, ScrollRestoration, useLoaderData, useNavigate } from 'react-router'
import { APP_NAV_ITEMS } from '@/frontend/components/app-nav-items'
import { AppHeaderDrawer } from '@/frontend/components/app-header-drawer'
import { BrandLogo } from '@/frontend/components/brand-logo'
import { Button } from '@/frontend/components/button'
import { cx } from '@/frontend/components/class-names'
import { authClient, type AuthUser } from '@/frontend/lib/auth-client'

// requireSessionLoader: /app配下の全画面に入る前に必ず実行されるloader。
// ログインしていなければ/loginへリダイレクトする(docs/architecture.mdの「API設計」
// 「リダイレクト・通報・掲示物公開プレビュー以外は全て要ログイン」の方針をフロント側でも
// 反映する)。authClient.getSession()はReactフック版(useSession)と異なり、
// コンポーネント外(loader)からも呼び出せる一度きりのセッション取得API
export async function requireSessionLoader() {
  const { data } = await authClient.getSession()

  if (!data) {
    // react-router data modeのredirect()はResponseを投げる特殊な関数。
    // loaderがこれをthrowすると、コンポーネントを描画せずにブラウザ遷移が発生する
    throw redirect('/login')
  }

  return { currentUser: data.user }
}

// AppLayout: ログイン後の画面(ダッシュボード・link/QR/poster編集・アカウント設定)で
// 共有する外枠(docs/architecture.mdの「フロントデザインの全面見直し」・docs/mocks/Dashboard.html)。
// 上部の白いヘッダー(左にサービス名、右にメールアドレス+ログアウト)+左のサイドメニュー
// (幅240px)の構成。768px未満ではサイドメニューを隠し、ヘッダー右端のハンバーガーメニュー
// (AppHeaderDrawer)からドロワーで同じメニューを開く。
// requireSessionLoaderの結果(ログイン中ユーザー情報)をuseLoaderDataで受け取り、
// ログアウトボタンの動作等に使う
export function AppLayout() {
  const { currentUser } = useLoaderData<typeof requireSessionLoader>()
  const navigate = useNavigate()

  // ログアウトボタンのクリックハンドラ。Better Authのセッションを破棄した後、
  // トップページへ遷移する(/app配下に留まるとrequireSessionLoaderに弾かれて
  // 結局/loginへ飛ばされるだけなので、トップに戻す方が自然)
  async function handleSignOutClick() {
    await authClient.signOut()
    await navigate('/')
  }

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <Link to="/" className="app-shell__header-brand">
          <BrandLogo />
        </Link>
        <div className="app-shell__header-account">
          <span>{currentUser.email}</span>
          <Button variant="neutral" onClick={handleSignOutClick}>
            ログアウト
          </Button>
        </div>
        <AppHeaderDrawer currentUserEmail={currentUser.email} onSignOut={handleSignOutClick} />
      </header>
      <div className="app-shell__body">
        <aside className="app-shell__sidebar">
          <nav aria-label="メインメニュー">
            {APP_NAV_ITEMS.map((navItem) => (
              <NavLink
                key={navItem.to}
                to={navItem.to}
                end={navItem.end}
                className={({ isActive }) => cx('app-shell__nav-link', isActive && 'is-active')}
              >
                {navItem.renderIcon()}
                {navItem.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <div className="app-shell__main">
          <Outlet context={{ currentUser } satisfies { currentUser: AuthUser }} />
        </div>
      </div>
      {/* 画面遷移のたびにスクロール位置を先頭に戻す(戻る/進むの場合は元の位置を復元する)。
          無いと、長いページから別ページに遷移した際、遷移前のスクロール位置が残ってしまう */}
      <ScrollRestoration />
    </div>
  )
}
