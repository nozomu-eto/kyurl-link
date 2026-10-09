/** @jsxImportSource react */
import type { ReactNode } from 'react'
import { Link, type LoaderFunctionArgs, useLoaderData } from 'react-router'
import { buttonClassName } from '@/frontend/components/button'
import { Card } from '@/frontend/components/card'
import { CopyButton } from '@/frontend/components/copy-button'
import { Page } from '@/frontend/components/page'
import { ShortUrl } from '@/frontend/components/short-url'
import { apiClient } from '@/frontend/lib/api-client'

// linkCreatedLoader: 作成完了画面に必要な情報を取得するloader。
// 短縮URL本体は必須。QRコードはURLのクエリ(?qrcodeId=)で渡されたときだけ取得し、
// 取得できない・別の短縮URLのQRコードだった場合は「QRコード無し」として扱う
// (QRコードの作成は短縮URLの作成とは別のAPI呼び出しのため、無いことも正常な状態)
export async function linkCreatedLoader({ params, request }: LoaderFunctionArgs) {
  const linkId = params.linkId
  if (!linkId) {
    throw new Response('linkIdが指定されていません', { status: 400 })
  }

  const qrcodeId = new URL(request.url).searchParams.get('qrcodeId')
  const [linkResponse, qrcodeResponse] = await Promise.all([
    apiClient.api.v1.links[':id'].$get({ param: { id: linkId } }),
    qrcodeId ? apiClient.api.v1.qrcodes[':id'].$get({ param: { id: qrcodeId } }) : Promise.resolve(null),
  ])

  if (!linkResponse.ok) {
    throw new Response('指定された短縮URLが見つかりません', { status: linkResponse.status })
  }

  const link = await linkResponse.json()
  const qrcode = qrcodeResponse?.ok ? await qrcodeResponse.json() : null

  return { link, qrcode: qrcode && qrcode.targetType === 'link' && qrcode.targetId === link.id ? qrcode : null }
}

function CheckIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v11" />
      <path d="M7 11l5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  )
}

function NextActionLink({ to, title, description }: { to: string; title: string; description: ReactNode }) {
  return (
    <Link to={to} className="next-action">
      <span className="next-action__title">{title}</span>
      <span className="next-action__description">{description}</span>
    </Link>
  )
}

// LinkCreatedPage: 短縮URLの作成完了画面(docs/mocks/LinkCreated.html)。
// 短縮URLのコピー、QRコードのPNG/SVGダウンロード、次の操作([掲示物を作る][詳細・設定を見る][続けて作成する])を案内する。
// QRコード無しで作成した場合は、QRの表示とダウンロードの代わりに、QRコードの作成への導線を出す
export function LinkCreatedPage() {
  const { link, qrcode } = useLoaderData<typeof linkCreatedLoader>()
  const shortUrl = `${window.location.origin}/${link.shortCode}`

  return (
    <Page title={qrcode ? '短縮URLとQRコードを作成しました' : '短縮URLを作成しました'}>
      <Card>
        <div className="created-summary">
          <span className="created-summary__icon" aria-hidden="true">
            <CheckIcon />
          </span>
          <div className="created-summary__url">
            <span className="created-summary__label">短縮URL</span>
            <div className="created-summary__url-row">
              <ShortUrl shortCode={link.shortCode} />
              <CopyButton value={shortUrl} />
            </div>
            <p className="created-summary__destination">転送先:{link.originalUrl}</p>
          </div>
        </div>
        {qrcode && (
          <div className="created-qrcode">
            <img className="created-qrcode__image" src={`/api/v1/qrcodes/${qrcode.id}/image`} alt={`${shortUrl} のQRコード`} width={160} height={160} />
            <div className="button-group">
              <a
                className={buttonClassName({ variant: 'secondary' })}
                href={`/api/v1/qrcodes/${qrcode.id}/image?format=png&size=1024`}
                download={`qrcode-${link.shortCode}.png`}
                aria-label="QRコードをPNGでダウンロード"
              >
                <DownloadIcon />
                PNG
              </a>
              <a
                className={buttonClassName({ variant: 'secondary' })}
                href={`/api/v1/qrcodes/${qrcode.id}/image?format=svg`}
                download={`qrcode-${link.shortCode}.svg`}
                aria-label="QRコードをSVGでダウンロード"
              >
                <DownloadIcon />
                SVG
              </a>
            </div>
          </div>
        )}
      </Card>
      <Card title="次にできること">
        <div className="next-actions">
          {qrcode ? (
            <NextActionLink
              to={`/app/qrcodes/${qrcode.id}/posters/new`}
              title="このQRで掲示物を作る"
              description="A6・A5の掲示物をPDFで書き出して、すぐ印刷できます。"
            />
          ) : (
            <NextActionLink
              to={`/app/links/${link.id}/qrcodes/new`}
              title="QRコードを作る"
              description="この短縮URLのQRコードを作成して、掲示物に使えます。"
            />
          )}
          <NextActionLink to={`/app/links/${link.id}`} title="詳細・設定を見る" description="有効期限の変更やクリック数の確認ができます。" />
          <NextActionLink to="/app/links/new" title="続けて作成する" description="別の掲示物用に、もう1つ短縮URLを作れます。" />
        </div>
      </Card>
    </Page>
  )
}
