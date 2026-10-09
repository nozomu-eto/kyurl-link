// 掲示物の書き出し(GET /api/v1/posters/:id/export)を呼び、ファイルとして保存する。
// 生成には数秒かかり、失敗(429・403など)すると本文がJSONのエラーになるため、
// リンクで直接開かずにfetchで受け取り、成功したときだけ保存する

export type PosterExportOptions = {
  posterId: string
  format: 'pdf' | 'png'
  // PDFの用紙。a4=A4用紙に並べる(切り取り線付き)、fit=掲示物サイズのまま。PNGでは使わない
  paper: 'a4' | 'fit'
  // 保存するファイル名(拡張子なし)
  fileName: string
}

export type PosterExportResult = { ok: true } | { ok: false; message: string }

export async function downloadPosterExport({ posterId, format, paper, fileName }: PosterExportOptions): Promise<PosterExportResult> {
  const query = format === 'pdf' ? `format=pdf&paper=${paper}` : 'format=png'

  let response: Response
  try {
    response = await fetch(`/api/v1/posters/${posterId}/export?${query}`)
  } catch {
    return { ok: false, message: '書き出しに失敗しました。通信状況を確認して、もう一度お試しください' }
  }

  if (!response.ok) {
    // サーバーの { error: { message } } をそのまま案内する(429の「しばらく時間をおいて…」などもここに入る)
    const body = (await response.json().catch(() => null)) as { error?: { message?: unknown } } | null
    const message = body?.error?.message
    return { ok: false, message: typeof message === 'string' ? message : '書き出しに失敗しました。時間をおいて、もう一度お試しください' }
  }

  const url = URL.createObjectURL(await response.blob())
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${fileName}.${format}`
  anchor.click()
  URL.revokeObjectURL(url)
  return { ok: true }
}
