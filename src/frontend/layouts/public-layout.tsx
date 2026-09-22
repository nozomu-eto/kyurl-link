/** @jsxImportSource react */
import { Link, Outlet } from 'react-router'
import { authClient } from '@/frontend/lib/auth-client'

// PublicLayout: 未ログインでも閲覧できる画面(トップ・利用規約・プライバシーポリシー・
// 認証系画面)で共有するヘッダー・フッターを持つ外枠。
// ヘッダー右側は、ログイン中かどうかで「ダッシュボードへ」/「ログイン・新規登録」を
// 出し分ける(useSessionはBetter Authのセッション状態を購読するフック)
export function PublicLayout() {
  const { data: session, isPending } = authClient.useSession()

  return (
    <div>
      <header className="site-header">
        <Link to="/" className="site-header__brand">
          kyurl.link
        </Link>
        <nav className="site-header__nav">
          {/* セッション確認中(isPending)は状態が確定するまでリンクを出し分けない
              (ログイン済みなのに一瞬「ログイン」リンクが見えるちらつきを避けるため) */}
          {!isPending && session && (
            <Link to="/app" className="button button--secondary">
              ダッシュボードへ
            </Link>
          )}
          {!isPending && !session && (
            <>
              <Link to="/login">ログイン</Link>
              <Link to="/signup" className="button button--primary">
                新規登録
              </Link>
            </>
          )}
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="site-header" style={{ justifyContent: 'center', gap: '1.5rem', borderTop: '1px solid var(--color-border)', borderBottom: 'none' }}>
        <Link to="/terms">利用規約</Link>
        <Link to="/privacy">プライバシーポリシー</Link>
        <a href="mailto:info@kyurl.link">お問い合わせ</a>
      </footer>
    </div>
  )
}
