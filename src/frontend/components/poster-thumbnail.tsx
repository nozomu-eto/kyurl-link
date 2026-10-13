/** @jsxImportSource react */
import { useEffect, useRef, useState } from 'react'
import { PosterPreview } from '@/frontend/components/poster-preview'
import { useQrcodeSvg } from '@/frontend/lib/use-qrcode-svg'

type PosterThumbnailProps = {
  title: string
  subtitle: string | null
  size: 'A6' | 'A5'
  qrCodeId: string
}

// 画面の外にあるうちは描画を始めない距離(px)。この距離まで近づいたら先読みして描画する
const PRELOAD_MARGIN_PX = 200

// LoadedThumbnail: 画面に近づいてから描画する中身。QRコードのSVGの取得(useQrcodeSvg)も、
// iframeの生成もここで始まるため、一覧に多数の掲示物があっても、見えていない分は通信も描画もしない
function LoadedThumbnail({ title, subtitle, size, qrCodeId }: PosterThumbnailProps) {
  const qrCodeSvg = useQrcodeSvg(qrCodeId)
  return <PosterPreview title={title} subtitle={subtitle ?? ''} size={size} qrCodeSvg={qrCodeSvg} decorative />
}

// PosterThumbnail: 掲示物一覧のサムネイル。書き出しと同じテンプレートを縮小して表示する(PNG書き出しやBrowser Renderingは使わない)。
// 一覧にiframeを多数並べると重くなるため、画面の近くに来るまでは枠(掲示物と同じ縦横比)だけを出し、
// 近づいたときに初めて描画する(IntersectionObserver)。一度描画したあとはスクロールで外れても残す
export function PosterThumbnail(props: PosterThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isNear, setIsNear] = useState(false)

  useEffect(() => {
    const element = containerRef.current
    if (!element || isNear) {
      return
    }
    // IntersectionObserverが無い環境(古いブラウザ・テスト)では、すぐに描画する
    if (typeof IntersectionObserver === 'undefined') {
      setIsNear(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsNear(true)
          observer.disconnect()
        }
      },
      { rootMargin: `${PRELOAD_MARGIN_PX}px` },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [isNear])

  return (
    <div ref={containerRef} className={`poster-thumbnail poster-thumbnail--${props.size}`} aria-hidden="true">
      {isNear && <LoadedThumbnail {...props} />}
    </div>
  )
}
