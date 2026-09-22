import { describe, expect, it } from 'vitest'
import { checkUrlHeuristics } from '@/lib/url-heuristics'

describe('checkUrlHeuristics', () => {
  it('通常のURLはflaggedにならない', () => {
    const result = checkUrlHeuristics('https://example.com/store/menu')
    expect(result).toEqual({ flagged: false, reasons: [] })
  })

  it('ホスト名がIPアドレスリテラルの場合はflaggedになる', () => {
    const result = checkUrlHeuristics('http://192.168.1.1/login')
    expect(result.flagged).toBe(true)
    expect(result.reasons.some((reason) => reason.includes('IPアドレス'))).toBe(true)
  })

  it("URLに'@'を含む場合(authority混乱攻撃)はflaggedになる", () => {
    const result = checkUrlHeuristics('http://real-example.com@evil.example.com/')
    expect(result.flagged).toBe(true)
    expect(result.reasons.some((reason) => reason.includes('@'))).toBe(true)
  })

  it('ホスト名がPunycode(xn--始まり)の場合はflaggedになる', () => {
    const result = checkUrlHeuristics('https://xn--80ak6aa92e.com/')
    expect(result.flagged).toBe(true)
    expect(result.reasons.some((reason) => reason.includes('Punycode'))).toBe(true)
  })

  it('既知の短縮URLサービスへの再短縮はflaggedになる', () => {
    const result = checkUrlHeuristics('https://bit.ly/abcdef')
    expect(result.flagged).toBe(true)
    expect(result.reasons.some((reason) => reason.includes('再短縮'))).toBe(true)
  })

  it('URL全体が異常に長い(2000文字超)場合はflaggedになる', () => {
    const longUrl = `https://example.com/?q=${'a'.repeat(2000)}`
    const result = checkUrlHeuristics(longUrl)
    expect(result.flagged).toBe(true)
    expect(result.reasons.some((reason) => reason.includes('長い'))).toBe(true)
  })

  it('サブドメインの階層が異常に多い(6階層超)場合はflaggedになる', () => {
    const result = checkUrlHeuristics('https://a.b.c.d.e.f.g.example.com/')
    expect(result.flagged).toBe(true)
    expect(result.reasons.some((reason) => reason.includes('サブドメイン'))).toBe(true)
  })

  it('複数のルールに該当する場合、reasonsに全て含まれる', () => {
    const result = checkUrlHeuristics('http://192.168.1.1@bit.ly/')
    expect(result.flagged).toBe(true)
    expect(result.reasons.length).toBeGreaterThanOrEqual(2)
  })

  it('URLとして解析できない文字列でも例外を投げず、解析できる範囲のルールのみ適用する', () => {
    expect(() => checkUrlHeuristics('not-a-valid-url')).not.toThrow()
  })
})
