import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { jsonValidator } from '@/middleware/json-validator'

const schema = z.object({ name: z.string().min(1) })

const app = new Hono().post('/', jsonValidator(schema), (c) => c.json({ name: c.req.valid('json').name }))

function post(body: string) {
  return app.request('/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
}

describe('jsonValidator', () => {
  it('検証に通ったボディをc.req.valid(json)で受け取れる', async () => {
    const res = await post(JSON.stringify({ name: 'a' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ name: 'a' })
  })

  it('スキーマに合わないボディは従来と同じ形のVALIDATION_ERRORを返す', async () => {
    const res = await post(JSON.stringify({ name: '' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'リクエストボディが不正です', details: z.flattenError(schema.safeParse({ name: '' }).error!) },
    })
  })

  it('JSONとして読めないボディも、nullを検証した場合と同じVALIDATION_ERRORを返す', async () => {
    const res = await post('{not json')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'リクエストボディが不正です', details: z.flattenError(schema.safeParse(null).error!) },
    })
  })
})
