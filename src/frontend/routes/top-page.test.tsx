/** @jsxImportSource react */
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { TopPage } from '@/frontend/routes/top-page'

function renderTopPage(session: unknown, isSessionPending = false) {
  const router = createMemoryRouter([
    {
      path: '/',
      element: <Outlet context={{ session, isSessionPending }} />,
      children: [{ index: true, element: <TopPage /> }],
    },
  ])

  return render(<RouterProvider router={router} />)
}

describe('TopPage', () => {
  it('ファーストビューに見出し・対象者・CTA・補助リンク・画像を表示する', () => {
    renderTopPage(null)

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'QRコードを、店頭で使える案内に。' })).toBeTruthy()
    expect(screen.getByText('飲食店・カフェ・美容室など、小さなお店のスタッフへ。')).toBeTruthy()
    expect(screen.getByText('※掲示物の作成には無料のアカウント登録が必要です。サンプルは登録せずに確認できます。')).toBeTruthy()
    expect(screen.getByText('A6サイズの掲示物の制作例')).toBeTruthy()
    expect(screen.getByRole('link', { name: '登録前に仕上がりを見る' }).getAttribute('href')).toBe('#top-page-samples')
  })

  it('未ログインならCTAは新規登録へ向かう(ヒーローと最終CTAの両方)', () => {
    renderTopPage(null)

    const ctas = screen.getAllByRole('link', { name: 'QR付き掲示物を作る' })
    expect(ctas).toHaveLength(2)
    for (const cta of ctas) expect(cta.getAttribute('href')).toBe('/signup')
    expect(screen.getByText('※作成には無料のアカウント登録が必要です。')).toBeTruthy()
  })

  it('ログイン済みならCTAは掲示物作成へ向かい、登録を勧めない', () => {
    renderTopPage({ user: { id: 'user-1' } })

    for (const cta of screen.getAllByRole('link', { name: 'QR付き掲示物を作る' })) {
      expect(cta.getAttribute('href')).toBe('/app/posters/new')
    }
    expect(screen.queryByText('※作成には無料のアカウント登録が必要です。')).toBeNull()
    expect(screen.getByText('ログイン中です。掲示物の作成を始められます。')).toBeTruthy()
  })

  it('セッション確認中は遷移先が変わるCTAを出さず、ページ内リンクは使える', () => {
    renderTopPage(null, true)

    expect(screen.queryByRole('link', { name: 'QR付き掲示物を作る' })).toBeNull()
    expect(screen.getByRole('link', { name: '登録前に仕上がりを見る' })).toBeTruthy()
  })

  it('サンプルセクションがページ内リンクの移動先IDを持つ', () => {
    const { container } = renderTopPage(null)

    const section = container.querySelector('#top-page-samples')
    expect(section).toBeTruthy()
    expect(section?.querySelector('h2')?.textContent).toBe('お店で使える掲示物のサンプル')
    expect(screen.getByRole('link', { name: '掲示物のサンプルを見る' }).getAttribute('href')).toBe('#top-page-samples')
  })

  it('悩み・解決策・機能の各セクションを表示し、できないことを明記する', () => {
    renderTopPage(null)

    expect(screen.getByRole('heading', { level: 2, name: 'QRコードの案内づくりで、こんなことはありませんか？' })).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 3, name: /QRコードを作った後の作業が面倒|掲示場所に合わせたサイズで印刷したい|期間限定の案内を管理したい/ })).toHaveLength(3)
    expect(screen.getByRole('heading', { level: 2, name: 'QRコードの作成から、掲示物の準備まで。' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'お店の案内づくりを、ひとつの場所で。' })).toBeTruthy()
    expect(screen.getByText('※作成済みの短縮URLについて、転送先のURLを後から変更する機能はありません。')).toBeTruthy()
    expect(screen.getByText(/その方式ではkyurl.linkによるクリック集計、有効期限・停止設定は適用されません/)).toBeTruthy()
  })

  it('完成サンプルとして既存のA6・A5・A4面付けプレビューを表示し、デモ用QRであることを明記する', () => {
    renderTopPage(null)

    expect(screen.getByRole('heading', { level: 3, name: 'アンケートのお願い｜A6縦' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'LINE公式アカウントのご案内｜A5縦' })).toBeTruthy()
    expect(screen.getByText('A6・4面')).toBeTruthy()
    expect(screen.getByText('A5・2面')).toBeTruthy()
    expect(screen.getAllByTitle(/プレビュー/)).toHaveLength(4)
    expect(screen.getByText(/QRコードはexample.comを開きます/)).toBeTruthy()
  })

  it('3ステップの画像にalt・キャプションがあり、画像全体を別タブで開ける', () => {
    renderTopPage(null)

    expect(screen.getByRole('heading', { level: 2, name: '掲示物は3ステップで作成' })).toBeTruthy()
    expect(screen.getByText('短縮URLとQRコードの作成完了画面')).toBeTruthy()
    expect(screen.getByText('掲示物エディタ。案内文の入力と完成イメージを確認できます')).toBeTruthy()
    expect(screen.getByText('印刷用に出力したA6掲示物の制作例')).toBeTruthy()
    for (const img of screen.getAllByRole('img')) expect((img.getAttribute('alt') ?? '').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: /画像を大きく見る/ })).toHaveLength(2)
  })
})
