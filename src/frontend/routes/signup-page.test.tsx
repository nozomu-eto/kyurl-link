/** @jsxImportSource react */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

// TurnstileWidgetは実際のwindow.turnstile・外部スクリプト読み込みに依存するため、
// このテストでは「検証済みトークンを即座に返すだけのダミー」に差し替える
// (ウィジェット自体の挙動はturnstile-widget.tsxのロジックとして別途検証する対象ではなく、
// ここではチェックボックスによる送信ボタンの活性/非活性のみを検証したいため)
vi.mock('@/frontend/components/turnstile-widget', () => ({
  TurnstileWidget: () => null,
}))

// authClient.signUp.emailは実際には呼ばれない想定(チェック前は送信自体ができない)ため、
// 呼び出しの有無だけ記録できるようにモックする。vi.mockはファイル先頭に巻き上げられるため、
// ファクトリ内で使う変数はvi.hoistedで定義する必要がある
const { signUpEmailMock } = vi.hoisted(() => ({ signUpEmailMock: vi.fn() }))
vi.mock('@/frontend/lib/auth-client', () => ({
  authClient: { signUp: { email: signUpEmailMock } },
  translateAuthErrorCode: (code: string | undefined) => code ?? 'error',
}))

import { SignupPage } from '@/frontend/routes/signup-page'

function renderSignupPage() {
  return render(
    <MemoryRouter initialEntries={['/signup']}>
      <SignupPage />
    </MemoryRouter>,
  )
}

describe('SignupPage: 規約同意チェックボックス', () => {
  it('チェックするまで登録ボタンが押せず、理由が表示される。チェックすると理由の文言が変わり押せるようになる', async () => {
    const user = userEvent.setup()
    renderSignupPage()

    const submitButton = screen.getByRole('button', { name: '登録する' }) as HTMLButtonElement
    expect(submitButton.disabled).toBe(true)
    expect(screen.getByText('同意にチェックを入れると登録できます')).toBeTruthy()
    // ボタンの押せない理由がaria-describedbyで関連付けられていること
    const describedById = submitButton.getAttribute('aria-describedby')
    expect(describedById).toBeTruthy()
    expect(document.getElementById(describedById!)?.textContent).toBe('同意にチェックを入れると登録できます')

    const checkbox = screen.getByRole('checkbox', { name: /利用規約.*プライバシーポリシー.*同意します/ })
    await user.click(checkbox)

    expect(screen.getByText('確認メールを送信します')).toBeTruthy()
    // Turnstileの検証はダミー化しておりトークンが無いため、チェックだけではまだ押せない
    expect(submitButton.disabled).toBe(true)
  })

  it('利用規約・プライバシーポリシーのリンクは別タブで開く(target="_blank" rel="noopener noreferrer")', () => {
    renderSignupPage()

    const termsLink = screen.getByRole('link', { name: '利用規約' })
    expect(termsLink.getAttribute('target')).toBe('_blank')
    expect(termsLink.getAttribute('rel')).toBe('noopener noreferrer')

    const privacyLink = screen.getByRole('link', { name: 'プライバシーポリシー' })
    expect(privacyLink.getAttribute('target')).toBe('_blank')
    expect(privacyLink.getAttribute('rel')).toBe('noopener noreferrer')
  })
})
