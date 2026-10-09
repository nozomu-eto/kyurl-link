import { describe, expect, it } from 'vitest'
import { buildDeletionCompletedEmail, buildRequestReceivedEmail } from '@/lib/account-deletion-emails'

describe('buildRequestReceivedEmail', () => {
  it('「アカウント設定画面から取り消せる」旨の案内を含む', () => {
    const email = buildRequestReceivedEmail(new Date('2026-10-03T00:00:00+09:00'))
    expect(email.text).toContain('アカウント設定画面から削除の申請を取り消してください')
  })

  it('「ログインすると自動的に取り消される」という古い文言を含まない(自動取り消しは廃止済み)', () => {
    const email = buildRequestReceivedEmail(new Date('2026-10-03T00:00:00+09:00'))
    expect(email.text).not.toContain('ログインいただくと')
    expect(email.text).not.toContain('自動的に取り消')
  })
})

describe('buildDeletionCompletedEmail', () => {
  it('件名・本文を返す(内容自体は今回変更していない)', () => {
    const email = buildDeletionCompletedEmail()
    expect(email.subject).toBe('【kyurl.link】アカウント削除が完了しました')
  })
})
