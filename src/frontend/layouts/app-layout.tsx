/** @jsxImportSource react */
import { Link, NavLink, Outlet, redirect, useLoaderData, useNavigate } from 'react-router'
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
        <Link to="/" className="site-header__brand" style={{ display: 'block', marginBottom: '1.5rem' }}>
          kyurl.link
        </Link>
        <nav>
          <NavLink to="/app" end className={({ isActive }) => `app-shell__nav-link${isActive ? ' is-active' : ''}`}>
            ダッシュボード
          </NavLink>
          <NavLink to="/app/links/new" className={({ isActive }) => `app-shell__nav-link${isActive ? ' is-active' : ''}`}>
            短縮URLを作成
          </NavLink>
          <NavLink to="/app/qrcodes/new" className={({ isActive }) => `app-shell__nav-link${isActive ? ' is-active' : ''}`}>
            QRコードを作成
          </NavLink>
          <NavLink to="/app/account" className={({ isActive }) => `app-shell__nav-link${isActive ? ' is-active' : ''}`}>
            アカウント設定
          </NavLink>
        </nav>
        <p className="field__hint" style={{ marginTop: '2rem' }}>
          {currentUser.email}
        </p>
        <button type="button" className="button button--text" onClick={handleSignOutClick}>
          ログアウト
        </button>
      </aside>
      <div className="app-shell__main">
        <Outlet context={{ currentUser } satisfies { currentUser: AuthUser }} />
      </div>
    </div>
  )
}
