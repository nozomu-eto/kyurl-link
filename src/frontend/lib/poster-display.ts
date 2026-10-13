import { getPosterShortUrlText } from '@/shared/poster-template'
import type { posterSchema } from '@/shared/schemas/poster'
import type { z } from 'zod'

type PosterLinkStatus = z.infer<typeof posterSchema>['linkStatus']

// リンクが使えない掲示物に添える注意書き(掲示してもQRコードが開けないため、一覧などでも気づけるようにする)
const LINK_WARNING_TEXT: Partial<Record<PosterLinkStatus, string>> = {
  expired: 'リンクが期限切れです',
  suspended: 'リンクが停止中です',
  deleted: 'リンクが削除されています',
}

// getPosterLinkWarning: 注意書き。リンクが使える(または直接指定の)場合はnull
export function getPosterLinkWarning(linkStatus: PosterLinkStatus): string | null {
  return LINK_WARNING_TEXT[linkStatus] ?? null
}

// getPosterShortUrlDisplay: 掲示物に出す短縮URLの文字列。編集画面のプレビューと同じく、QRコードに埋め込まれる内容
// (`{origin}/{shortCode}`)から共通の関数で作る。短縮URL経由でなければ(shortCodeがnull)null
export function getPosterShortUrlDisplay(targetShortCode: string | null): string | null {
  return targetShortCode ? getPosterShortUrlText('link', `${window.location.origin}/${targetShortCode}`) : null
}
