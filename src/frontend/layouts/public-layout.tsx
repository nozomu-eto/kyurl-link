/** @jsxImportSource react */
import { Link, Outlet, ScrollRestoration } from 'react-router'
import { BrandLogo } from '@/frontend/components/brand-logo'
import { ButtonLink } from '@/frontend/components/button'
import { authClient } from '@/frontend/lib/auth-client'
import { HeaderDrawer } from '@/frontend/components/header-drawer'

// フッターのリンク列。列や項目を増やす場合はここに追加する
const FOOTER_LINK_GROUPS: { heading: string; links: { label: string; to?: string; href?: string }[] }[] = [
  {
    heading: 'アカウント',
    links: [
      { label: '無料で新規登録', to: '/signup' },
      { label: 'ログイン', to: '/login' },
      { label: 'パスワードをお忘れの方', to: '/reset-password' },
    ],
  },
  {
    heading: '規約・ポリシー',
    links: [
      { label: '利用規約', to: '/terms' },
      { label: 'プライバシーポリシー', to: '/privacy' },
      { label: 'お問い合わせ', href: 'mailto:info@kyurl.link' },
    ],
  },
]

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
          <BrandLogo />
          <span className="brand-tagline">URL短縮・QRコード・掲示物</span>
        </Link>
        {/* デスクトップナビ(1024px以上) */}
        <nav className="site-header__nav site-header__nav--desktop">
          {/* セッション確認中(isPending)は状態が確定するまでリンクを出し分けない
              (ログイン済みなのに一瞬「ログイン」リンクが見えるちらつきを避けるため) */}
          {!isPending && session && (
            <ButtonLink to="/app" variant="secondary">
              ダッシュボードへ
            </ButtonLink>
          )}
          {!isPending && !session && (
            <>
              <ButtonLink to="/login" variant="outline">
                ログイン
              </ButtonLink>
              {/* 画面内で最も押してほしい導線のため、朱(CTA色)のボタンにする */}
              <ButtonLink to="/signup" variant="cta" withArrow>
                無料で新規登録
              </ButtonLink>
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
            <Link to="/">
              <BrandLogo />
            </Link>
            <p className="site-footer__lead">
              URL短縮・QRコード生成・掲示物づくりを
              <br />
              まとめてできる、小さなお店のためのサービス
            </p>
          </div>
          {FOOTER_LINK_GROUPS.map((group) => (
            <nav key={group.heading} aria-label={group.heading}>
              <p className="site-footer__heading">{group.heading}</p>
              <ul className="site-footer__links">
                {group.links.map((link) => (
                  <li key={link.label}>{link.to ? <Link to={link.to}>{link.label}</Link> : <a href={link.href}>{link.label}</a>}</li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="site-footer__bottom">
          <span>掲示物のQRコードを読み取った方へ: リンク先の内容は各店舗・施設が管理しています</span>
          <span className="site-footer__copyright">© kyurl.link</span>
        </div>
      </footer>
      {/* 画面遷移のたびにスクロール位置を先頭に戻す(戻る/進むの場合は元の位置を復元する)。
          無いと、利用規約・プライバシーポリシーのような長いページから別ページに遷移した際、
          遷移前のスクロール位置が残ってしまう */}
      <ScrollRestoration />
    </div>
  )
}
