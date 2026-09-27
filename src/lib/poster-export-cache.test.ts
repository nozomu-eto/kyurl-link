import { describe, expect, it } from 'vitest'
import { computePosterExportCacheKey } from '@/lib/poster-export-cache'

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
