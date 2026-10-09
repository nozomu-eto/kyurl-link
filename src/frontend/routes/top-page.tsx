/** @jsxImportSource react */
import { ButtonLink } from '@/frontend/components/button'
import { Page } from '@/frontend/components/page'

// TopPage: 未ログインの訪問者が最初に見るトップページ。
// サービスの概要を説明し、新規登録・ログインへの導線を示すだけの静的な画面。
// エックスサーバー風のLP構成(docs/architecture.mdの「フロントデザインの全面見直し」のモックアップ)への作り替えは保留中のため、
// 内容は変えていない
export function TopPage() {
  return (
    <Page contained title="URLを短くして、QRコードと掲示物まで。">
      <p>
        kyurl.linkは、URL短縮・QRコード生成・店舗掲示物(ポスター)づくりをまとめてできるサービスです。
        飲食店・カフェ・美容室・整体院など、小規模な店舗・施設でのご利用を想定しています。
      </p>
      <ul>
        <li>1つの元URLから複数の短縮URLを発行できます</li>
        <li>短縮URL・元URLどちらにもQRコードを紐づけられます</li>
        <li>QRコードを含む掲示物(A6・A5サイズ)をそのまま印刷用に書き出せます</li>
      </ul>
      <div className="button-group">
        <ButtonLink to="/signup" variant="cta" size="large" withArrow>
          無料で新規登録
        </ButtonLink>
        <ButtonLink to="/login" variant="secondary" size="large">
          ログイン
        </ButtonLink>
      </div>
    </Page>
  )
}
