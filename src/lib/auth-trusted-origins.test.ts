import { describe, expect, it } from 'vitest'
import { parseTrustedOrigins } from '@/lib/auth-trusted-origins'

describe('parseTrustedOrigins', () => {
  it('未設定・空文字の場合は空配列を返す(本番の動きに影響しない)', () => {
    expect(parseTrustedOrigins(undefined)).toEqual([])
    expect(parseTrustedOrigins('')).toEqual([])
  })

  it('kyurl-linkの個別のプレビューURL(https)は許可する', () => {
    expect(parseTrustedOrigins('https://abc123-kyurl-link.teddies-01yolk.workers.dev')).toEqual(['https://abc123-kyurl-link.teddies-01yolk.workers.dev'])
  })

  it('kyurl-linkのプレビューURL全体に一致するワイルドカード(https://*-kyurl-link.teddies-01yolk.workers.dev)は許可する', () => {
    expect(parseTrustedOrigins('https://*-kyurl-link.teddies-01yolk.workers.dev')).toEqual(['https://*-kyurl-link.teddies-01yolk.workers.dev'])
  })

  it('カンマ区切りで複数指定でき、前後の空白は無視する', () => {
    expect(parseTrustedOrigins(' https://abc123-kyurl-link.teddies-01yolk.workers.dev , https://*-kyurl-link.teddies-01yolk.workers.dev ')).toEqual([
      'https://abc123-kyurl-link.teddies-01yolk.workers.dev',
      'https://*-kyurl-link.teddies-01yolk.workers.dev',
    ])
  })

  // ワイルドカードを使う場合も、kyurl-linkのプレビューURLだけに絞られており、同じアカウントの
  // 他のWorkerや、紛らわしい別のサブドメインまで許可する設定にならないことを確認する
  it.each([
    ['*', 'ワイルドカード1文字だけの指定'],
    ['https://*', 'スキームのみ+ワイルドカード(ホストが無い)'],
    ['https://*.teddies-01yolk.workers.dev', 'アカウント共通ドメイン全体を許可する形(kyurl-link以外のWorkerも信頼してしまう)'],
    ['https://youtube-transcript-mcp.teddies-01yolk.workers.dev', '同じアカウントの別のWorker(youtube-transcript-mcp)のプレビューURL'],
    ['https://tech-watch.teddies-01yolk.workers.dev', '同じアカウントの別のWorker(tech-watch)のプレビューURL'],
    ['https://kyurl-link-evil.teddies-01yolk.workers.dev', 'kyurl-linkを含むが、命名規則(<プレビューID>-kyurl-link)の末尾が違うもの'],
    ['https://kyurl-link.teddies-01yolk.workers.dev', 'プレビューID部分が無く、命名規則に一致しないもの'],
    ['https://*evil-kyurl-link.teddies-01yolk.workers.dev.attacker.net', 'サブドメインの後ろに別ホストを付け足したもの'],
    ['http://abc123-kyurl-link.teddies-01yolk.workers.dev', 'httpsではなくhttp'],
    ['https://abc123-kyurl-link.teddies-01yolk.workers.dev/path', 'パス付き(オリジンとして不正)'],
  ])('安全なパターンに一致しない値(%s: %s)は取り除く', (unsafeOrigin) => {
    expect(parseTrustedOrigins(unsafeOrigin)).toEqual([])
  })

  it('安全な値と安全でない値が混在する場合、安全な値だけを残す', () => {
    expect(
      parseTrustedOrigins('https://*-kyurl-link.teddies-01yolk.workers.dev,https://*.teddies-01yolk.workers.dev,http://abc123-kyurl-link.teddies-01yolk.workers.dev'),
    ).toEqual(['https://*-kyurl-link.teddies-01yolk.workers.dev'])
  })
})
