import { describe, expect, it } from 'vitest'
import { generateShortCode, SHORT_CODE_LENGTH } from '@/lib/short-code'

describe('generateShortCode', () => {
  it(`${SHORT_CODE_LENGTH}文字・英数字のみのコードを生成する`, () => {
    const code = generateShortCode()
    expect(code).toHaveLength(SHORT_CODE_LENGTH)
    expect(code).toMatch(/^[A-Za-z0-9]+$/)
  })

  it('引数で長さを指定できる', () => {
    expect(generateShortCode(12)).toHaveLength(12)
  })

  it('多数回生成しても重複がほぼ発生しない', () => {
    const codes = new Set<string>()
    for (let i = 0; i < 10000; i++) {
      codes.add(generateShortCode())
    }
    // 統計的な厳密性までは求めないが、62^7通りの空間で10000回生成して
    // 重複が1件も無いことを、暗号論的乱数を使っている簡易的な確認として見る
    expect(codes.size).toBe(10000)
  })
})
