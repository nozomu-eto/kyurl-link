/** @jsxImportSource react */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { postLinkMock, postQrcodeMock } = vi.hoisted(() => ({ postLinkMock: vi.fn(), postQrcodeMock: vi.fn() }))
vi.mock('@/frontend/lib/api-client', () => ({
  apiClient: { api: { v1: { links: { $post: postLinkMock }, qrcodes: { $post: postQrcodeMock } } } },
}))

import { LinkCreatePage } from '@/frontend/routes/app/link-create-page'

// 遷移先のURLを画面に出すだけのダミー(完了画面そのものはlink-created-page.test.tsxで検証する)
function LocationProbe() {
  const location = useLocation()
  return <p data-testid="location">{location.pathname + location.search}</p>
}

function renderLinkCreatePage() {
  const router = createMemoryRouter(
    [
      { path: '/app/links/new', element: <LinkCreatePage /> },
      { path: '/app/links/:linkId/created', element: <LocationProbe /> },
    ],
    { initialEntries: ['/app/links/new'] },
  )
  return render(<RouterProvider router={router} />)
}

function okResponse(body: unknown) {
  return { ok: true, json: async () => body }
}

function errorResponse(code: string, message: string) {
  return { ok: false, json: async () => ({ error: { code, message } }) }
}

const createdLink = { id: 'link-1', shortCode: 'Ab3xK9' }

beforeEach(() => {
  postLinkMock.mockReset()
  postQrcodeMock.mockReset()
})

describe('LinkCreatePage', () => {
  it('既定は「無期限」「QRコードも一緒に作成」で、QRの名前欄が表示される', () => {
    renderLinkCreatePage()

    expect(screen.getByRole('button', { name: '無期限' }).getAttribute('aria-pressed')).toBe('true')
    expect((screen.getByRole('checkbox', { name: 'QRコードも一緒に作成する' }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByLabelText(/QRコードの名前/)).toBeTruthy()
  })

  it('日付を指定すると、その日の23:59:59.999(日本時間)で短縮URLを作成し、続けてQRコードを作成して完了画面へ遷移する', async () => {
    const user = userEvent.setup()
    postLinkMock.mockResolvedValueOnce(okResponse(createdLink))
    postQrcodeMock.mockResolvedValueOnce(okResponse({ id: 'qr-1' }))
    renderLinkCreatePage()

    await user.type(screen.getByLabelText(/案内したいページのURL/), 'https://example.com/menu')
    await user.click(screen.getByRole('button', { name: '日付を指定' }))
    await user.type(screen.getByLabelText('期限の日付'), '2099-12-31')
    await user.type(screen.getByLabelText(/QRコードの名前/), '店頭ポスター用')
    await user.click(screen.getByRole('button', { name: '短縮URLを作成' }))

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/app/links/link-1/created?qrcodeId=qr-1'))
    expect(postLinkMock).toHaveBeenCalledWith({ json: { originalUrl: 'https://example.com/menu', expiresAt: '2099-12-31T14:59:59.999Z' } })
    expect(postQrcodeMock).toHaveBeenCalledWith({ json: { targetType: 'link', targetId: 'link-1', name: '店頭ポスター用' } })
  })

  it('QRコードのチェックを外すと、QRコードは作成せずに完了画面へ遷移する', async () => {
    const user = userEvent.setup()
    postLinkMock.mockResolvedValueOnce(okResponse(createdLink))
    renderLinkCreatePage()

    await user.type(screen.getByLabelText(/案内したいページのURL/), 'https://example.com/menu')
    await user.click(screen.getByRole('checkbox', { name: 'QRコードも一緒に作成する' }))
    expect(screen.queryByLabelText(/QRコードの名前/)).toBeNull()
    await user.click(screen.getByRole('button', { name: '短縮URLを作成' }))

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/app/links/link-1/created'))
    expect(postQrcodeMock).not.toHaveBeenCalled()
  })

  it('短縮URLの作成に失敗した場合は、エラーを表示してQRコードは作成しない', async () => {
    const user = userEvent.setup()
    postLinkMock.mockResolvedValueOnce(errorResponse('EMAIL_NOT_VERIFIED', 'メールアドレスの確認が必要です'))
    renderLinkCreatePage()

    await user.type(screen.getByLabelText(/案内したいページのURL/), 'https://example.com/menu')
    await user.click(screen.getByRole('button', { name: '短縮URLを作成' }))

    expect(await screen.findByText(/メールアドレスの確認が必要です/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'メールアドレスの確認はこちら' })).toBeTruthy()
    expect(postQrcodeMock).not.toHaveBeenCalled()
  })

  it('QRコードの作成だけが失敗した場合は、短縮URLを重複して作らず、QRコードの作成だけを再試行できる', async () => {
    const user = userEvent.setup()
    postLinkMock.mockResolvedValueOnce(okResponse(createdLink))
    postQrcodeMock.mockResolvedValueOnce(errorResponse('INTERNAL_ERROR', 'QRコードを作成できませんでした')).mockResolvedValueOnce(okResponse({ id: 'qr-1' }))
    renderLinkCreatePage()

    await user.type(screen.getByLabelText(/案内したいページのURL/), 'https://example.com/menu')
    await user.click(screen.getByRole('button', { name: '短縮URLを作成' }))

    // フォームは隠れ、再試行用の表示になる
    const retryButton = await screen.findByRole('button', { name: 'QRコードの作成をやり直す' })
    expect(screen.getByText(/QRコードを作成できませんでした/, { selector: '[role="alert"]' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '短縮URLを作成' })).toBeNull()
    expect(screen.getByRole('link', { name: 'QRコードなしで進む' }).getAttribute('href')).toBe('/app/links/link-1/created')

    await user.click(retryButton)

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/app/links/link-1/created?qrcodeId=qr-1'))
    expect(postLinkMock).toHaveBeenCalledTimes(1)
    expect(postQrcodeMock).toHaveBeenCalledTimes(2)
  })
})
