import { describe, expect, it } from 'vitest'
import { computePosterBatchExportCacheKey, computePosterExportCacheKey } from '@/lib/poster-export-cache'
import { POSTER_TEMPLATE_VERSION } from '@/shared/poster-template'

describe('computePosterExportCacheKey', () => {
  it('paperが違うと(format=pdfの場合)キーが変わる', async () => {
    const base = { posterId: 'poster-1', format: 'pdf' as const, templateVersion: 1, hashSource: '{}' }
    const a4Key = await computePosterExportCacheKey({ ...base, paper: 'a4' })
    const fitKey = await computePosterExportCacheKey({ ...base, paper: 'fit' })
    expect(a4Key).not.toBe(fitKey)
  })

  it('テンプレートの版(templateVersion)が違うとキーが変わる', async () => {
    const base = { posterId: 'poster-1', format: 'pdf' as const, paper: 'a4' as const, hashSource: '{}' }
    const v1Key = await computePosterExportCacheKey({ ...base, templateVersion: 1 })
    const v2Key = await computePosterExportCacheKey({ ...base, templateVersion: 2 })
    expect(v1Key).not.toBe(v2Key)
  })

  it('版5を使うと旧版4と異なる単体・まとめ印刷のキャッシュキーになる', async () => {
    const hashSource = '{"title":"A5"}'
    const singleV4 = await computePosterExportCacheKey({ posterId: 'poster-1', format: 'pdf', paper: 'fit', templateVersion: 4, hashSource })
    const singleV5 = await computePosterExportCacheKey({ posterId: 'poster-1', format: 'pdf', paper: 'fit', templateVersion: POSTER_TEMPLATE_VERSION, hashSource })
    const batchV4 = await computePosterBatchExportCacheKey({ userId: 'user-1', size: 'A5', templateVersion: 4, items: [{ hashSource, count: 1 }] })
    const batchV5 = await computePosterBatchExportCacheKey({ userId: 'user-1', size: 'A5', templateVersion: POSTER_TEMPLATE_VERSION, items: [{ hashSource, count: 1 }] })

    expect(POSTER_TEMPLATE_VERSION).toBe(5)
    expect(singleV5).toContain('/v5/')
    expect(batchV5).toContain('/v5/')
    expect(singleV5).not.toBe(singleV4)
    expect(batchV5).not.toBe(batchV4)
  })

  it('format=pngの場合、paperが違ってもキーは変わらない(PNGはpaperを無視するため)', async () => {
    const base = { posterId: 'poster-1', format: 'png' as const, templateVersion: 1, hashSource: '{}' }
    const a4Key = await computePosterExportCacheKey({ ...base, paper: 'a4' })
    const fitKey = await computePosterExportCacheKey({ ...base, paper: 'fit' })
    expect(a4Key).toBe(fitKey)
  })

  it('hashSourceが違うとキーが変わる', async () => {
    const base = { posterId: 'poster-1', format: 'pdf' as const, paper: 'a4' as const, templateVersion: 1 }
    const keyA = await computePosterExportCacheKey({ ...base, hashSource: '{"title":"A"}' })
    const keyB = await computePosterExportCacheKey({ ...base, hashSource: '{"title":"B"}' })
    expect(keyA).not.toBe(keyB)
  })

  it('posterIdごとに別のキー(プレフィックス)になる', async () => {
    const base = { format: 'pdf' as const, paper: 'a4' as const, templateVersion: 1, hashSource: '{}' }
    const keyA = await computePosterExportCacheKey({ ...base, posterId: 'poster-a' })
    const keyB = await computePosterExportCacheKey({ ...base, posterId: 'poster-b' })
    expect(keyA.startsWith('poster-a/')).toBe(true)
    expect(keyB.startsWith('poster-b/')).toBe(true)
  })

  it('同じ入力からは常に同じキーになる(決定的である)', async () => {
    const input = { posterId: 'poster-1', format: 'pdf' as const, paper: 'a4' as const, templateVersion: 1, hashSource: '{"a":1}' }
    const first = await computePosterExportCacheKey(input)
    const second = await computePosterExportCacheKey(input)
    expect(first).toBe(second)
  })
})
