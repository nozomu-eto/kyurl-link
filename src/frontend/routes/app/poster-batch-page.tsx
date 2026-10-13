/** @jsxImportSource react */
import { useState } from 'react'
import { Link, useLoaderData } from 'react-router'
import type { z } from 'zod'
import { AlertMessage } from '@/frontend/components/alert-message'
import { Button } from '@/frontend/components/button'
import { Card } from '@/frontend/components/card'
import { Page } from '@/frontend/components/page'
import { PosterBatchStoppedDialog } from '@/frontend/components/poster-batch-stopped-dialog'
import { PosterPrintGuide } from '@/frontend/components/poster-print-guide'
import { PosterSheetPreview } from '@/frontend/components/poster-sheet-preview'
import { PosterThumbnail } from '@/frontend/components/poster-thumbnail'
import { RadioCardGroup } from '@/frontend/components/radio-card-group'
import { apiClient } from '@/frontend/lib/api-client'
import { getPosterLinkWarning, getPosterShortUrlDisplay } from '@/frontend/lib/poster-display'
import { downloadPosterBatchExport } from '@/frontend/lib/poster-export'
import { getQrcodeDisplayName } from '@/frontend/lib/qrcode-display'
import { useQrcodeSvgMap } from '@/frontend/lib/use-qrcode-svg'
import { getA4SheetCount, getA4SheetMaxFaces, getPosterBatchMaxFaces, POSTER_BATCH_MAX_SHEETS } from '@/shared/poster-template'
import type { posterSchema } from '@/shared/schemas/poster'

type PosterListItem = z.infer<typeof posterSchema>
type PosterSize = 'A6' | 'A5'

// posterBatchLoader: まとめて印刷の画面に必要な、ログインユーザーの掲示物一覧を取得するloader
export async function posterBatchLoader() {
  const response = await apiClient.api.v1.posters.$get()

  if (!response.ok) {
    throw new Response('掲示物一覧の取得に失敗しました', { status: response.status })
  }

  const body = await response.json()
  return { posterListItems: body.items }
}

const SIZE_OPTIONS = [
  { value: 'A6', label: 'A6', description: 'A4に4枚' },
  { value: 'A5', label: 'A5', description: 'A4に2枚' },
] as const

// PosterBatchPage: 掲示物のまとめて印刷画面(docs/mocks/PosterBatchPrint.html・MobileBatchPrint.html)。
// サイズ(A6=A4に4面、A5=A4に2面。混在不可)を選び、同じサイズの掲示物ごとに枚数を指定して、A4用紙にまとめたPDFを書き出す。
// 空いた面は空白のまま印刷でき、「あと◯枚追加できます」と案内する。上限は1回にA4用紙10枚。
// 1枚目の用紙のプレビューは、書き出しと同じテンプレートで表示する。
// リンクが期限切れ・停止中・削除済みの掲示物が含まれる場合は、書き出す前に該当の掲示物を示して確認する
export function PosterBatchPage() {
  const { posterListItems } = useLoaderData<typeof posterBatchLoader>()

  const [size, setSize] = useState<PosterSize>('A6')
  // 掲示物のid→枚数。0枚の掲示物は含めない
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [isExporting, setIsExporting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isStoppedDialogOpen, setIsStoppedDialogOpen] = useState(false)

  const facesPerSheet = getA4SheetMaxFaces(size)
  const maxFaces = getPosterBatchMaxFaces(size)
  const sizedPosters = posterListItems.filter((item: PosterListItem) => item.size === size)
  const selected = sizedPosters.filter((item: PosterListItem) => (counts[item.id] ?? 0) > 0)
  const totalFaces = selected.reduce((sum: number, item: PosterListItem) => sum + counts[item.id], 0)
  const sheetCount = getA4SheetCount(size, totalFaces)
  const emptySlots = sheetCount * facesPerSheet - totalFaces
  const remainingToLimit = maxFaces - totalFaces

  // 1枚目の用紙に並ぶ面(掲示物を選んだ順ではなく、一覧の並び順に枚数ぶん並べる)
  const firstSheetFaces = selected
    .flatMap((item: PosterListItem) => Array<PosterListItem>(counts[item.id]).fill(item))
    .slice(0, facesPerSheet)
  const qrcodeSvgs = useQrcodeSvgMap(firstSheetFaces.map((item) => item.qrCodeId))

  // リンクが使えない掲示物が選ばれているか(確認ダイアログに出す)
  const stoppedPosters = selected
    .map((item: PosterListItem) => ({ id: item.id, title: item.title, warning: getPosterLinkWarning(item.linkStatus) }))
    .filter((item): item is { id: string; title: string; warning: string } => item.warning !== null)

  function changeCount(item: PosterListItem, delta: number) {
    setCounts((current) => {
      const next = Math.max(0, (current[item.id] ?? 0) + delta)
      return { ...current, [item.id]: next }
    })
  }

  async function runExport() {
    setErrorMessage(null)
    setIsExporting(true)
    const result = await downloadPosterBatchExport({
      size,
      items: selected.map((item: PosterListItem) => ({ posterId: item.id, count: counts[item.id] })),
      fileName: `posters-${size}-A4-${sheetCount}`,
    })
    setIsExporting(false)
    if (!result.ok) {
      setErrorMessage(result.message)
    }
  }

  function handleExportClick() {
    if (stoppedPosters.length > 0) {
      setIsStoppedDialogOpen(true)
      return
    }
    void runExport()
  }

  return (
    <Page
      title="まとめて印刷"
      description="別々の掲示物を、A4用紙にまとめて並べて印刷できます。置き場所ごとに違う掲示物を用意するときに便利です。"
      actions={
        <Link to="/app/posters" className="detail-link">
          掲示物一覧へ戻る
        </Link>
      }
    >
      <Card title="1. サイズを選ぶ">
        <RadioCardGroup legend="掲示物のサイズ" name="poster-batch-size" options={SIZE_OPTIONS} value={size} onChange={setSize}>
          <p className="field__hint">A5とA6は同じ用紙に混ぜられません。サイズごとに分けて印刷してください。</p>
        </RadioCardGroup>
      </Card>

      <Card title="2. 印刷する掲示物と枚数を選ぶ">
        <p className="list-summary">
          {size}の掲示物:{sizedPosters.length}件
        </p>
        {sizedPosters.length === 0 ? (
          <p>
            {size}の掲示物がありません。<Link to="/app/posters/new">掲示物を作成</Link>してください。
          </p>
        ) : (
          <ul className="poster-batch__list">
            {sizedPosters.map((item: PosterListItem) => {
              const count = counts[item.id] ?? 0
              const warning = getPosterLinkWarning(item.linkStatus)
              return (
                <li key={item.id} className="poster-batch__row">
                  <div className="poster-batch__thumbnail">
                    <PosterThumbnail title={item.title} subtitle={item.subtitle} size={item.size} qrCodeId={item.qrCodeId} shortUrlText={getPosterShortUrlDisplay(item.targetShortCode)} />
                  </div>
                  <div className="poster-batch__text">
                    <p className="poster-card__title">{item.title}</p>
                    {item.subtitle && <p className="poster-card__subtitle">{item.subtitle}</p>}
                    <p className="poster-card__meta">
                      <span>QR:{getQrcodeDisplayName({ name: item.qrCodeName, createdAt: item.qrCodeCreatedAt })}</span>
                    </p>
                    {warning && <p className="poster-card__warning">{warning}</p>}
                  </div>
                  <div className="poster-batch__stepper" role="group" aria-label={`${item.title}の枚数`}>
                    <Button variant="outline" aria-label={`${item.title}の枚数を減らす`} disabled={count === 0} onClick={() => changeCount(item, -1)}>
                      −
                    </Button>
                    <span className="poster-batch__count" aria-live="polite">
                      {count}
                    </span>
                    <Button variant="outline" aria-label={`${item.title}の枚数を増やす`} disabled={remainingToLimit <= 0} onClick={() => changeCount(item, 1)}>
                      +
                    </Button>
                    <span>枚</span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card title="3. 仕上がりを確認して書き出す">
        <p className="poster-batch__total">
          合計 <strong>{totalFaces}</strong>枚 → A4用紙 <strong>{sheetCount}</strong>枚
        </p>
        {totalFaces === 0 ? (
          <p className="field__hint">掲示物の枚数を1枚以上にすると、プレビューと書き出しが使えます。</p>
        ) : (
          <>
            <PosterSheetPreview
              size={size}
              faces={firstSheetFaces.map((item: PosterListItem) => ({
                title: item.title,
                subtitle: item.subtitle,
                shortUrlText: getPosterShortUrlDisplay(item.targetShortCode),
                qrCodeSvg: qrcodeSvgs[item.qrCodeId] ?? null,
              }))}
            />
            <p className="field__hint">点線が切り取り線です(1枚目のプレビュー)。1回にA4用紙{POSTER_BATCH_MAX_SHEETS}枚まで({size}は{maxFaces}枚まで)。</p>
            {emptySlots > 0 && (
              <AlertMessage tone="warning">
                {sheetCount}枚目に空きが{emptySlots}面あります。あと{emptySlots}枚追加できます(空きのまま印刷もできます)。
              </AlertMessage>
            )}
            {remainingToLimit <= 0 && <AlertMessage tone="warning">上限(A4用紙{POSTER_BATCH_MAX_SHEETS}枚)に達しました。これ以上は追加できません。</AlertMessage>}
          </>
        )}
        {errorMessage && <AlertMessage tone="error">{errorMessage}</AlertMessage>}
        <div className="button-group">
          <Button disabled={totalFaces === 0 || isExporting} onClick={handleExportClick}>
            {isExporting ? '書き出し中…' : `PDFをダウンロード(A4・${sheetCount}枚)`}
          </Button>
        </div>
        <p className="field__hint">書き出しには数秒かかることがあります。</p>
        <PosterPrintGuide />
      </Card>

      <PosterBatchStoppedDialog
        isOpen={isStoppedDialogOpen}
        onClose={() => setIsStoppedDialogOpen(false)}
        posters={stoppedPosters}
        onExportAnyway={() => {
          setIsStoppedDialogOpen(false)
          void runExport()
        }}
      />
    </Page>
  )
}
