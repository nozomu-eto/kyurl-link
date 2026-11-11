/** @jsxImportSource react */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPosterMock: vi.fn(),
  patchPosterMock: vi.fn(),
  postPosterMock: vi.fn(),
  deletePosterMock: vi.fn(),
  getQrcodesMock: vi.fn(),
  getLinkMock: vi.fn(),
}))
vi.mock('@/frontend/lib/api-client', () => ({
  apiClient: {
    api: {
      v1: {
        posters: { $post: mocks.postPosterMock, ':id': { $get: mocks.getPosterMock, $patch: mocks.patchPosterMock, $delete: mocks.deletePosterMock } },
        qrcodes: { $get: mocks.getQrcodesMock },
        links: { ':id': { $get: mocks.getLinkMock } },
      },
    },
  },
}))

import { PosterEditorPage, posterEditorLoader } from '@/frontend/routes/app/poster-editor-page'

const qrcodes = [
  { id: 'qr-1', targetType: 'link', targetId: 'link-1', targetUrl: null, name: '店頭A5ポスター用', createdAt: '2026-09-21T00:00:00.000Z', targetShortCode: 'Ab3xK9', posterCount: 1 },
  { id: 'qr-2', targetType: 'rawUrl', targetId: null, targetUrl: 'https://example.com/access', name: null, createdAt: '2026-09-21T16:00:00.000Z', targetShortCode: null, posterCount: 0 },
]

function buildPoster(overrides: Record<string, unknown> = {}) {
  return { id: 'poster-1', title: '秋の新メニュー', subtitle: 'ご覧ください', layoutTemplate: 'default', styleOptions: null, size: 'A5', qrCodeId: 'qr-1', linkStatus: 'active', createdAt: '2026-09-26T00:00:00.000Z', qrCodeName: '店頭A5ポスター用', qrCodeCreatedAt: '2026-09-21T00:00:00.000Z', ...overrides }
}

function ok(body: unknown) {
  return { ok: true, json: async () => body }
}

function renderEditor(initialEntry: string) {
  const router = createMemoryRouter(
    [
      { path: '/app/posters', element: <p>掲示物一覧</p> },
      { path: '/app/posters/new', element: <PosterEditorPage />, loader: posterEditorLoader },
      { path: '/app/qrcodes/:qrCodeId/posters/new', element: <PosterEditorPage />, loader: posterEditorLoader },
      { path: '/app/posters/:posterId', element: <PosterEditorPage />, loader: posterEditorLoader },
      { path: '/app/links/:linkId', element: <p>リンク詳細</p> },
    ],
    { initialEntries: [initialEntry] },
  )
  return render(<RouterProvider router={router} />)
}

const fetchMock = vi.fn()

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.getQrcodesMock.mockResolvedValue(ok({ items: qrcodes }))
  fetchMock.mockReset()
  // QRコードのSVG(プレビュー用)と書き出し(PDF/PNG)のどちらもfetchで呼ばれる
  fetchMock.mockImplementation(async (url: string) =>
    url.includes('/export') ? new Response(new Blob(['pdf']), { status: 200 }) : new Response('<svg id="qr"></svg>', { status: 200 }),
  )
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() }))
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('PosterEditorPage: 作成', () => {
  it('QRコードが0件ならフォームを出さず、QR作成への導線を表示する', async () => {
    mocks.getQrcodesMock.mockResolvedValue(ok({ items: [] }))
    renderEditor('/app/posters/new')

    expect(await screen.findByText('掲示物に入れるQRコードを、先に作成しましょう。')).toBeTruthy()
    const createQrLink = screen.getByRole('link', { name: 'URLからQRコードを作る' })
    expect(createQrLink.getAttribute('href')).toBe('/app/qrcodes/new?from=poster')
    expect(screen.queryByLabelText('タイトル(必須)')).toBeNull()
    expect(screen.queryByRole('button', { name: '掲示物を作成' })).toBeNull()
  })

  it('QRコード詳細からのURL(?size=A5)で用紙サイズの初期値が決まり、プレビューに入力内容が反映される', async () => {
    const user = userEvent.setup()
    renderEditor('/app/qrcodes/qr-2/posters/new?size=A5')

    expect(await screen.findByRole('heading', { level: 1, name: '掲示物を作成' })).toBeTruthy()
    expect((screen.getByRole('radio', { name: /A6の2倍/ }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('使うQRコード') as unknown as HTMLSelectElement).value).toBe('qr-2')
    expect(screen.getByText('名前なし(9/22作成)')).toBeTruthy()

    await user.type(screen.getByLabelText('タイトル(必須)'), '営業時間のご案内')
    const preview = screen.getByTitle('掲示物のプレビュー(A5縦)') as HTMLIFrameElement
    // 書き出しと同じテンプレートのHTMLがそのまま入る(QRコードのSVGも埋め込まれる)
    expect(preview.getAttribute('srcdoc')).toContain('営業時間のご案内')
    await waitFor(() => expect((screen.getByTitle('掲示物のプレビュー(A5縦)') as HTMLIFrameElement).getAttribute('srcdoc')).toContain('<svg id="qr">'))
    expect(preview.getAttribute('sandbox')).toBe('')
  })

  it('作成すると、選んだQRコード・用紙サイズ・内容でPOSTし、編集画面へ移る。作成前は書き出せない', async () => {
    const user = userEvent.setup()
    mocks.postPosterMock.mockResolvedValue(ok({ id: 'poster-9' }))
    mocks.getPosterMock.mockResolvedValue(ok(buildPoster({ id: 'poster-9', qrCodeId: 'qr-2', title: '営業時間のご案内', subtitle: null, size: 'A6' })))
    renderEditor('/app/posters/new')

    await screen.findByRole('heading', { level: 1, name: '掲示物を作成' })
    expect((screen.getByRole('button', { name: 'PDFをダウンロード(印刷用)' }) as HTMLButtonElement).disabled).toBe(true)
    await user.type(screen.getByLabelText('タイトル(必須)'), '営業時間のご案内')
    await user.selectOptions(screen.getByLabelText('使うQRコード'), 'qr-2')
    await user.click(screen.getByRole('button', { name: '掲示物を作成' }))

    await waitFor(() => expect(mocks.postPosterMock).toHaveBeenCalledWith({ json: { qrCodeId: 'qr-2', title: '営業時間のご案内', subtitle: null, size: 'A6' } }))
    expect(await screen.findByRole('heading', { level: 1, name: '掲示物の編集(A6縦)' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'プレビュー・書き出し' }).getAttribute('aria-selected')).toBe('true')
    expect((screen.getByRole('button', { name: 'PDFをダウンロード(印刷用)' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText('保存済みです。PDFをダウンロードできます。')).toBeTruthy()
  })

  it('ひとことメッセージの改行は取り除かれる', async () => {
    const user = userEvent.setup()
    renderEditor('/app/posters/new')

    const message = await screen.findByLabelText<HTMLTextAreaElement>('ひとことメッセージ(任意)')
    await user.type(message, 'メニューは{Enter}こちら')

    expect(message.value).toBe('メニューはこちら')
  })

  it('作成に失敗した場合は、サーバーのエラーを表示する(メール未確認なら確認画面への導線も出す)', async () => {
    const user = userEvent.setup()
    mocks.postPosterMock.mockResolvedValue({ ok: false, json: async () => ({ error: { code: 'EMAIL_NOT_VERIFIED', message: 'メールアドレスの確認が必要です' } }) })
    renderEditor('/app/posters/new')

    await user.type(await screen.findByLabelText('タイトル(必須)'), 'テスト')
    await user.click(screen.getByRole('button', { name: '掲示物を作成' }))

    expect(await screen.findByText(/メールアドレスの確認が必要です/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'メールアドレスの確認はこちら' }).getAttribute('href')).toBe('/verify-email')
  })
})

describe('PosterEditorPage: 編集と書き出し', () => {
  it('編集画面では保存済みの内容が入り、変更して保存するとPATCHする', async () => {
    const user = userEvent.setup()
    mocks.getPosterMock.mockResolvedValueOnce(ok(buildPoster()))
    mocks.getPosterMock.mockResolvedValue(ok(buildPoster({ title: '新しいタイトル' })))
    mocks.patchPosterMock.mockResolvedValue(ok(buildPoster({ title: '新しいタイトル' })))
    renderEditor('/app/posters/poster-1')

    const titleInput = await screen.findByLabelText<HTMLInputElement>('タイトル(必須)')
    expect(titleInput.value).toBe('秋の新メニュー')
    await user.clear(titleInput)
    await user.type(titleInput, '新しいタイトル')
    await user.click(screen.getByRole('button', { name: '保存する' }))

    await waitFor(() =>
      expect(mocks.patchPosterMock).toHaveBeenCalledWith({ param: { id: 'poster-1' }, json: { qrCodeId: 'qr-1', title: '新しいタイトル', subtitle: 'ご覧ください', size: 'A5' } }),
    )
    expect(await screen.findByText('保存しました。PDFをダウンロードできます。')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'プレビュー・書き出し' }).getAttribute('aria-selected')).toBe('true')
    await waitFor(() => expect((screen.getByRole('button', { name: 'PDFをダウンロード(印刷用)' }) as HTMLButtonElement).disabled).toBe(false))
  })

  it('保存に失敗しても入力内容を保持し、再試行できる', async () => {
    const user = userEvent.setup()
    mocks.getPosterMock.mockResolvedValue(ok(buildPoster()))
    mocks.patchPosterMock.mockResolvedValue({ ok: false, json: async () => ({ error: { message: '保存できませんでした' } }) })
    renderEditor('/app/posters/poster-1')

    const titleInput = await screen.findByLabelText<HTMLInputElement>('タイトル(必須)')
    await user.clear(titleInput)
    await user.type(titleInput, '入力内容を保持')
    await user.click(screen.getByRole('button', { name: '保存する' }))

    expect(await screen.findByText('保存できませんでした')).toBeTruthy()
    expect(titleInput.value).toBe('入力内容を保持')
    expect((screen.getByRole('button', { name: '保存する' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('未保存の変更がある間は書き出せず、保存を促す', async () => {
    const user = userEvent.setup()
    mocks.getPosterMock.mockResolvedValue(ok(buildPoster()))
    renderEditor('/app/posters/poster-1')

    const pdfButton = (await screen.findByRole('button', { name: 'PDFをダウンロード(印刷用)' })) as HTMLButtonElement
    expect(pdfButton.disabled).toBe(false)
    await user.type(screen.getByLabelText('タイトル(必須)'), '!')

    expect(pdfButton.disabled).toBe(true)
    expect(screen.getByText(/未保存の変更があるためPDFを作成できません/)).toBeTruthy()
  })

  it('書き出し画面に、コンビニ印刷では「A4用紙に並べる」を選ぶ案内があり、用紙の選択肢は用紙サイズに応じて変わる(A5は2枚、A6は4枚)', async () => {
    mocks.getPosterMock.mockResolvedValue(ok(buildPoster({ size: 'A5' })))
    renderEditor('/app/posters/poster-1')

    expect(await screen.findByText(/コンビニで印刷する場合は「A4用紙に並べる」を選んでください/)).toBeTruthy()
    expect(screen.getByText(/A3・A4・B4・B5だけ/)).toBeTruthy()
    expect(screen.getByRole('radio', { name: /A4用紙に2枚並べる/ })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /A5用紙にそのまま/ })).toBeTruthy()
  })

  it('PDFは選んだ用紙(a4/fit)で、PNGは用紙指定なしで、export APIを呼んで保存する', async () => {
    const user = userEvent.setup()
    mocks.getPosterMock.mockResolvedValue(ok(buildPoster()))
    renderEditor('/app/posters/poster-1')

    await user.click(await screen.findByRole('button', { name: 'PDFをダウンロード(印刷用)' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/posters/poster-1/export?format=pdf&paper=a4'))
    expect(await screen.findByText('PDFをダウンロードしました。')).toBeTruthy()

    await user.click(screen.getByRole('radio', { name: /A5用紙にそのまま/ }))
    await user.click(screen.getByRole('button', { name: 'PDFをダウンロード(印刷用)' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/posters/poster-1/export?format=pdf&paper=fit'))

    await user.click(screen.getByRole('button', { name: 'PNGをダウンロード(SNS用)' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/posters/poster-1/export?format=png'))
  })

  it('PDF/PNG生成中は形式に応じた案内を出し、完了後に解除する', async () => {
    const user = userEvent.setup()
    let resolveExport: ((response: Response) => void) | undefined
    fetchMock.mockImplementation((url: string) =>
      url.includes('/export') ? new Promise<Response>((resolve) => { resolveExport = resolve }) : Promise.resolve(new Response('<svg></svg>')),
    )
    mocks.getPosterMock.mockResolvedValue(ok(buildPoster()))
    renderEditor('/app/posters/poster-1')

    await user.click(await screen.findByRole('button', { name: 'PDFをダウンロード(印刷用)' }))
    expect(await screen.findByText('PDFを生成しています。画面を閉じずにお待ちください。')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'PDF生成中…' }) as HTMLButtonElement).disabled).toBe(true)

    resolveExport?.(new Response(new Blob(['pdf']), { status: 200 }))
    await waitFor(() => expect(document.querySelector('.poster-export-status')).toBeNull())

    await user.click(screen.getByRole('button', { name: 'PNGをダウンロード(SNS用)' }))
    expect(await screen.findByText('PNGを生成しています。画面を閉じずにお待ちください。')).toBeTruthy()
    resolveExport?.(new Response(new Blob(['png']), { status: 200 }))
    await waitFor(() => expect(document.querySelector('.poster-export-status')).toBeNull())
  })

  it('通信後のBlob読み込みに失敗しても、エラーを表示して再操作できる', async () => {
    const user = userEvent.setup()
    mocks.getPosterMock.mockResolvedValue(ok(buildPoster()))
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/export')) {
        const response = new Response(new Blob(['pdf']), { status: 200 })
        vi.spyOn(response, 'blob').mockRejectedValue(new Error('blob read failed'))
        return response
      }
      return new Response('<svg></svg>')
    })
    renderEditor('/app/posters/poster-1')

    await user.click(await screen.findByRole('button', { name: 'PDFをダウンロード(印刷用)' }))
    expect(await screen.findByText('書き出しに失敗しました。通信状況を確認して、もう一度お試しください')).toBeTruthy()
    await waitFor(() => expect(document.querySelector('.poster-export-status')).toBeNull())
    expect((screen.getByRole('button', { name: 'PDFをダウンロード(印刷用)' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('通信断でもエラーを表示して書き出しボタンを再度使える', async () => {
    const user = userEvent.setup()
    mocks.getPosterMock.mockResolvedValue(ok(buildPoster()))
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/export')) {
        throw new TypeError('network unavailable')
      }
      return new Response('<svg></svg>')
    })
    renderEditor('/app/posters/poster-1')

    await user.click(await screen.findByRole('button', { name: 'PDFをダウンロード(印刷用)' }))
    expect(await screen.findByText('書き出しに失敗しました。通信状況を確認して、もう一度お試しください')).toBeTruthy()
    await waitFor(() => expect(document.querySelector('.poster-export-status')).toBeNull())
    expect((screen.getByRole('button', { name: 'PDFをダウンロード(印刷用)' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('書き出しに失敗した場合(429など)は、サーバーのエラー文言を表示する', async () => {
    const user = userEvent.setup()
    mocks.getPosterMock.mockResolvedValue(ok(buildPoster()))
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('/export')
        ? new Response(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'リクエストが多すぎます。しばらく時間をおいてから再度お試しください' } }), { status: 429 })
        : new Response('<svg></svg>', { status: 200 }),
    )
    renderEditor('/app/posters/poster-1')

    await user.click(await screen.findByRole('button', { name: 'PDFをダウンロード(印刷用)' }))

    expect(await screen.findByText('リクエストが多すぎます。しばらく時間をおいてから再度お試しください')).toBeTruthy()
  })

  it('リンクが期限切れの掲示物は、書き出す前に確認ダイアログを出し、「このまま書き出す」で書き出す', async () => {
    const user = userEvent.setup()
    mocks.getPosterMock.mockResolvedValue(ok(buildPoster({ linkStatus: 'expired' })))
    mocks.getLinkMock.mockResolvedValue(ok({ id: 'link-1', shortCode: 'Hn2cV5', expiresAt: '2026-08-31T14:59:59.999Z' }))
    renderEditor('/app/posters/poster-1')

    await user.click(await screen.findByRole('button', { name: 'PDFをダウンロード(印刷用)' }))

    const dialog = screen.getByRole('alertdialog', { name: 'この掲示物のQRコードは、今は開けません' })
    expect(within(dialog).getByText('Hn2cV5')).toBeTruthy()
    expect(within(dialog).getByText('2026/08/31 に期限切れになりました')).toBeTruthy()
    expect(within(dialog).getByRole('link', { name: '有効期限を変更して再開' }).getAttribute('href')).toBe('/app/links/link-1')
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/export'))

    await user.click(within(dialog).getByRole('button', { name: 'このまま書き出す' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/posters/poster-1/export?format=pdf&paper=a4'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('リンクが停止中の掲示物も、書き出す前に確認する。有効なリンクの掲示物は確認なしで書き出す', async () => {
    const user = userEvent.setup()
    mocks.getPosterMock.mockResolvedValue(ok(buildPoster({ linkStatus: 'suspended' })))
    mocks.getLinkMock.mockResolvedValue(ok({ id: 'link-1', shortCode: 'Hn2cV5', expiresAt: null }))
    renderEditor('/app/posters/poster-1')

    await user.click(await screen.findByRole('button', { name: 'PNGをダウンロード(SNS用)' }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(within(screen.getByRole('alertdialog')).getByRole('link', { name: '公開設定を確認する' })).toBeTruthy()
  })

  it('削除は確認のあと行い、掲示物一覧へ戻る', async () => {
    const user = userEvent.setup()
    mocks.getPosterMock.mockResolvedValue(ok(buildPoster()))
    mocks.deletePosterMock.mockResolvedValue({ ok: true })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderEditor('/app/posters/poster-1')

    const deleteButton = await screen.findByRole('button', { name: 'この掲示物を削除' })
    expect(deleteButton.className).toContain('button--danger-outline')
    await user.click(deleteButton)

    await waitFor(() => expect(mocks.deletePosterMock).toHaveBeenCalledWith({ param: { id: 'poster-1' } }))
    expect(await screen.findByText('掲示物一覧')).toBeTruthy()
  })
})

describe('PosterEditorPage: スマホのタブ', () => {
  it('「入力」「プレビュー・書き出し」のタブで切り替えられ、入力側のサムネイルからもプレビューへ移れる', async () => {
    const user = userEvent.setup()
    renderEditor('/app/posters/new')

    const previewTab = await screen.findByRole('tab', { name: 'プレビュー・書き出し' })
    const editTab = screen.getByRole('tab', { name: '入力' })
    expect(editTab.getAttribute('aria-selected')).toBe('true')

    await user.click(previewTab)
    expect(previewTab.getAttribute('aria-selected')).toBe('true')
    expect(document.querySelector('.poster-editor')?.getAttribute('data-active-tab')).toBe('preview')

    await user.click(editTab)
    await user.click(screen.getByRole('button', { name: /タップして大きく確認/ }))
    expect(previewTab.getAttribute('aria-selected')).toBe('true')
  })

  it('タブは矢印キーとHome/Endで移動し、ロービングtabindexを更新する', async () => {
    const user = userEvent.setup()
    renderEditor('/app/posters/new')

    const editTab = await screen.findByRole('tab', { name: '入力' })
    const previewTab = screen.getByRole('tab', { name: 'プレビュー・書き出し' })
    expect(editTab.getAttribute('tabindex')).toBe('0')
    expect(previewTab.getAttribute('tabindex')).toBe('-1')

    editTab.focus()
    await user.keyboard('{ArrowRight}')
    expect(previewTab.getAttribute('aria-selected')).toBe('true')
    expect(previewTab.getAttribute('tabindex')).toBe('0')
    expect(document.activeElement).toBe(previewTab)

    await user.keyboard('{Home}')
    expect(editTab.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(editTab)
    await user.keyboard('{End}')
    expect(previewTab.getAttribute('aria-selected')).toBe('true')
  })

  it('未保存の新規掲示物では書き出せない理由と入力へ戻る操作を表示する', async () => {
    const user = userEvent.setup()
    renderEditor('/app/posters/new')

    await user.click(await screen.findByRole('tab', { name: 'プレビュー・書き出し' }))
    expect(screen.getByText(/まだ保存されていないためPDFを作成できません/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'PDFをダウンロード(印刷用)' }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: '入力に戻って保存する' }))
    expect(screen.getByRole('tab', { name: '入力' }).getAttribute('aria-selected')).toBe('true')
  })
})
