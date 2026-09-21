import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

describe('GET /api/v1/links', () => {
  it('ステータスコード200と、items/total/limit/offsetを含むレスポンスボディを返す', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/links')
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body).toMatchObject({
      items: expect.any(Array),
      total: expect.any(Number),
      limit: expect.any(Number),
      offset: expect.any(Number),
    })
  })
})
