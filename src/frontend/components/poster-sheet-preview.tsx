/** @jsxImportSource react */
import { useElementWidth } from '@/frontend/lib/use-element-width'
import { generatePosterA4SheetHtml, generatePosterFaceHtml } from '@/shared/poster-template'

export type PosterSheetPreviewFace = {
  title: string
  subtitle: string | null
  // 掲示物に出す短縮URLの文字列。短縮URL経由でない場合はnull
  shortUrlText: string | null
  // QRコードのSVG。取得中・取得できなかった場合はnull(QRコードの場所は空く)
  qrCodeSvg: string | null
}

type PosterSheetPreviewProps = {
  size: 'A6' | 'A5'
  // 用紙の1枚目に並べる面(1〜最大面数)。空いた面は空白のまま
  faces: PosterSheetPreviewFace[]
}

// 1mmの画面上の大きさ(CSSの1inch=96px、1inch=25.4mm)
const MM_TO_PX = 96 / 25.4

// A4用紙の大きさ(mm)。A6は縦向き、A5は横向き(shared/poster-template.tsのA4_SHEET_LAYOUTSと同じ向き)
const SHEET_SIZE_MM = {
  A6: { width: 210, height: 297 },
  A5: { width: 297, height: 210 },
} as const

// PosterSheetPreview: まとめて印刷の、A4用紙1枚目のプレビュー。書き出しと同じテンプレート
// (shared/poster-template.tsのgeneratePosterA4SheetHtml)のHTMLをiframeに表示するので、面の並び・空き・
// 切り取り線が書き出し結果と同じ配置で確認できる。置かれた場所の幅に合わせて縮小して表示する
export function PosterSheetPreview({ size, faces }: PosterSheetPreviewProps) {
  const [containerRef, containerWidth] = useElementWidth<HTMLDivElement>()
  const { width: widthMm, height: heightMm } = SHEET_SIZE_MM[size]
  const nativeWidth = widthMm * MM_TO_PX
  const nativeHeight = heightMm * MM_TO_PX
  const scale = containerWidth ? Math.min(1, containerWidth / nativeWidth) : 1

  const html = generatePosterA4SheetHtml(
    size,
    faces.map((face) => generatePosterFaceHtml({ title: face.title, subtitle: face.subtitle, size, shortUrlText: face.shortUrlText }, face.qrCodeSvg ?? '')),
  )

  return (
    <div ref={containerRef} className="poster-preview-frame">
      {/* 縮小後の大きさは、用紙の大きさと置き場所の幅から計算する動的な値のため、例外的にインラインstyleで指定する */}
      <div className="poster-preview-frame__scaled" style={{ width: nativeWidth * scale, height: nativeHeight * scale }}>
        <iframe
          className="poster-preview-frame__iframe"
          title={`A4用紙1枚目のプレビュー(${size}を${faces.length}面)`}
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
