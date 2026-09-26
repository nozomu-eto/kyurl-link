/** @jsxImportSource react */
import { Link, NavLink, Outlet, redirect, ScrollRestoration, useLoaderData, useNavigate } from 'react-router'
import { BrandLogo } from '@/frontend/components/brand-logo'
import { Button } from '@/frontend/components/button'
import { authClient, type AuthUser } from '@/frontend/lib/auth-client'

// requireSessionLoader: /app配下の全画面に入る前に必ず実行されるloader。
// ログインしていなければ/loginへリダイレクトする(docs/architecture.md 第7節
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

// サイドナビの項目。endがtrueの項目は完全一致のときだけアクティブ表示にする
// (/appを完全一致にしないと、/app/links/new等の子画面でも常にアクティブになってしまうため)
const APP_NAV_ITEMS: { to: string; label: string; end?: boolean }[] = [
  { to: '/app', label: 'ダッシュボード', end: true },
  { to: '/app/links/new', label: '短縮URLを作成' },
  { to: '/app/qrcodes/new', label: 'QRコードを作成' },
  { to: '/app/account', label: 'アカウント設定' },
]

// AppLayout: ログイン後の画面(ダッシュボード・link/QR/poster編集・アカウント設定)で
// 共有するサイドナビ付きの外枠。requireSessionLoaderの結果(ログイン中ユーザー情報)を
// useLoaderDataで受け取り、ログアウトボタンの動作等に使う
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
      <aside className="app-shell__sidebar">
        <Link to="/" className="app-shell__brand">
          <BrandLogo />
        </Link>
        <nav>
          {APP_NAV_ITEMS.map((navItem) => (
            <NavLink
              key={navItem.to}
              to={navItem.to}
              end={navItem.end}
              className={({ isActive }) => `app-shell__nav-link${isActive ? ' is-active' : ''}`}
            >
              {navItem.label}
            </NavLink>
          ))}
        </nav>
        <p className="app-shell__account">{currentUser.email}</p>
        <Button variant="text" onClick={handleSignOutClick}>
          ログアウト
        </Button>
      </aside>
      <div className="app-shell__main">
        <Outlet context={{ currentUser } satisfies { currentUser: AuthUser }} />
      </div>
      {/* 画面遷移のたびにスクロール位置を先頭に戻す(戻る/進むの場合は元の位置を復元する)。
          無いと、長いページから別ページに遷移した際、遷移前のスクロール位置が残ってしまう */}
      <ScrollRestoration />
    </div>
  )
}
