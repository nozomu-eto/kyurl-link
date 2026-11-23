/** @jsxImportSource react */
import { useOutletContext } from 'react-router'
import { ButtonLink, buttonClassName } from '@/frontend/components/button'
import { PosterPreview } from '@/frontend/components/poster-preview'
import { PosterSheetPreview } from '@/frontend/components/poster-sheet-preview'
import { renderQrcodeSvg } from '@/lib/qrcode-image'
// 画像はリポジトリ直下のimages/に置いたまま、Viteのアセットimportで取り込む。
// ビルド時にハッシュ付きの/assets/配下へ出力され、Workerの静的アセット配信(ASSETS binding)でそのまま配信される
import surveyPosterA6Image from '../../../images/survey-poster-a6.png'
import urlQrCreatedImage from '../../../images/url-qr-created.png'
import posterEditorImage from '../../../images/poster-editor.png'

type PublicLayoutContext = {
  session: unknown
  isSessionPending: boolean
}

// 実在の店舗サービスに接続しないよう、プレビューのQRコードはexample.comを開くデモ用にする
const DEMO_URL = 'https://example.com/'
const DEMO_QR = renderQrcodeSvg(DEMO_URL)

// ページ内リンクの移動先(掲示物の完成サンプルセクション)
const SAMPLE_SECTION_ID = 'top-page-samples'

const PROBLEMS = [
  {
    title: 'QRコードを作った後の作業が面倒',
    body: [
      'アンケートやSNSのURLをQRコードにしても、それだけでは店頭に掲示する案内として使いにくいことがあります。',
      'タイトルや説明文を付け、印刷しやすい形に整える作業が必要です。',
    ],
  },
  {
    title: '掲示場所に合わせたサイズで印刷したい',
    body: [
      'テーブルには小さな案内を、壁には少し大きな案内を置きたい。',
      '掲示場所に合わせて、用紙サイズやレイアウトを調整したいことがあります。',
    ],
  },
  {
    title: '期間限定の案内を管理したい',
    body: [
      'イベントやキャンペーンなど、一定期間だけ案内したいページもあります。',
      'QRコードを掲示した後でも、案内を終了するタイミングを管理できると便利です。',
    ],
  },
]

const FEATURES = [
  {
    title: 'QRコードと案内文をまとめて作成',
    body: [
      'QRコードの画像を別のデザインツールへ移して、案内文を配置し直す必要はありません。',
      'URL、QRコード、タイトル、説明文をまとめて扱えます。',
    ],
    note: null,
  },
  {
    title: '店頭で使うサイズに対応',
    body: [
      '卓上用のA6、壁面掲示用のA5に対応。',
      'A4への面付け機能を使えば、同じサイズの掲示物をまとめて印刷する際にも利用できます。',
    ],
    note: null,
  },
  {
    title: '短縮URLの公開期間を管理',
    body: [
      '短縮URLには有効期限を設定でき、必要に応じて転送を停止できます。',
      '期間限定のお知らせなど、案内を終了するタイミングを管理したい場合に利用できます。',
    ],
    note: '※作成済みの短縮URLについて、転送先のURLを後から変更する機能はありません。',
  },
  {
    title: '短縮URLのクリック数を確認',
    body: [
      '短縮URL経由でアクセスされた回数を確認できます。',
      '掲示したQRコードから、どれくらいページが開かれているかを把握する際の参考にできます。',
    ],
    note: '※元のURLを直接埋め込むQRコードも作成できます。ただし、その方式ではkyurl.linkによるクリック集計、有効期限・停止設定は適用されません。',
  },
]

// TopPage: 小規模店舗のスタッフ向けに、QR付き掲示物を作って印刷できることを伝える公開トップ(LP)。
// 認証状態はPublicLayoutが購読しているBetter Authのセッションを受け取り、二重取得を避ける。
// 見出しはヒーロー内に2カラムで置くため、Pageの1カラム見出しは使わず、このページ専用の外枠を持つ
export function TopPage() {
  const { session, isSessionPending } = useOutletContext<PublicLayoutContext>()
  const isLoggedIn = Boolean(session)
  // 未ログインなら新規登録、ログイン済みなら掲示物作成へ(ヒーローと最終CTAで共通)
  const createTo = isLoggedIn ? '/app/posters/new' : '/signup'

  return (
    <div className="top-page">
      {/* 1. ファーストビュー */}
      <section className="top-page__section top-page__hero" aria-labelledby="top-page-hero-heading">
        <div className="top-page__inner top-page__hero-grid">
          <div className="top-page__hero-text">
            <p className="top-page__audience">飲食店・カフェ・美容室など、小さなお店のスタッフへ。</p>
            <h1 id="top-page-hero-heading">QRコードを、店頭で使える案内に。</h1>
            <p className="top-page__lead">
              QRコードを作るだけでなく、案内文の作成から印刷用PDFの準備まで。
              <br />
              <strong>kyurl.linkなら、QRコード付きの掲示物をひとつのサービスで作成できます。</strong>
            </p>
            <p className="top-page__lead">
              卓上用のA6サイズ、壁面掲示用のA5サイズに対応。複数の掲示物をA4用紙にまとめて印刷することもできます。
            </p>
            <div className="top-page__actions">
              {!isSessionPending && (
                <ButtonLink to={createTo} variant="cta" size="large" withArrow>
                  QR付き掲示物を作る
                </ButtonLink>
              )}
              <a href={`#${SAMPLE_SECTION_ID}`} className={buttonClassName({ variant: 'outline', size: 'large' })}>
                登録前に仕上がりを見る
              </a>
            </div>
            {!isSessionPending && !isLoggedIn && (
              <p className="top-page__note">※掲示物の作成には無料のアカウント登録が必要です。サンプルは登録せずに確認できます。</p>
            )}
            {!isSessionPending && isLoggedIn && <p className="top-page__note">ログイン中です。掲示物の作成を始められます。</p>}
          </div>
          <figure className="top-page__figure top-page__hero-figure">
            {/* ファーストビューの画像は遅延読み込みせず、すぐ読み込む */}
            <img
              src={surveyPosterA6Image}
              width={298}
              height={420}
              fetchPriority="high"
              alt="アンケートへのご協力をお願いするA6縦の掲示物。タイトルと説明文、アンケートページへのQRコードが配置されている"
            />
            <figcaption>A6サイズの掲示物の制作例</figcaption>
          </figure>
        </div>
      </section>

      {/* 2. 利用者の悩み */}
      <section className="top-page__section" aria-labelledby="top-page-problems-heading">
        <div className="top-page__inner">
          <h2 id="top-page-problems-heading" className="top-page__heading">
            QRコードの案内づくりで、こんなことはありませんか？
          </h2>
          <ul className="top-page__cards top-page__cards--3">
            {PROBLEMS.map((problem) => (
              <li key={problem.title} className="top-page__card">
                <h3>{problem.title}</h3>
                {problem.body.map((text) => (
                  <p key={text}>{text}</p>
                ))}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 3. 解決策 */}
      <section className="top-page__section top-page__band" aria-labelledby="top-page-solution-heading">
        <div className="top-page__inner top-page__solution">
          <h2 id="top-page-solution-heading" className="top-page__heading">
            QRコードの作成から、掲示物の準備まで。
          </h2>
          <p>kyurl.linkは、短縮URL・QRコード・掲示物をまとめて作成・管理できるWebサービスです。</p>
          <p>案内したいURLを登録し、タイトルや説明文を設定すれば、QRコード付きの掲示物を作成できます。</p>
          <p>
            <strong>QRコードを作るところで終わらず、店頭に掲示するためのファイルまで準備できます。</strong>
          </p>
          <ol className="top-page__flow" aria-label="作成の流れ">
            <li>URL</li>
            <li>QRコード・案内文</li>
            <li>印刷用ファイル</li>
          </ol>
        </div>
      </section>

      {/* 4. 掲示物の完成サンプル(ファーストビューの補助リンクの移動先) */}
      <section id={SAMPLE_SECTION_ID} className="top-page__section top-page__samples" aria-labelledby="top-page-samples-heading">
        <div className="top-page__inner">
          <h2 id="top-page-samples-heading" className="top-page__heading">
            お店で使える掲示物のサンプル
          </h2>
          <p className="top-page__intro">作成前に、どのような仕上がりになるか確認できます。</p>

          <div className="top-page__pair">
            <div className="top-page__sample">
              <h3>アンケートのお願い｜A6縦</h3>
              <p>卓上に置く案内を想定したサンプルです。</p>
              <p>来店者アンケートや、お客様の感想を募集する際の案内に利用できます。</p>
              <figure className="top-page__preview">
                <PosterPreview title="アンケートにご協力ください" subtitle="ご来店の感想をお聞かせください" size="A6" qrCodeSvg={DEMO_QR} shortUrlText={null} />
                <figcaption>卓上での利用を想定したA6縦の掲示物</figcaption>
              </figure>
            </div>
            <div className="top-page__sample">
              <h3>LINE公式アカウントのご案内｜A5縦</h3>
              <p>壁面に掲示する案内を想定したサンプルです。</p>
              <p>SNSや店舗のお知らせページなどへの案内に利用できます。</p>
              <figure className="top-page__preview">
                <PosterPreview title="LINE公式アカウント" subtitle="友だち追加で最新情報をお届け" size="A5" qrCodeSvg={DEMO_QR} shortUrlText={null} />
                <figcaption>壁面への掲示を想定したA5縦の掲示物</figcaption>
              </figure>
            </div>
          </div>

          <div className="top-page__sheets-block">
            <h3>A4用紙にまとめて印刷</h3>
            <p>同じサイズの掲示物を複数枚用意したい場合は、A4用紙にまとめたPDFを作成できます。</p>
            <p>A6サイズならA4用紙に4面、A5サイズならA4用紙に2面を配置できます。</p>
            <div className="top-page__pair">
              <figure className="top-page__preview top-page__preview--sheet">
                <PosterSheetPreview
                  size="A6"
                  faces={Array.from({ length: 4 }, () => ({ title: 'アンケートにご協力ください', subtitle: 'ご来店の感想をお聞かせください', shortUrlText: null, qrCodeSvg: DEMO_QR }))}
                />
                <figcaption>A6・4面</figcaption>
              </figure>
              <figure className="top-page__preview top-page__preview--sheet">
                <PosterSheetPreview
                  size="A5"
                  faces={Array.from({ length: 2 }, () => ({ title: 'LINE公式アカウント', subtitle: '友だち追加で最新情報をお届け', shortUrlText: null, qrCodeSvg: DEMO_QR }))}
                />
                <figcaption>A5・2面</figcaption>
              </figure>
            </div>
          </div>
          <p className="top-page__note">
            ※これらは仕上がりを確認するためのサンプルです。公開トップページのプレビューに含まれるQRコードはexample.comを開きます。実際のアンケートやLINE公式アカウントには接続していません。
          </p>
        </div>
      </section>

      {/* 5. 3ステップの使い方 */}
      <section className="top-page__section top-page__band" aria-labelledby="top-page-steps-heading">
        <div className="top-page__inner">
          <h2 id="top-page-steps-heading" className="top-page__heading">
            掲示物は3ステップで作成
          </h2>
          <ol className="top-page__steps">
            <li className="top-page__step">
              <div className="top-page__step-text">
                <p className="top-page__step-number">STEP 1</p>
                <h3>案内したいURLを登録</h3>
                <p>アンケート、予約ページ、SNSなど、お客様に開いてほしいページのURLを登録します。</p>
              </div>
              <figure className="top-page__figure">
                <img
                  src={urlQrCreatedImage}
                  width={960}
                  height={762}
                  loading="lazy"
                  decoding="async"
                  alt="短縮URLとQRコードの作成完了画面。作成された短縮URL、リンク先URL、QRコード、PNG・SVGのダウンロードボタンが表示されている"
                />
                <figcaption>短縮URLとQRコードの作成完了画面</figcaption>
                <a href={urlQrCreatedImage} target="_blank" rel="noopener noreferrer">
                  画像を大きく見る（別タブで開きます）
                </a>
              </figure>
            </li>
            <li className="top-page__step">
              <div className="top-page__step-text">
                <p className="top-page__step-number">STEP 2</p>
                <h3>タイトルと説明文を設定</h3>
                <p>QRコード付きの掲示物に表示するタイトルや説明文を入力し、A6・A5からサイズを選びます。</p>
                <p>仕上がりをプレビューで確認しながら作成できます。</p>
              </div>
              <figure className="top-page__figure top-page__figure--tall">
                <img
                  src={posterEditorImage}
                  width={1177}
                  height={1698}
                  loading="lazy"
                  decoding="async"
                  alt="掲示物エディタの画面。左にQRコードの選択・タイトル・メッセージ・用紙サイズの入力フォーム、右にA6縦の掲示物のプレビューと書き出しの設定が表示されている"
                />
                <figcaption>掲示物エディタ。案内文の入力と完成イメージを確認できます</figcaption>
                <a href={posterEditorImage} target="_blank" rel="noopener noreferrer">
                  画像を大きく見る（別タブで開きます）
                </a>
              </figure>
            </li>
            <li className="top-page__step">
              <div className="top-page__step-text">
                <p className="top-page__step-number">STEP 3</p>
                <h3>PDF・PNGをダウンロード</h3>
                <p>完成した掲示物をPDF・PNGで出力できます。</p>
                <p>必要に応じてA4用紙にまとめたPDFを作成し、印刷して店頭に設置できます。</p>
              </div>
              <figure className="top-page__figure">
                <img
                  src={surveyPosterA6Image}
                  width={298}
                  height={420}
                  loading="lazy"
                  decoding="async"
                  alt="印刷用に出力したA6縦の掲示物。アンケートへのご協力のお願いとQRコードが配置されている"
                />
                <figcaption>印刷用に出力したA6掲示物の制作例</figcaption>
              </figure>
            </li>
          </ol>
        </div>
      </section>

      {/* 6. 主要機能・メリット */}
      <section className="top-page__section" aria-labelledby="top-page-features-heading">
        <div className="top-page__inner">
          <h2 id="top-page-features-heading" className="top-page__heading">
            お店の案内づくりを、ひとつの場所で。
          </h2>
          <ul className="top-page__cards top-page__cards--2">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="top-page__card">
                <h3>{feature.title}</h3>
                {feature.body.map((text) => (
                  <p key={text}>{text}</p>
                ))}
                {feature.note && <p className="top-page__note">{feature.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 7. 最終CTA */}
      <section className="top-page__section top-page__final" aria-labelledby="top-page-final-heading">
        <div className="top-page__inner top-page__final-inner">
          <h2 id="top-page-final-heading" className="top-page__heading">
            QRコード付きの案内を、作ってみませんか？
          </h2>
          <p>アンケートやSNSへの案内、店舗のお知らせなどに。</p>
          <p>URLの登録から掲示物の作成、印刷用ファイルの準備まで、kyurl.linkでまとめて行えます。</p>
          <p>まずはサンプルで仕上がりを確認してください。</p>
          <div className="top-page__actions top-page__actions--center">
            {!isSessionPending && (
              <ButtonLink to={createTo} variant="cta" size="large" withArrow>
                QR付き掲示物を作る
              </ButtonLink>
            )}
            <a href={`#${SAMPLE_SECTION_ID}`} className={buttonClassName({ variant: 'outline', size: 'large' })}>
              掲示物のサンプルを見る
            </a>
          </div>
          {!isLoggedIn && <p className="top-page__note">※作成には無料のアカウント登録が必要です。</p>}
        </div>
      </section>
    </div>
  )
}
