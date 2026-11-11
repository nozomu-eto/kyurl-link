/** @jsxImportSource react */
import { useOutletContext } from 'react-router'
import { ButtonLink } from '@/frontend/components/button'
import { Page } from '@/frontend/components/page'

type PublicLayoutContext = {
  session: unknown
  isSessionPending: boolean
}

// TopPage: 小規模店舗向けに、QR付き掲示物を作って印刷できることを案内する公開トップ。
// 認証状態はPublicLayoutが購読しているBetter Authのセッションを受け取り、二重取得を避ける。
export function TopPage() {
  const { session, isSessionPending } = useOutletContext<PublicLayoutContext>()
  const isLoggedIn = Boolean(session)

  return (
    <Page contained title="QRコードを、店頭で使える案内に。">
      <section className="top-page__hero" aria-labelledby="top-page-audience">
        <p className="top-page__audience" id="top-page-audience">
          飲食店・カフェ・美容室など、小さなお店のスタッフへ
        </p>
        <p className="top-page__lead">
          URLを入力するだけでQRコード付きの案内を作成。A4用紙に印刷できるPDFをダウンロードできます。
        </p>
        {!isSessionPending && (
          <div className="top-page__actions">
            <ButtonLink to={isLoggedIn ? '/app/posters/new' : '/signup'} variant="cta" size="large" withArrow>
              QR付き掲示物を作る
            </ButtonLink>
            {!isLoggedIn && <p className="top-page__signup-note">作成には無料登録が必要です</p>}
            {isLoggedIn && <p className="top-page__signup-note">ログイン中です。掲示物の作成を始められます。</p>}
          </div>
        )}
      </section>

      <section className="top-page__features" aria-labelledby="top-page-features-heading">
        <h2 id="top-page-features-heading">お店の案内づくりを、ひとつの場所で</h2>
        <ul>
          <li>メニューや予約ページなどのURLからQRコードを作成</li>
          <li>QRコード付きの掲示物を作り、A4印刷用PDFに書き出し</li>
          <li>短縮URLを発行して、アクセス数を集計</li>
        </ul>
      </section>
    </Page>
  )
}
