import { useEffect, useRef, useState } from 'react'

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

// useQrcodeSvgMap: 複数のQRコードのSVGをまとめて取得し、QRコードのid→SVGの対応で返す。
// まとめて印刷の用紙プレビューが、書き出しと同じテンプレートに各掲示物のQRコードを入れるために使う。
// 取得中・取得できなかったQRコードはマップに含まれない。同じidは1回だけ取得し、取得済みのidは取り直さない
export function useQrcodeSvgMap(qrCodeIds: string[]): Record<string, string> {
  const [svgs, setSvgs] = useState<Record<string, string>>({})
  const requestedIdsRef = useRef(new Set<string>())
  const isMountedRef = useRef(true)
  // 依存配列に配列そのものを入れると毎回再実行になるため、idの並びを文字列にして比べる
  const idsKey = [...new Set(qrCodeIds)].sort().join(',')

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    for (const qrCodeId of idsKey.split(',').filter((id) => id !== '')) {
      if (requestedIdsRef.current.has(qrCodeId)) {
        continue
      }
      requestedIdsRef.current.add(qrCodeId)
      fetch(`/api/v1/qrcodes/${qrCodeId}/image`)
        .then((response) => (response.ok ? response.text() : null))
        .then((text) => {
          if (text === null) {
            // 取得できなかったidは、次の機会に取り直せるようにする
            requestedIdsRef.current.delete(qrCodeId)
          } else if (isMountedRef.current) {
            setSvgs((current) => ({ ...current, [qrCodeId]: text }))
          }
        })
        .catch(() => requestedIdsRef.current.delete(qrCodeId))
    }
  }, [idsKey])

  return svgs
}
