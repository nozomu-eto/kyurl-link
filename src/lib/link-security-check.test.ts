import { afterEach, describe, expect, it, vi } from 'vitest'
import { determineLinkSecurityStatus } from '@/lib/link-security-check'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('determineLinkSecurityStatus', () => {
  it('ヒューリスティックで不審と判定された場合、URLhaus照会をせず"flagged"を返す', async () => {
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const result = await determineLinkSecurityStatus('http://192.168.1.1/login', 'test-api-key')

    expect(result).toBe('flagged')
    // 既に不審と判定済みのため、追加のネットワーク呼び出し(URLhaus照会)は行わない
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('URLHAUS_API_KEYが未設定(undefined)の場合、URLhaus照会を試みず"unscanned"(fail-open)を返す', async () => {
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const result = await determineLinkSecurityStatus('https://example.com/normal-page', undefined)

    expect(result).toBe('unscanned')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('ヒューリスティックを通過し、URLhausが"listed"を返す場合は"flagged"を返す', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ query_status: 'ok' }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch

    const result = await determineLinkSecurityStatus('https://example.com/normal-page', 'test-api-key')
    expect(result).toBe('flagged')
  })

  it('ヒューリスティックを通過し、URLhausが"not_listed"を返す場合は"clean"を返す', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ query_status: 'no_results' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch

    const result = await determineLinkSecurityStatus('https://example.com/normal-page', 'test-api-key')
    expect(result).toBe('clean')
  })

  it('ヒューリスティックを通過したが、URLhaus照会がタイムアウト・エラーになった場合、"不審"とはせず"unscanned"(fail-open)を返す', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('network error')
    }) as typeof fetch

    const result = await determineLinkSecurityStatus('https://example.com/normal-page', 'test-api-key')
    expect(result).toBe('unscanned')
  })
})
