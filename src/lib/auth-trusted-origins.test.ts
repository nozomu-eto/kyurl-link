import { describe, expect, it } from 'vitest'
import { parseTrustedOrigins } from '@/lib/auth-trusted-origins'

describe('parseTrustedOrigins', () => {
  it('未設定・空文字の場合は空配列を返す(本番の動きに影響しない)', () => {
    expect(parseTrustedOrigins(undefined)).toEqual([])
    expect(parseTrustedOrigins('')).toEqual([])
  })

  it('teddies-01yolk.workers.devのサブドメイン(https)は許可する', () => {
    expect(parseTrustedOrigins('https://abc123.teddies-01yolk.workers.dev')).toEqual(['https://abc123.teddies-01yolk.workers.dev'])
  })

  it('サブドメイン部分のワイルドカード(https://*.teddies-01yolk.workers.dev)は許可する', () => {
    expect(parseTrustedOrigins('https://*.teddies-01yolk.workers.dev')).toEqual(['https://*.teddies-01yolk.workers.dev'])
  })

  it('カンマ区切りで複数指定でき、前後の空白は無視する', () => {
    expect(parseTrustedOrigins(' https://abc123.teddies-01yolk.workers.dev , https://*.teddies-01yolk.workers.dev ')).toEqual([
      'https://abc123.teddies-01yolk.workers.dev',
      'https://*.teddies-01yolk.workers.dev',
    ])
  })

  // ワイルドカードを使う場合も任意の接続元を許可する設定にならないことを確認する
  it.each([
    ['*', 'ワイルドカード1文字だけの指定'],
    ['https://*', 'スキームのみ+ワイルドカード(ホストが無い)'],
    ['https://*evil.com', 'teddies-01yolk.workers.dev以外のホストへのワイルドカード'],
    ['https://*.evil.com.teddies-01yolk.workers.dev.attacker.net', 'サブドメインの後ろに別ホストを付け足したもの'],
    ['https://teddies-01yolk.workers.dev.attacker.net', 'ホスト名の前方一致だけを狙ったなりすまし'],
    ['http://abc123.teddies-01yolk.workers.dev', 'httpsではなくhttp'],
    ['https://abc123.teddies-01yolk.workers.dev/path', 'パス付き(オリジンとして不正)'],
    ['https://abc.def.teddies-01yolk.workers.dev', '2段以上のサブドメイン(想定するワイルドカードの粒度を超える)'],
  ])('安全なパターンに一致しない値(%s: %s)は取り除く', (unsafeOrigin) => {
    expect(parseTrustedOrigins(unsafeOrigin)).toEqual([])
  })

  it('安全な値と安全でない値が混在する場合、安全な値だけを残す', () => {
    expect(parseTrustedOrigins('https://*.teddies-01yolk.workers.dev,https://*,http://abc123.teddies-01yolk.workers.dev')).toEqual([
      'https://*.teddies-01yolk.workers.dev',
    ])
  })
})
