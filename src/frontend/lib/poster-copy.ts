import { POSTER_TITLE_MAX_LENGTH } from '@/shared/constants/input-limits'

// 複製した掲示物に付ける接尾辞
const COPY_TITLE_SUFFIX = 'のコピー'

// getCopiedPosterTitle: 複製した掲示物のタイトル。元のタイトルの後ろに「のコピー」を付ける。
// タイトルの上限(POSTER_TITLE_MAX_LENGTH)を超える場合は、元のタイトルの後ろを切り詰めて、上限に収める
export function getCopiedPosterTitle(title: string): string {
  const keepLength = POSTER_TITLE_MAX_LENGTH - COPY_TITLE_SUFFIX.length
  const baseTitle = Array.from(title).slice(0, keepLength).join('')
  return Array.from(title).length + COPY_TITLE_SUFFIX.length <= POSTER_TITLE_MAX_LENGTH ? `${title}${COPY_TITLE_SUFFIX}` : `${baseTitle}${COPY_TITLE_SUFFIX}`
}
