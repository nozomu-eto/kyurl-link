/** @jsxImportSource react */
import { generatePosterHtml, getPosterPageSizeMm } from '@/shared/poster-template'
import { useElementWidth } from '@/frontend/lib/use-element-width'

type PosterPreviewProps = {
  title: string
  subtitle: string
  size: 'A6' | 'A5'
  // QRコードのSVG。取得中・取得できなかった場合はnull(QRコードの場所は空く)
  qrCodeSvg: string | null
  // 掲示物に出す短縮URLの文字列。短縮URL経由でない場合はnull(出さない)
  shortUrlText: string | null
}

// 1mmの画面上の大きさ(CSSの1inch=96px、1inch=25.4mm)
const MM_TO_PX = 96 / 25.4

// PosterPreview: 掲示物のプレビュー。書き出しと同じテンプレート(shared/poster-template.ts)のHTMLを
// iframeに表示するので、Browser Renderingを使わずに、書き出し結果と同じ配置・同じ大きさの比率で確認できる。
// 掲示物は実寸(mm)で組まれているため、置かれた場所の幅に合わせて縮小して表示する。
// 文字の書体は、サーバーの書き出し環境のフォントと異なる場合がある。
// iframeにはscript等を許可しない(sandbox)。タイトル等のエスケープはテンプレート側で行っている
export function PosterPreview({ title, subtitle, size, qrCodeSvg, shortUrlText }: PosterPreviewProps) {
  const [containerRef, containerWidth] = useElementWidth<HTMLDivElement>()
  const { width: widthMm, height: heightMm } = getPosterPageSizeMm(size)
  const nativeWidth = widthMm * MM_TO_PX
  const nativeHeight = heightMm * MM_TO_PX
  // 置き場所より大きいときだけ縮小し、拡大はしない。幅が分かる前は等倍
  const scale = containerWidth ? Math.min(1, containerWidth / nativeWidth) : 1

  const html = generatePosterHtml({ title, subtitle: subtitle === '' ? null : subtitle, size, shortUrlText }, qrCodeSvg ?? '')

  return (
    <div ref={containerRef} className="poster-preview-frame">
      {/* 縮小後の大きさは、掲示物サイズと置き場所の幅から計算する動的な値のため、例外的にインラインstyleで指定する */}
      <div className="poster-preview-frame__scaled" style={{ width: nativeWidth * scale, height: nativeHeight * scale }}>
        <iframe
          className="poster-preview-frame__iframe"
          title={`掲示物のプレビュー(${size}縦)`}
          srcDoc={html}
          sandbox=""
          width={nativeWidth}
          height={nativeHeight}
          style={{ transform: `scale(${scale})` }}
        />
      </div>
    </div>
  )
}
