/** @jsxImportSource react */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { postQrcodeMock } = vi.hoisted(() => ({ postQrcodeMock: vi.fn() }))
vi.mock('@/frontend/lib/api-client', () => ({
  apiClient: { api: { v1: { qrcodes: { $post: postQrcodeMock } } } },
}))

import { QrCodeCreatePage } from '@/frontend/routes/app/qrcode-create-page'

function LocationProbe() {
  return <p data-testid="location">{useLocation().pathname}</p>
}

const selectableLinkItems = [{ id: 'link-1', shortCode: 'Ab3xK9', originalUrl: 'https://example.com/menu' }]

function renderQrCodeCreatePage(loaderData: { fixedLink: unknown; selectableLinkItems: unknown }) {
  const router = createMemoryRouter(
    [
      { path: '/app/qrcodes/new', element: <QrCodeCreatePage />, loader: () => loaderData },
      { path: '/app/qrcodes/:qrCodeId', element: <LocationProbe /> },
    ],
    { initialEntries: ['/app/qrcodes/new'] },
  )
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  postQrcodeMock.mockReset()
})

describe('QrCodeCreatePage', () => {
  it('既定は「作成済みの短縮URL(おすすめ)」で、短縮URLを選んで作成すると詳細画面へ遷移する', async () => {
    const user = userEvent.setup()
    postQrcodeMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'qr-1' }) })
    renderQrCodeCreatePage({ fixedLink: null, selectableLinkItems })

    expect(await screen.findByText('おすすめ')).toBeTruthy()
    expect((screen.getByRole('radio', { name: /作成済みの短縮URL/ }) as HTMLInputElement).checked).toBe(true)
    expect(screen.queryByText(/印刷後に読み取り先を変更できません/)).toBeNull()

    await user.type(screen.getByLabelText(/名前/), '入口の案内用')
    await user.click(screen.getByRole('button', { name: 'QRコードを作成' }))

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/app/qrcodes/qr-1'))
    expect(postQrcodeMock).toHaveBeenCalledWith({ json: { targetType: 'link', targetId: 'link-1', name: '入口の案内用' } })
  })

  it('「URLを直接指定」を選ぶと、変更・集計できない旨の注意と短縮URL作成への導線を表示し、URLで作成できる', async () => {
    const user = userEvent.setup()
    postQrcodeMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'qr-2' }) })
    renderQrCodeCreatePage({ fixedLink: null, selectableLinkItems })

    await user.click(await screen.findByRole('radio', { name: /URLを直接指定/ }))

    expect(screen.getByText(/このQRコードは、印刷後に読み取り先を変更できません/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '短縮URLを作成する' }).getAttribute('href')).toBe('/app/links/new')

    await user.type(screen.getByLabelText('読み取り先のURL'), 'https://www.example-cafe.jp/access')
    await user.click(screen.getByRole('button', { name: 'QRコードを作成' }))

    await waitFor(() => expect(postQrcodeMock).toHaveBeenCalledWith({ json: { targetType: 'rawUrl', targetUrl: 'https://www.example-cafe.jp/access', name: '' } }))
  })

  it('短縮URLが1件も無い場合は、作成ボタンを押せず、短縮URL作成への案内を出す', async () => {
    renderQrCodeCreatePage({ fixedLink: null, selectableLinkItems: [] })

    expect(await screen.findByText(/まだ短縮URLがありません/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'QRコードを作成' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('作成に失敗した場合は、サーバーのエラー文言を表示する', async () => {
    const user = userEvent.setup()
    postQrcodeMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: { code: 'EMAIL_NOT_VERIFIED', message: 'メールアドレスの確認が必要です' } }) })
    renderQrCodeCreatePage({ fixedLink: null, selectableLinkItems })

    await user.click(await screen.findByRole('button', { name: 'QRコードを作成' }))

    expect(await screen.findByText(/メールアドレスの確認が必要です/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'メールアドレスの確認はこちら' })).toBeTruthy()
  })
})
