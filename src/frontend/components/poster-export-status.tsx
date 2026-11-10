/** @jsxImportSource react */
import { useEffect, useState } from 'react'

type PosterExportStatusProps = {
  format: 'pdf' | 'png'
}

// PosterExportStatus: 長時間になりやすい掲示物生成中に、形式に応じた状態と待機案内を表示する。
export function PosterExportStatus({ format }: PosterExportStatusProps) {
  const [isSlow, setIsSlow] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setIsSlow(true), 10_000)
    return () => window.clearTimeout(timer)
  }, [])

  const label = format === 'pdf' ? 'PDF' : 'PNG'

  return (
    <div className="poster-export-status" role="status" aria-live="polite">
      <span className="poster-export-status__spinner" aria-hidden="true" />
      <span>
        {label}を生成しています。画面を閉じずにお待ちください。
        {isSlow && <span className="poster-export-status__slow">通常より時間がかかっています。</span>}
      </span>
    </div>
  )
}
