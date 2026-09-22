import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkUrlAgainstUrlhaus } from '@/lib/urlhaus-client'

const originalFetch = globalThis.fetch

afterEach(() => {
  // テスト後は必ず元のfetchに戻す
  globalThis.fetch = originalFetch
})

describe('checkUrlAgainstUrlhaus', () => {
  it("query_status: 'ok'(登録あり)の場合、'listed'を返す", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ query_status: 'ok' }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch

    const result = await checkUrlAgainstUrlhaus('https://malicious.example.com/', 'test-api-key')
    expect(result).toBe('listed')
  })

  it("query_status: 'no_results'(登録なし)の場合、'not_listed'を返す", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ query_status: 'no_results' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch

    const result = await checkUrlAgainstUrlhaus('https://example.com/', 'test-api-key')
    expect(result).toBe('not_listed')
  })

  it('HTTPエラー(失敗)の場合、fail-openとして"unknown"を返す', async () => {
    globalThis.fetch = (async () => new Response('Internal Server Error', { status: 500 })) as typeof fetch

    const result = await checkUrlAgainstUrlhaus('https://example.com/', 'test-api-key')
    expect(result).toBe('unknown')
  })

  it('ネットワークエラー(fetchが例外を投げる)の場合、fail-openとして"unknown"を返す', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('network error')
    }) as typeof fetch

    const result = await checkUrlAgainstUrlhaus('https://example.com/', 'test-api-key')
    expect(result).toBe('unknown')
  })

  it('タイムアウト(応答がtimeoutMsより遅い)の場合、fail-openとして"unknown"を返す', async () => {
    // AbortControllerによるタイムアウトを実際に発火させるため、fetchのsignalがabortされるまで
    // 応答を返さないモックにする(fetchのシグナル対応を模した最小限の実装)
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted', 'AbortError')))
      })) as typeof fetch

    const result = await checkUrlAgainstUrlhaus('https://example.com/', 'test-api-key', { timeoutMs: 50 })
    expect(result).toBe('unknown')
  })

  it('想定外のquery_status(invalid_url等)の場合、fail-openとして"unknown"を返す', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ query_status: 'invalid_url' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch

    const result = await checkUrlAgainstUrlhaus('not-a-valid-url', 'test-api-key')
    expect(result).toBe('unknown')
  })

  it('Auth-Keyヘッダーが正しく送信されている', async () => {
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      void _input
      return new Response(JSON.stringify({ query_status: 'no_results' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    await checkUrlAgainstUrlhaus('https://example.com/', 'my-secret-key')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [, init] = fetchSpy.mock.calls[0]
    const headers = new Headers(init?.headers)
    expect(headers.get('Auth-Key')).toBe('my-secret-key')
  })
})
