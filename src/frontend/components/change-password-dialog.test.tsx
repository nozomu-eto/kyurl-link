/** @jsxImportSource react */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { changePasswordMock } = vi.hoisted(() => ({ changePasswordMock: vi.fn() }))
vi.mock('@/frontend/lib/auth-client', () => ({
  authClient: { changePassword: changePasswordMock },
  translateAuthErrorCode: (code: string | undefined) => `翻訳:${code ?? 'unknown'}`,
}))

import { ChangePasswordDialog } from '@/frontend/components/change-password-dialog'

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, { current = 'old-password1', next = 'new-password1', confirm = 'new-password1' } = {}) {
  await user.type(screen.getByLabelText('今のパスワード'), current)
  await user.type(screen.getByLabelText('新しいパスワード', { exact: true }), next)
  await user.type(screen.getByLabelText('新しいパスワード(確認)'), confirm)
  await user.click(screen.getByRole('button', { name: 'パスワードを変更する' }))
}

beforeEach(() => {
  changePasswordMock.mockReset()
})

describe('ChangePasswordDialog', () => {
  it('入力して送信すると、他の端末のログイン状態を無効にする指定(revokeOtherSessions)付きで変更し、完了の案内を表示する', async () => {
    const user = userEvent.setup()
    changePasswordMock.mockResolvedValueOnce({ error: null })
    render(<ChangePasswordDialog onClose={() => {}} />)

    await fillAndSubmit(user)

    expect(changePasswordMock).toHaveBeenCalledWith({ currentPassword: 'old-password1', newPassword: 'new-password1', revokeOtherSessions: true })
    expect(await screen.findByRole('dialog', { name: 'パスワードを変更しました' })).toBeTruthy()
    expect(screen.getByText('他の端末ではログアウトされました。')).toBeTruthy()
  })

  it('完了後に「閉じる」を押すと、onCloseが呼ばれる', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    changePasswordMock.mockResolvedValueOnce({ error: null })
    render(<ChangePasswordDialog onClose={onClose} />)

    await fillAndSubmit(user)
    await user.click(await screen.findByRole('button', { name: '閉じる' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('確認欄が新しいパスワードと違う場合は、送信せずに確認欄の下にエラーを表示する', async () => {
    const user = userEvent.setup()
    render(<ChangePasswordDialog onClose={() => {}} />)

    await fillAndSubmit(user, { confirm: 'different-password' })

    expect(await screen.findByText('新しいパスワードが一致しません')).toBeTruthy()
    expect(changePasswordMock).not.toHaveBeenCalled()
  })

  it('今のパスワードが違う場合(INVALID_PASSWORD)は、今のパスワード欄の下にエラーを表示し、ダイアログは開いたまま', async () => {
    const user = userEvent.setup()
    changePasswordMock.mockResolvedValueOnce({ error: { code: 'INVALID_PASSWORD', message: 'Invalid password' } })
    render(<ChangePasswordDialog onClose={() => {}} />)

    await fillAndSubmit(user)

    expect(await screen.findByText('今のパスワードが正しくありません')).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'パスワードの変更' })).toBeTruthy()
  })

  it('新しいパスワードが条件を満たさない場合(PASSWORD_TOO_SHORT)は、新しいパスワード欄の下にエラーを表示する', async () => {
    const user = userEvent.setup()
    changePasswordMock.mockResolvedValueOnce({ error: { code: 'PASSWORD_TOO_SHORT', message: 'Password too short' } })
    render(<ChangePasswordDialog onClose={() => {}} />)

    // 画面側のminLengthはブラウザの検証であり、jsdomのsubmitでは働かない場合があるため、サーバーのエラーを直接検証する
    await fillAndSubmit(user, { next: 'short', confirm: 'short' })

    expect(await screen.findByText('新しいパスワードは8文字以上で入力してください')).toBeTruthy()
  })

  it('その他のエラーは、翻訳した汎用の文言を表示する', async () => {
    const user = userEvent.setup()
    changePasswordMock.mockResolvedValueOnce({ error: { code: 'SOMETHING_ELSE', message: 'x' } })
    render(<ChangePasswordDialog onClose={() => {}} />)

    await fillAndSubmit(user)

    await waitFor(() => expect(screen.getByText('翻訳:SOMETHING_ELSE')).toBeTruthy())
  })
})
