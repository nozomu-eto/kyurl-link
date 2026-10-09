import { useEffect, useState } from 'react'

// useQrcodeSvg: QRコードのSVG(GET /api/v1/qrcodes/:id/image。認証不要の公開エンドポイント)を取得して
// 文字列で返す。掲示物のプレビューが、書き出しと同じテンプレートにSVGを埋め込むために使う。
// qrCodeIdが空・取得に失敗した場合はnull(プレビューではQRコードの場所を空けて表示する)
export function useQrcodeSvg(qrCodeId: string): string | null {
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    if (!qrCodeId) {
      setSvg(null)
      return
    }

    // 切り替え中に古いリクエストの結果で上書きされないよう、アンマウント・再実行で無効にする
    let isCancelled = false
    fetch(`/api/v1/qrcodes/${qrCodeId}/image`)
      .then((response) => (response.ok ? response.text() : null))
      .then((text) => {
        if (!isCancelled) {
          setSvg(text)
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setSvg(null)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [qrCodeId])

  return svg
}
