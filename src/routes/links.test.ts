import { drizzle } from 'drizzle-orm/d1'
import { env, SELF } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { links } from '@/db/schema'

describe('GET /api/v1/links', () => {
  beforeEach(async () => {
    // テスト用D1(env.DB)に、一覧取得の検証用データを1件insertしておく
    const db = drizzle(env.DB)
    await db.insert(links).values({
      id: 'test-id-1',
      originalUrl: 'https://example.com',
      shortCode: 'abc123',
      status: 'active',
      expiresAt: null,
    })
  })

  it('ステータスコード200と、insertした1件を含むitems/total/limit/offsetを返す', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/links')
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body).toMatchObject({
      items: [
        {
          id: 'test-id-1',
          originalUrl: 'https://example.com',
          shortCode: 'abc123',
          status: 'active',
          expiresAt: null,
        },
      ],
      total: expect.any(Number),
      limit: expect.any(Number),
      offset: expect.any(Number),
    })
  })
})
