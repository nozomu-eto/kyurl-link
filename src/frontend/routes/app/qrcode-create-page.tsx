/** @jsxImportSource react */
import { type FormEvent, useState } from 'react'
import { type LoaderFunctionArgs, useLoaderData, useNavigate } from 'react-router'
import { AlertMessage } from '@/frontend/components/alert-message'
import { apiClient } from '@/frontend/lib/api-client'

// qrcodeCreateLoader: QRコード作成画面のloader。
// URLに:linkIdが含まれる場合(/app/links/:linkId/qrcodes/newからの遷移)は、その1件の
// linkだけを取得し、対象linkを固定した状態でフォームを表示する。
// :linkIdが無い場合(/app/qrcodes/newへ直接来た場合)は、対象を選べるように
// ログインユーザーの全link一覧を取得する
export async function qrcodeCreateLoader({ params }: LoaderFunctionArgs) {
  if (params.linkId) {
    const response = await apiClient.api.v1.links[':id'].$get({ param: { id: params.linkId } })
    if (!response.ok) {
      throw new Response('指定された短縮URLが見つかりません', { status: response.status })
    }
    const fixedLink = await response.json()
    return { fixedLink, selectableLinkItems: null }
  }

  const response = await apiClient.api.v1.links.$get()
  const body = response.ok ? await response.json() : { items: [] }
  return { fixedLink: null, selectableLinkItems: body.items }
}

// QrCodeCreatePage: QRコードの新規作成フォーム。
// 対象は「既存の短縮URL(link)」または「直接指定するURL(rawUrl)」のいずれかを選ぶ
// (docs/architecture.md「QRコードは短縮後・短縮前どちらのURLにも紐づけ可能」に対応)。
// :linkIdから遷移してきた場合は対象linkを固定し、選択UI自体を出さない
export function QrCodeCreatePage() {
  const { fixedLink, selectableLinkItems } = useLoaderData<typeof qrcodeCreateLoader>()
  const navigate = useNavigate()

  // targetKind: 対象種別の選択状態。fixedLinkがある場合は常に'link'固定
  const [targetKind, setTargetKind] = useState<'link' | 'rawUrl'>('link')
  const [selectedLinkId, setSelectedLinkId] = useState(selectableLinkItems?.[0]?.id ?? '')
  const [rawUrl, setRawUrl] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setIsSubmitting(true)

    const requestBody = fixedLink
      ? ({ targetType: 'link', targetId: fixedLink.id } as const)
      : targetKind === 'link'
        ? ({ targetType: 'link', targetId: selectedLinkId } as const)
        : ({ targetType: 'rawUrl', targetUrl: rawUrl } as const)

    const response = await apiClient.api.v1.qrcodes.$post({ json: requestBody })

    setIsSubmitting(false)

    if (!response.ok) {
      const body = await response.json()
      setErrorMessage('error' in body ? body.error.message : 'QRコードの作成に失敗しました')
      return
    }

    const created = await response.json()
    await navigate(`/app/qrcodes/${created.id}`)
  }

  return (
    <div className="page">
      <h1>QRコードを作成</h1>
      {errorMessage && <AlertMessage tone="error">{errorMessage}</AlertMessage>}
      <form className="card" onSubmit={handleSubmit}>
        {fixedLink ? (
          <p>
            対象の短縮URL: <strong>{`${window.location.origin}/${fixedLink.shortCode}`}</strong>
          </p>
        ) : (
          <>
            <div className="field">
              <label className="field__label" htmlFor="qrcode-create-target-kind">
                対象の種類
              </label>
              <select
                id="qrcode-create-target-kind"
                className="field__input"
                value={targetKind}
                onChange={(e) => setTargetKind(e.target.value as 'link' | 'rawUrl')}
              >
                <option value="link">作成済みの短縮URL</option>
                <option value="rawUrl">直接URLを指定</option>
              </select>
            </div>

            {targetKind === 'link' ? (
              <div className="field">
                <label className="field__label" htmlFor="qrcode-create-link-select">
                  対象の短縮URL
                </label>
                {selectableLinkItems && selectableLinkItems.length > 0 ? (
                  <select
                    id="qrcode-create-link-select"
                    className="field__input"
                    value={selectedLinkId}
                    onChange={(e) => setSelectedLinkId(e.target.value)}
                  >
                    {selectableLinkItems.map((linkItem) => (
                      <option key={linkItem.id} value={linkItem.id}>
                        {linkItem.shortCode} ({linkItem.originalUrl})
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="field__hint">まだ短縮URLがありません。先に短縮URLを作成してください。</p>
                )}
              </div>
            ) : (
              <div className="field">
                <label className="field__label" htmlFor="qrcode-create-raw-url">
                  対象URL
                </label>
                <input
                  id="qrcode-create-raw-url"
                  className="field__input"
                  type="url"
                  required
                  placeholder="https://example.com"
                  value={rawUrl}
                  onChange={(e) => setRawUrl(e.target.value)}
                />
              </div>
            )}
          </>
        )}

        <button
          type="submit"
          className="button button--primary"
          disabled={isSubmitting || (!fixedLink && targetKind === 'link' && !selectedLinkId)}
        >
          {isSubmitting ? '作成中…' : 'QRコードを作成'}
        </button>
      </form>
    </div>
  )
}
