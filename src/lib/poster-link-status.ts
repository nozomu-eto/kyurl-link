import { computeLinkDisplayStatus, type LinkDisplayStatus } from '@/lib/link-status'

// 掲示物(poster)に紐づく短縮URLの表示用ステータス。
// active/expired/suspendedはlinkのdisplayStatus(src/lib/link-status.ts)と同じ意味。
// none: QRコードが元URLを直接読み取る(targetType: 'rawUrl')場合、紐づく短縮URL自体が無い
// deleted: 紐づく短縮URLまたはQRコードがソフトデリート済みの場合(リダイレクトは404になるため、
// activeとは表示させない)
export type PosterLinkStatus = LinkDisplayStatus | 'none' | 'deleted'

type PosterLinkStatusQrcodeFields = {
  targetType: 'link' | 'rawUrl'
  deletedAt: Date | null
} | null

type PosterLinkStatusLinkFields = {
  status: 'active' | 'expired' | 'suspended'
  expiresAt: string | null
  moderationStatus: 'none' | 'suspended'
  deletedAt: Date | null
} | null

// GET /api/v1/posters・GET /api/v1/posters/:idで、掲示物一覧・詳細を1回のleftJoin問い合わせ
// (posters → qrcodes → links)で取得した結果からlinkStatusを計算する。
// qrcode・linkはleftJoinの結果nullになりうる(通常は起こらないはずのデータ不整合だが、
// 安全側に倒して'deleted'として扱う)
export function computePosterLinkStatus(qrcode: PosterLinkStatusQrcodeFields, link: PosterLinkStatusLinkFields): PosterLinkStatus {
  if (!qrcode || qrcode.deletedAt !== null) {
    return 'deleted'
  }

  if (qrcode.targetType === 'rawUrl') {
    return 'none'
  }

  if (!link || link.deletedAt !== null) {
    return 'deleted'
  }

  return computeLinkDisplayStatus(link)
}
