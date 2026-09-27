/** @jsxImportSource react */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { useSessionMock, sendVerificationEmailMock, changeEmailMock, getSessionMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  sendVerificationEmailMock: vi.fn(),
  changeEmailMock: vi.fn(),
  getSessionMock: vi.fn(),
}))
vi.mock('@/frontend/lib/auth-client', () => ({
  authClient: {
    useSession: useSessionMock,
    sendVerificationEmail: sendVerificationEmailMock,
    changeEmail: changeEmailMock,
    getSession: getSessionMock,
  },
  translateAuthErrorCode: (code: string | undefined) => code ?? 'error',
}))

import { VerifyEmailPendingPage } from '@/frontend/routes/verify-email-pending-page'

const USER_ID = 'user-1'
const CURRENT_EMAIL = 'owner@example.com'

function mockUnverifiedSession() {
  useSessionMock.mockReturnValue({
    data: { user: { id: USER_ID, email: CURRENT_EMAIL, emailVerified: false } },
    isPending: false,
  })
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/verify-email']}>
      <VerifyEmailPendingPage />
    </MemoryRouter>,
  )
}

describe('VerifyEmailPendingPage: 再送ボタンの60秒の待ち時間(記録の読み取り)', () => {
  // 記録済みの送信時刻からの経過時間を検証するため、この2件のみ日時を固定する。
  // fake timersはuserEvent(クリック操作)と相性が悪く固まるため、クリックを伴うテストとは
  // describeブロックを分離する
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-26T00:00:00Z'))
    sessionStorage.clear()
    mockUnverifiedSession()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('記録から60秒以内は再送ボタンが無効で残り秒数が表示される', () => {
    // 10秒前に送信した記録を残しておく(残り50秒前後のはず)
    sessionStorage.setItem(`verify-email-resent-at:${USER_ID}`, String(Date.now() - 10_000))

    renderPage()

    const button = screen.getByRole('button', { name: /^確認メールを再送\(\d+秒後に再送できます\)$/ }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('記録から60秒以上経過していれば、再送ボタンを押せる', () => {
    // 記録自体はgetRemainingResendSeconds(src/frontend/lib/verify-email-resend-timer.test.ts)で
    // 個別に検証済みのため、ここでは「60秒以上前の記録」を画面が正しく「すぐ押せる」と
    // 判定して表示することだけを確認する
    sessionStorage.setItem(`verify-email-resent-at:${USER_ID}`, String(Date.now() - 120_000))

    renderPage()

    const button = screen.getByRole('button', { name: '確認メールを再送' }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })

  it('記録が無ければ、すぐに再送ボタンを押せる', () => {
    renderPage()

    const button = screen.getByRole('button', { name: '確認メールを再送' }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })
})

describe('VerifyEmailPendingPage: 再送ボタンのクリック', () => {
  beforeEach(() => {
    sessionStorage.clear()
    mockUnverifiedSession()
    sendVerificationEmailMock.mockReset()
    changeEmailMock.mockReset()
    getSessionMock.mockReset()
  })

  it('再送ボタンを押すと確認メールが再送され、60秒のカウントダウンが再度始まる', async () => {
    sendVerificationEmailMock.mockResolvedValueOnce({ error: null })
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: '確認メールを再送' }))

    expect(sendVerificationEmailMock).toHaveBeenCalledWith({ email: CURRENT_EMAIL, callbackURL: '/app' })
    expect(await screen.findByRole('button', { name: '確認メールを再送(60秒後に再送できます)' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('確認メールを再送しました')
  })
})

describe('VerifyEmailPendingPage: メールアドレスの修正', () => {
  beforeEach(() => {
    sessionStorage.clear()
    mockUnverifiedSession()
    sendVerificationEmailMock.mockReset()
    changeEmailMock.mockReset()
    getSessionMock.mockReset()
  })

  it('変更後にセッションのアドレスが変わっていた場合、送信先の表示が更新されトーストが表示される', async () => {
    const newEmail = 'new-owner@example.com'
    changeEmailMock.mockResolvedValueOnce({ error: null })
    getSessionMock.mockResolvedValueOnce({ data: { user: { id: USER_ID, email: newEmail, emailVerified: false } } })
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'メールアドレスを修正する' }))
    await user.type(screen.getByLabelText('新しいメールアドレス'), newEmail)
    await user.click(screen.getByRole('button', { name: 'このアドレスに送り直す' }))

    expect(await screen.findByText(newEmail)).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('新しいメールアドレスに確認メールを送りました')
  })

  it('変更後もセッションのアドレスが変わっていなかった場合(既に使われている等)、専用のエラー文言を表示する', async () => {
    const newEmail = 'already-used@example.com'
    changeEmailMock.mockResolvedValueOnce({ error: null })
    // Better Authは既に使われているアドレスの場合もエラーを返さず、実際には変更しない
    getSessionMock.mockResolvedValueOnce({ data: { user: { id: USER_ID, email: CURRENT_EMAIL, emailVerified: false } } })
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'メールアドレスを修正する' }))
    await user.type(screen.getByLabelText('新しいメールアドレス'), newEmail)
    await user.click(screen.getByRole('button', { name: 'このアドレスに送り直す' }))

    expect(
      await screen.findByText('メールアドレスを変更できませんでした。入力内容をご確認のうえ、別のアドレスをお試しください。'),
    ).toBeTruthy()
    // 「すでに使われている」とは書かない(登録の有無を漏らさないため)
    expect(screen.queryByText(/すでに使われている/)).toBeNull()
  })

  it('今と同じアドレスを指定した場合、専用の文言を表示する', async () => {
    changeEmailMock.mockResolvedValueOnce({ error: { message: 'Email is the same' } })
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'メールアドレスを修正する' }))
    await user.type(screen.getByLabelText('新しいメールアドレス'), CURRENT_EMAIL)
    await user.click(screen.getByRole('button', { name: 'このアドレスに送り直す' }))

    expect(await screen.findByText('今と同じメールアドレスです。別のアドレスを入力してください')).toBeTruthy()
  })
})
