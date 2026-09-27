/** @jsxImportSource react */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requestPasswordResetMock } = vi.hoisted(() => ({ requestPasswordResetMock: vi.fn() }))
vi.mock('@/frontend/lib/auth-client', () => ({
  authClient: { requestPasswordReset: requestPasswordResetMock },
}))

import { ResetPasswordRequestPage } from '@/frontend/routes/reset-password-request-page'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/reset-password']}>
      <ResetPasswordRequestPage />
    </MemoryRouter>,
  )
}

describe('ResetPasswordRequestPage', () => {
  beforeEach(() => {
    requestPasswordResetMock.mockReset().mockResolvedValue({ error: null })
  })

  it('送信すると、登録の有無を明かさない案内(有効期限・迷惑メールフォルダの案内を含む)を表示する', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('メールアドレス'), 'someone@example.com')
    await user.click(screen.getByRole('button', { name: '再設定メールを送信' }))

    expect(await screen.findByText('入力されたメールアドレスが登録されている場合、パスワード再設定用のリンクをお送りしました。')).toBeTruthy()
    expect(screen.getByText(/リンクの有効期限は1時間です。一度使うと無効になります。/)).toBeTruthy()
    expect(screen.getByText(/迷惑メールフォルダもご確認ください/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'ログイン画面へ戻る' })).toBeTruthy()
  })

  it('「別のメールアドレスで試す」を押すと入力画面に戻り、入力欄が空になる', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('メールアドレス'), 'someone@example.com')
    await user.click(screen.getByRole('button', { name: '再設定メールを送信' }))
    await screen.findByRole('button', { name: '別のメールアドレスで試す' })

    await user.click(screen.getByRole('button', { name: '別のメールアドレスで試す' }))

    const emailInput = screen.getByLabelText('メールアドレス') as HTMLInputElement
    expect(emailInput.value).toBe('')
  })
})
