// QRコードの一覧・詳細で使う表示用の整形処理

type QrcodeLike = { name: string | null; createdAt: string }

// formatMonthDayJst: ISO文字列の日時を、日本時間の「M/D」にする(例: 9/22)
function formatMonthDayJst(isoString: string): string {
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' }).format(new Date(isoString))
}

// getQrcodeDisplayName: 一覧などに表示する名前。名前が未設定の場合は
// 「名前なし(M/D作成)」と作成日で見分けられるようにする(docs/architecture.mdの「画面ごとの確定仕様」)
export function getQrcodeDisplayName(qrcode: QrcodeLike): string {
  return qrcode.name ?? `名前なし(${formatMonthDayJst(qrcode.createdAt)}作成)`
}

// getQrcodeImageUrl: QRコード画像のURL。formatを省略するとSVG(<img>での表示用)。
// PNGはsize(512 / 1024 / 2048)を指定する。認証不要の公開エンドポイント
export function getQrcodeImageUrl(qrcodeId: string, options?: { format: 'png'; size: number } | { format: 'svg' }): string {
  const base = `/api/v1/qrcodes/${qrcodeId}/image`
  if (!options) {
    return base
  }
  return options.format === 'png' ? `${base}?format=png&size=${options.size}` : `${base}?format=svg`
}

// QRコード画像(PNG)のサイズの選択肢(APIのsizeクエリと同じ。初期値は1024)
export const QRCODE_PNG_SIZE_OPTIONS = [512, 1024, 2048] as const
export const DEFAULT_QRCODE_PNG_SIZE = 1024
