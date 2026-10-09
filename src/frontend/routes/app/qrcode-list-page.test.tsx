/** @jsxImportSource react */
import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { QrCodeListPage } from '@/frontend/routes/app/qrcode-list-page'

type QrcodeListItem = {
  id: string
  targetType: 'link' | 'rawUrl'
  targetId: string | null
  targetUrl: string | null
  name: string | null
  createdAt: string
  targetShortCode: string | null
  posterCount: number
}

function renderQrCodeListPage(qrcodeListItems: QrcodeListItem[]) {
  const router = createMemoryRouter([{ path: '/', element: <QrCodeListPage />, loader: () => ({ qrcodeListItems }) }], { initialEntries: ['/'] })
  return render(<RouterProvider router={router} />)
}

const linkQrcode: QrcodeListItem = {
  id: 'qr-1',
  targetType: 'link',
  targetId: 'link-1',
  targetUrl: null,
  name: '店頭A5ポスター用',
  createdAt: '2026-09-21T00:00:00.000Z',
  targetShortCode: 'Ab3xK9',
  posterCount: 2,
}
const rawUrlQrcode: QrcodeListItem = {
  id: 'qr-2',
  targetType: 'rawUrl',
  targetId: null,
  targetUrl: 'https://www.instagram.com/example_cafe/',
  name: null,
  // 日本時間では9/22
  createdAt: '2026-09-21T16:00:00.000Z',
  targetShortCode: null,
  posterCount: 0,
}

describe('QrCodeListPage', () => {
  it('0件の場合は案内と作成ボタンを表示する', async () => {
    renderQrCodeListPage([])

    expect(await screen.findByText(/まだQRコードがありません/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '新しいQRコードを作成' }).getAttribute('href')).toBe('/app/qrcodes/new')
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('表に名前・読み取り先・種類・掲示物の件数・作成日・ダウンロード・詳細リンクを表示する', async () => {
    renderQrCodeListPage([linkQrcode, rawUrlQrcode])

    expect(await screen.findByText('全2件')).toBeTruthy()
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)

    const [linkRow, rawUrlRow] = rows
    expect(within(linkRow).getByText('店頭A5ポスター用')).toBeTruthy()
    expect(within(linkRow).getByText('短縮URL経由')).toBeTruthy()
    expect(within(linkRow).getByText('変更・集計できる')).toBeTruthy()
    expect(within(linkRow).getByText('Ab3xK9')).toBeTruthy()
    expect(within(linkRow).getByText('2件')).toBeTruthy()
    expect(within(linkRow).getByText('2026/09/21')).toBeTruthy()
    expect(within(linkRow).getByRole('link', { name: '店頭A5ポスター用をPNGでダウンロード' }).getAttribute('href')).toBe('/api/v1/qrcodes/qr-1/image?format=png&size=1024')
    expect(within(linkRow).getByRole('link', { name: '店頭A5ポスター用をSVGでダウンロード' }).getAttribute('href')).toBe('/api/v1/qrcodes/qr-1/image?format=svg')
    expect(within(linkRow).getByRole('link', { name: '詳細' }).getAttribute('href')).toBe('/app/qrcodes/qr-1')

    // 名前なしは作成日付きで表示し、元URLを直接指定したQRは「変更・集計できない」、掲示物なしは「なし」
    expect(within(rawUrlRow).getByText('名前なし(9/22作成)')).toBeTruthy()
    expect(within(rawUrlRow).getByText('元URLを直接')).toBeTruthy()
    expect(within(rawUrlRow).getByText('変更・集計できない')).toBeTruthy()
    expect(within(rawUrlRow).getByText('https://www.instagram.com/example_cafe/')).toBeTruthy()
    expect(within(rawUrlRow).getByText('なし')).toBeTruthy()
  })

  it('スマホ用のカードにも同じ件数と詳細リンクがある', async () => {
    renderQrCodeListPage([linkQrcode, rawUrlQrcode])

    const cards = (await screen.findAllByRole('listitem')).filter((item) => item.className.includes('qrcode-card'))
    expect(cards).toHaveLength(2)
    expect(within(cards[0]).getByText('掲示物 2件')).toBeTruthy()
    expect(within(cards[1]).getByText('掲示物 なし')).toBeTruthy()
    expect(within(cards[1]).getByRole('link', { name: '詳細' }).getAttribute('href')).toBe('/app/qrcodes/qr-2')
  })
})
