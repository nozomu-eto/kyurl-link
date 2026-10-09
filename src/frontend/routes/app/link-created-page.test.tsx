/** @jsxImportSource react */
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

const { getLinkMock, getQrcodeMock } = vi.hoisted(() => ({ getLinkMock: vi.fn(), getQrcodeMock: vi.fn() }))
vi.mock('@/frontend/lib/api-client', () => ({
  apiClient: { api: { v1: { links: { ':id': { $get: getLinkMock } }, qrcodes: { ':id': { $get: getQrcodeMock } } } } },
}))

import { LinkCreatedPage, linkCreatedLoader } from '@/frontend/routes/app/link-created-page'

const link = { id: 'link-1', shortCode: 'Ab3xK9', originalUrl: 'https://example.com/menu' }

function renderLinkCreatedPage(search: string) {
  const router = createMemoryRouter([{ path: '/app/links/:linkId/created', element: <LinkCreatedPage />, loader: linkCreatedLoader }], {
    initialEntries: [`/app/links/link-1/created${search}`],
  })
  return render(<RouterProvider router={router} />)
}

describe('LinkCreatedPage', () => {
  it('QRコードがある場合は、コピー・PNG/SVGダウンロード・掲示物作成への導線を表示する', async () => {
    getLinkMock.mockResolvedValueOnce({ ok: true, json: async () => link })
    getQrcodeMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'qr-1', targetType: 'link', targetId: 'link-1' }) })
    renderLinkCreatedPage('?qrcodeId=qr-1')

    expect(await screen.findByRole('heading', { level: 1, name: '短縮URLとQRコードを作成しました' })).toBeTruthy()
    expect(screen.getByText('転送先:https://example.com/menu')).toBeTruthy()
    expect(screen.getByRole('button', { name: `${window.location.origin}/Ab3xK9 をコピー` })).toBeTruthy()

    const png = screen.getByRole('link', { name: 'QRコードをPNGでダウンロード' })
    expect(png.getAttribute('href')).toBe('/api/v1/qrcodes/qr-1/image?format=png&size=1024')
    const svg = screen.getByRole('link', { name: 'QRコードをSVGでダウンロード' })
    expect(svg.getAttribute('href')).toBe('/api/v1/qrcodes/qr-1/image?format=svg')

    expect(screen.getByRole('link', { name: /このQRで掲示物を作る/ }).getAttribute('href')).toBe('/app/qrcodes/qr-1/posters/new')
    expect(screen.getByRole('link', { name: /詳細・設定を見る/ }).getAttribute('href')).toBe('/app/links/link-1')
    expect(screen.getByRole('link', { name: /続けて作成する/ }).getAttribute('href')).toBe('/app/links/new')
  })

  it('QRコードが無い場合は、ダウンロードを出さず、QRコードの作成への導線を表示する', async () => {
    getLinkMock.mockResolvedValueOnce({ ok: true, json: async () => link })
    renderLinkCreatedPage('')

    expect(await screen.findByRole('heading', { level: 1, name: '短縮URLを作成しました' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'QRコードをPNGでダウンロード' })).toBeNull()
    expect(screen.getByRole('link', { name: /QRコードを作る/ }).getAttribute('href')).toBe('/app/links/link-1/qrcodes/new')
  })

  it('別の短縮URLのQRコードが指定された場合は、QRコード無しとして扱う', async () => {
    getLinkMock.mockResolvedValueOnce({ ok: true, json: async () => link })
    getQrcodeMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'qr-9', targetType: 'link', targetId: 'other-link' }) })
    renderLinkCreatedPage('?qrcodeId=qr-9')

    expect(await screen.findByRole('heading', { level: 1, name: '短縮URLを作成しました' })).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })
})
