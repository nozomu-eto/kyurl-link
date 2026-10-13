/** @jsxImportSource react */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getQrcodeMock, patchQrcodeMock, deleteQrcodeMock } = vi.hoisted(() => ({
  getQrcodeMock: vi.fn(),
  patchQrcodeMock: vi.fn(),
  deleteQrcodeMock: vi.fn(),
}))
vi.mock('@/frontend/lib/api-client', () => ({
  apiClient: { api: { v1: { qrcodes: { ':id': { $get: getQrcodeMock, $patch: patchQrcodeMock, $delete: deleteQrcodeMock } } } } },
}))

import { QrCodeEditorPage, qrcodeEditorLoader } from '@/frontend/routes/app/qrcode-editor-page'

const qrcode = {
  id: 'qr-1',
  targetType: 'link',
  targetId: 'link-1',
  targetUrl: null,
  name: '店頭A5ポスター用',
  createdAt: '2026-09-21T00:00:00.000Z',
  targetShortCode: 'Ab3xK9',
  posterCount: 1,
}

function renderQrCodeEditorPage(data = qrcode) {
  getQrcodeMock.mockResolvedValue({ ok: true, json: async () => data })
  const router = createMemoryRouter(
    [
      { path: '/app/qrcodes', element: <p>QRコード一覧</p> },
      { path: '/app/qrcodes/:qrCodeId', element: <QrCodeEditorPage />, loader: qrcodeEditorLoader },
    ],
    { initialEntries: ['/app/qrcodes/qr-1'] },
  )
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  getQrcodeMock.mockReset()
  patchQrcodeMock.mockReset()
  deleteQrcodeMock.mockReset()
})

describe('QrCodeEditorPage', () => {
  it('見出しに名前、読み取り先に短縮URL、掲示物の件数を表示する', async () => {
    renderQrCodeEditorPage()

    expect(await screen.findByRole('heading', { level: 1, name: '店頭A5ポスター用のQRコード' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Ab3xK9/ }).getAttribute('href')).toBe('/app/links/link-1')
    expect(screen.getByText(/このQRコードを使った掲示物:/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '1件' }).getAttribute('href')).toBe('/app/posters')
  })

  it('名前なしの場合は、作成日付きの「名前なし」を見出しに使う', async () => {
    renderQrCodeEditorPage({ ...qrcode, name: null as unknown as string })

    expect(await screen.findByRole('heading', { level: 1, name: '名前なし(9/21作成)のQRコード' })).toBeTruthy()
  })

  it('ダウンロードは、PNGは512/1024/2048pxを選べ(初期1024)、SVGではサイズ選択が消える', async () => {
    const user = userEvent.setup()
    renderQrCodeEditorPage()

    const downloadLink = await screen.findByRole('link', { name: 'ダウンロード' })
    expect(downloadLink.getAttribute('href')).toBe('/api/v1/qrcodes/qr-1/image?format=png&size=1024')

    await user.selectOptions(screen.getByLabelText('画像サイズ'), '2048')
    expect(downloadLink.getAttribute('href')).toBe('/api/v1/qrcodes/qr-1/image?format=png&size=2048')

    await user.click(screen.getByRole('radio', { name: /SVG/ }))
    expect(downloadLink.getAttribute('href')).toBe('/api/v1/qrcodes/qr-1/image?format=svg')
    expect(screen.queryByLabelText('画像サイズ')).toBeNull()
  })

  it('名前を変更すると保存でき、「変更を取り消す」で保存済みの名前に戻る', async () => {
    const user = userEvent.setup()
    patchQrcodeMock.mockResolvedValue({ ok: true, json: async () => ({ ...qrcode, name: '新しい名前' }) })
    renderQrCodeEditorPage()

    const saveButton = (await screen.findByRole('button', { name: '変更を保存' })) as HTMLButtonElement
    expect(saveButton.disabled).toBe(true)

    const nameInput = screen.getByLabelText(/名前/) as HTMLInputElement
    await user.clear(nameInput)
    await user.type(nameInput, '一時的な名前')
    await user.click(screen.getByRole('button', { name: '変更を取り消す' }))
    expect(nameInput.value).toBe('店頭A5ポスター用')

    await user.clear(nameInput)
    await user.type(nameInput, '新しい名前')
    await user.click(saveButton)

    await waitFor(() => expect(patchQrcodeMock).toHaveBeenCalledWith({ param: { id: 'qr-1' }, json: { name: '新しい名前' } }))
    expect(await screen.findByText('名前を保存しました')).toBeTruthy()
    expect(await screen.findByRole('heading', { level: 1, name: '新しい名前のQRコード' })).toBeTruthy()
  })

  it('掲示物の作成は、A6/A5のサイズを引き継いで掲示物作成画面へ進む', async () => {
    renderQrCodeEditorPage()

    expect((await screen.findByRole('link', { name: 'A6サイズで作成' })).getAttribute('href')).toBe('/app/qrcodes/qr-1/posters/new?size=A6')
    expect(screen.getByRole('link', { name: 'A5サイズで作成' }).getAttribute('href')).toBe('/app/qrcodes/qr-1/posters/new?size=A5')
  })

  it('削除ボタンは画面上の削除ボタン(danger-outline)で、確認の後に削除して一覧へ戻る', async () => {
    const user = userEvent.setup()
    deleteQrcodeMock.mockResolvedValue({ ok: true })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderQrCodeEditorPage()

    const deleteButton = await screen.findByRole('button', { name: 'このQRコードを削除' })
    expect(deleteButton.className).toContain('button--danger-outline')
    await user.click(deleteButton)

    await waitFor(() => expect(deleteQrcodeMock).toHaveBeenCalledWith({ param: { id: 'qr-1' } }))
    expect(await screen.findByText('QRコード一覧')).toBeTruthy()
  })
})
