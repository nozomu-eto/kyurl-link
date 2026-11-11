/** @jsxImportSource react */
import { useOutletContext } from 'react-router'
import { ButtonLink } from '@/frontend/components/button'
import { Page } from '@/frontend/components/page'
import { PosterPreview } from '@/frontend/components/poster-preview'
import { PosterSheetPreview } from '@/frontend/components/poster-sheet-preview'
import { renderQrcodeSvg } from '@/lib/qrcode-image'

type PublicLayoutContext = {
  session: unknown
  isSessionPending: boolean
}

const DEMO_URL = 'https://example.com/'
const DEMO_QR = renderQrcodeSvg(DEMO_URL)

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

      <section className="top-page__demo" aria-labelledby="top-page-demo-heading">
        <div className="top-page__section-heading">
          <p className="top-page__eyebrow">登録前に仕上がりを確認</p>
          <h2 id="top-page-demo-heading">お店で使える掲示物のサンプル</h2>
          <p>以下はデモです。QRコードは安全なサンプルURL（example.com）を開きます。</p>
        </div>
        <div className="top-page__examples">
          <figure className="top-page__example">
            <figcaption><strong>アンケートのお願い</strong><span>A6縦・完成イメージ</span></figcaption>
            <PosterPreview title="アンケートにご協力ください" subtitle="ご来店の感想をお聞かせください" size="A6" qrCodeSvg={DEMO_QR} shortUrlText={null} />
          </figure>
          <figure className="top-page__example">
            <figcaption><strong>LINE公式アカウント</strong><span>A5縦・完成イメージ</span></figcaption>
            <PosterPreview title="LINE公式アカウント" subtitle="友だち追加で最新情報をお届け" size="A5" qrCodeSvg={DEMO_QR} shortUrlText={null} />
          </figure>
        </div>
        <div className="top-page__sheets">
          <figure className="top-page__sheet">
            <figcaption><strong>A6を4面</strong><span>A4縦・切り取り線付き</span></figcaption>
            <PosterSheetPreview size="A6" faces={Array.from({ length: 4 }, (_, index) => ({ title: 'アンケートにご協力ください', subtitle: 'ご来店の感想をお聞かせください', shortUrlText: null, qrCodeSvg: DEMO_QR }))} />
          </figure>
          <figure className="top-page__sheet">
            <figcaption><strong>A5を2面</strong><span>A4横・切り取り線付き</span></figcaption>
            <PosterSheetPreview size="A5" faces={Array.from({ length: 2 }, () => ({ title: 'LINE公式アカウント', subtitle: '友だち追加で最新情報をお届け', shortUrlText: null, qrCodeSvg: DEMO_QR }))} />
          </figure>
        </div>
      </section>

      <section className="top-page__steps" aria-labelledby="top-page-steps-heading">
        <h2 id="top-page-steps-heading">掲示物は3ステップで完成</h2>
        <ol><li><strong>URLを入力</strong><span>案内したいページを指定</span></li><li><strong>案内文を設定</strong><span>タイトルや説明を入力</span></li><li><strong>印刷用PDFを取得</strong><span>A6・A5をA4に面付け</span></li></ol>
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
