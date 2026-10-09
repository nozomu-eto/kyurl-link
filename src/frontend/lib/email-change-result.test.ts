import { describe, expect, it } from 'vitest'
import { describeEmailChangeResult } from '@/frontend/lib/email-change-result'

const currentEmail = 'old@example.com'

describe('describeEmailChangeResult', () => {
  it('?emailChange=が無ければ、案内を出さない(?error=だけが付いていても出さない)', () => {
    expect(describeEmailChangeResult(new URLSearchParams(''), currentEmail)).toBeNull()
    expect(describeEmailChangeResult(new URLSearchParams('error=INVALID_TOKEN'), currentEmail)).toBeNull()
  })

  it('①今のアドレスで承認した後(ログイン中のアドレスが変更後のアドレスと違う)は、新しいアドレスの確認を案内する', () => {
    const result = describeEmailChangeResult(new URLSearchParams({ emailChange: 'new@example.com' }), currentEmail)

    expect(result?.tone).toBe('success')
    expect(result?.message).toContain('new@example.com に確認メールを送りました')
    expect(result?.message).toContain('変更が完了します')
  })

  it('②新しいアドレスの確認が済んだ後(ログイン中のアドレスが変更後のアドレスと同じ)は、変更完了を伝える', () => {
    const result = describeEmailChangeResult(new URLSearchParams({ emailChange: 'New@Example.com' }), 'new@example.com')

    expect(result).toEqual({ tone: 'success', message: 'メールアドレスを New@Example.com に変更しました。' })
  })

  it('リンクの有効期限切れ・無効なリンクは、最初からやり直す案内を出す', () => {
    for (const error of ['TOKEN_EXPIRED', 'INVALID_TOKEN']) {
      const result = describeEmailChangeResult(new URLSearchParams({ emailChange: 'new@example.com', error }), currentEmail)
      expect(result?.tone).toBe('error')
      expect(result?.message).toContain('有効期限が切れているか、無効なリンク')
    }
  })

  it('別のアカウントでログイン中にリンクを開いた場合(INVALID_USER)は、そのことを案内する', () => {
    const result = describeEmailChangeResult(new URLSearchParams({ emailChange: 'new@example.com', error: 'INVALID_USER' }), currentEmail)

    expect(result?.tone).toBe('error')
    expect(result?.message).toContain('別のアカウント')
  })

  it('その他のエラーコードは汎用の文言にする', () => {
    const result = describeEmailChangeResult(new URLSearchParams({ emailChange: 'new@example.com', error: 'SOMETHING' }), currentEmail)

    expect(result?.tone).toBe('error')
  })

  it('メールアドレスの形でない値は表示しない', () => {
    expect(describeEmailChangeResult(new URLSearchParams({ emailChange: '<script>alert(1)</script>' }), currentEmail)).toBeNull()
  })
})
