import { describe, expect, it } from 'vitest'
import { getCopiedPosterTitle } from '@/frontend/lib/poster-copy'
import { POSTER_TITLE_MAX_LENGTH } from '@/shared/constants/input-limits'

describe('getCopiedPosterTitle', () => {
  it('タイトルの後ろに「のコピー」を付ける', () => {
    expect(getCopiedPosterTitle('秋の新メニュー')).toBe('秋の新メニューのコピー')
  })

  it('ちょうど上限に収まるときは切り詰めない', () => {
    const title = 'あ'.repeat(POSTER_TITLE_MAX_LENGTH - 4)
    expect(getCopiedPosterTitle(title)).toBe(`${title}のコピー`)
  })

  it('上限を超えるときは元のタイトルを切り詰めて、上限の文字数に収める', () => {
    const copied = getCopiedPosterTitle('あ'.repeat(POSTER_TITLE_MAX_LENGTH))
    expect(Array.from(copied)).toHaveLength(POSTER_TITLE_MAX_LENGTH)
    expect(copied.endsWith('のコピー')).toBe(true)
  })
})
