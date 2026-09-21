import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

describe('GET /', () => {
  it('ステータスコード200を返す', async () => {
    const response = await SELF.fetch('https://example.com/')
    expect(response.status).toBe(200)
  })
})
