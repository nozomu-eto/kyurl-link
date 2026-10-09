/** @jsxImportSource react */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { changeEmailMock } = vi.hoisted(() => ({ changeEmailMock: vi.fn() }))
vi.mock('@/frontend/lib/auth-client', () => ({
  authClient: { changeEmail: changeEmailMock },
  translateAuthErrorCode: (code: string | undefined) => `翻訳:${code ?? 'unknown'}`,
}))

import { ChangeEmailDialog } from '@/frontend/components/change-email-dialog'

beforeEach(() => {
  changeEmailMock.mockReset()
})

describe('ChangeEmailDialog', () => {
  it('送信すると、変更後のアドレスを含むcallbackURL付きで申請し、「今のアドレスに承認メールを送りました」と案内する', async () => {
    const user = userEvent.setup()
    changeEmailMock.mockResolvedValueOnce({ error: null })
    render(<ChangeEmailDialog currentEmail="old@example.com" onClose={() => {}} />)

    await user.type(screen.getByLabelText('新しいメールアドレス'), 'new@example.com')
    await user.click(screen.getByRole('button', { name: '承認メールを送る' }))

    expect(changeEmailMock).toHaveBeenCalledWith({
      newEmail: 'new@example.com',
      callbackURL: '/app/account?emailChange=new%40example.com',
    })
    expect(await screen.findByRole('dialog', { name: '承認メールを送りました' })).toBeTruthy()
    expect(screen.getByText('今のアドレス(old@example.com)に承認メールを送りました。')).toBeTruthy()
    // 二段階の流れと、まだ変更されていないこと
    expect(screen.getByText(/new@example.com に確認メールが届きます/)).toBeTruthy()
    expect(screen.getByText(/この時点では、メールアドレスはまだ変更されていません/)).toBeTruthy()
  })

  it('今のメールアドレスと同じ場合(大文字小文字の違いを含む)は、送信せずにエラーを表示する', async () => {
    const user = userEvent.setup()
    render(<ChangeEmailDialog currentEmail="old@example.com" onClose={() => {}} />)

    await user.type(screen.getByLabelText('新しいメールアドレス'), 'Old@Example.com')
    await user.click(screen.getByRole('button', { name: '承認メールを送る' }))

    expect(await screen.findByText('今のメールアドレスと同じです')).toBeTruthy()
    expect(changeEmailMock).not.toHaveBeenCalled()
  })

  it('すでに使われているアドレスでも、Better Authは成功と同じ応答を返すため、画面も同じ案内になる', async () => {
    const user = userEvent.setup()
    // 既存アドレスの場合も { error: null }(登録済みかどうかを推測させない応答)
    changeEmailMock.mockResolvedValueOnce({ error: null })
    render(<ChangeEmailDialog currentEmail="old@example.com" onClose={() => {}} />)

    await user.type(screen.getByLabelText('新しいメールアドレス'), 'already-used@example.com')
    await user.click(screen.getByRole('button', { name: '承認メールを送る' }))

    expect(await screen.findByText('今のアドレス(old@example.com)に承認メールを送りました。')).toBeTruthy()
    // 届かない場合の確認事項として、他で使われていないかも挙げている(使われているかどうかは断定しない)
    expect(screen.getByText(/すでに他のアカウントで使われていないか/)).toBeTruthy()
  })

  it('申請に失敗した場合は、翻訳したエラーを表示し、入力画面のまま', async () => {
    const user = userEvent.setup()
    changeEmailMock.mockResolvedValueOnce({ error: { code: 'VALIDATION_ERROR', message: 'x' } })
    render(<ChangeEmailDialog currentEmail="old@example.com" onClose={() => {}} />)

    await user.type(screen.getByLabelText('新しいメールアドレス'), 'new@example.com')
    await user.click(screen.getByRole('button', { name: '承認メールを送る' }))

    expect(await screen.findByText('翻訳:VALIDATION_ERROR')).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'メールアドレスの変更' })).toBeTruthy()
  })
})
