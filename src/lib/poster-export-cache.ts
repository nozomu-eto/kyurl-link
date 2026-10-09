// GET /api/v1/posters/:id/exportで使う、R2(POSTER_CACHE)のオブジェクトキーを計算する。
// 内容(hashSource)が変わらなければ同じキーになり既存のキャッシュがそのまま使えるが、
// 以下のいずれかが変わると別のキーになり、キャッシュが再生成される:
// - format(pdf/png)
// - paper(a4/fit)。ただしformat=pngの場合はpaper自体を無視する(PNGは常に掲示物1面分のため、
//   paperの値によって出力が変わらない。キーにも含めない)
// - templateVersion(poster-template.tsのPOSTER_TEMPLATE_VERSION)。テンプレートや
//   書き出し設定を変えたら値を上げることで、修正前の誤った内容のPDF/PNGがR2から
//   返り続けることを防ぐ
export type PosterExportCacheKeyInput = {
  posterId: string
  format: 'pdf' | 'png'
  paper: 'a4' | 'fit'
  templateVersion: number
  // ハッシュの計算元(title/subtitle/size/styleOptions/QRコードSVG等、内容によって
  // 変わってほしい値をJSON文字列化したもの)。呼び出し側(posters.ts)で組み立てる
  hashSource: string
}

export async function computePosterExportCacheKey(input: PosterExportCacheKeyInput): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input.hashSource))
  const hash = Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

  // format=pngの場合はpaperをキーに含めない(PNGはpaperを無視するため、a4/fitのどちらで
  // リクエストされても同じキー・同じキャッシュを指すようにする)
  const paperSegment = input.format === 'pdf' ? `/${input.paper}` : ''

  return `${input.posterId}/${input.format}/v${input.templateVersion}${paperSegment}/${hash}`
}

// buildPosterExportHashSource: computePosterExportCacheKeyのhashSourceを組み立てる。
// posters.tsのexportハンドラと、そのキャッシュに事前投入するテスト(rate-limit.test.ts)で
// 同じ手順を共有し、キーの食い違い(キャッシュミス)が起きないようにする。
// キーの並び順やpaperの扱い(pngでは含めない)を変えるとキャッシュが全て無効になる
export type PosterExportHashSourceInput = {
  title: string
  subtitle: string | null
  size: string
  styleOptions: unknown
  qrCodeSvg: string
  format: 'pdf' | 'png'
  paper: 'a4' | 'fit'
}

export function buildPosterExportHashSource(input: PosterExportHashSourceInput): string {
  return JSON.stringify({
    title: input.title,
    subtitle: input.subtitle,
    size: input.size,
    styleOptions: input.styleOptions,
    qrCodeSvg: input.qrCodeSvg,
    paper: input.format === 'pdf' ? input.paper : undefined,
  })
}
