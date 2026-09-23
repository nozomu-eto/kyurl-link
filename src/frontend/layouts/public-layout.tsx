/** @jsxImportSource react */
import { Link, Outlet } from 'react-router'
import { authClient } from '@/frontend/lib/auth-client'
import { HeaderDrawer } from '@/frontend/components/header-drawer'

// PublicLayout: 未ログインでも閲覧できる画面(トップ・利用規約・プライバシーポリシー・
// 認証系画面)で共有するヘッダー・フッターを持つ外枠(見た目はdocs/architecture.md 第6.5節)。
// ヘッダー右側は、ログイン中かどうかで「ダッシュボードへ」/「ログイン・新規登録」を
// 出し分ける(useSessionはBetter Authのセッション状態を購読するフック)
export function PublicLayout() {
  const { data: session, isPending } = authClient.useSession()

  return (
    <div className="public-shell">
      <header className="site-header">
        <Link to="/" className="site-header__brand">
          <span className="brand-logo">
            kyurl<span className="brand-logo__dot">.</span>link
          </span>
        </Link>
        {/* デスクトップナビ(1024px以上) */}
        <nav className="site-header__nav site-header__nav--desktop">
          {/* セッション確認中(isPending)は状態が確定するまでリンクを出し分けない
              (ログイン済みなのに一瞬「ログイン」リンクが見えるちらつきを避けるため) */}
          {!isPending && session && (
            <Link to="/app" className="button button--secondary">
              ダッシュボードへ
            </Link>
          )}
          {!isPending && !session && (
            <>
              <Link to="/login" className="button button--outline">
                ログイン
              </Link>
              {/* 画面内で最も押してほしい導線のため、朱(CTA色)のボタンにする */}
              <Link to="/signup" className="button button--cta">
                新規登録
              </Link>
            </>
          )}
        </nav>

        {/* タブレット・モバイルナビ(1024px以下) */}
        {!isPending && (
          <HeaderDrawer isLoggedIn={!!session} />
        )}
      </header>
      <main className="public-shell__main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="site-footer__inner">
          <div>
            <Link to="/" className="brand-logo">
              kyurl<span className="brand-logo__dot">.</span>link
            </Link>
            <p className="site-footer__lead">
              URL短縮・QRコード生成・掲示物づくりを
              <br />
              まとめてできる、小さなお店のためのサービス
            </p>
          </div>
          <nav aria-label="アカウント">
            <p className="site-footer__heading">アカウント</p>
            <ul className="site-footer__links">
              <li>
                <Link to="/signup">新規登録</Link>
              </li>
              <li>
                <Link to="/login">ログイン</Link>
              </li>
              <li>
                <Link to="/reset-password">パスワードをお忘れの方</Link>
              </li>
            </ul>
          </nav>
          <nav aria-label="規約・ポリシー">
            <p className="site-footer__heading">規約・ポリシー</p>
            <ul className="site-footer__links">
              <li>
                <Link to="/terms">利用規約</Link>
              </li>
              <li>
                <Link to="/privacy">プライバシーポリシー</Link>
              </li>
              <li>
                <a href="mailto:info@kyurl.link">お問い合わせ</a>
              </li>
            </ul>
          </nav>
        </div>
        <div className="site-footer__bottom">
          <span>掲示物のQRコードを読み取った方へ: リンク先の内容は各店舗・施設が管理しています</span>
          <span className="site-footer__copyright">© kyurl.link</span>
        </div>
      </footer>
    </div>
  )
}
