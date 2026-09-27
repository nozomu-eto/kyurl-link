/** @jsxImportSource react */
import { type FormEvent, useState } from 'react'
import { type LoaderFunctionArgs, Link, useLoaderData, useNavigate } from 'react-router'
import { AlertMessage } from '@/frontend/components/alert-message'
import { apiClient } from '@/frontend/lib/api-client'
import { Button } from '@/frontend/components/button'
import { FormCard } from '@/frontend/components/card'
import { Field, FormField, SelectField } from '@/frontend/components/form-field'
import { Page } from '@/frontend/components/page'
import { QRCODE_NAME_MAX_LENGTH, URL_MAX_LENGTH } from '@/shared/constants/input-limits'

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
  const [name, setName] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // メール未確認によるエラー(EMAIL_NOT_VERIFIED)の場合のみ、「メール確認待ち」画面への
  // 導線を追加で表示するために、エラーコードも別途保持する
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setErrorCode(null)
    setIsSubmitting(true)

    const requestBody = fixedLink
      ? ({ targetType: 'link', targetId: fixedLink.id, name } as const)
      : targetKind === 'link'
        ? ({ targetType: 'link', targetId: selectedLinkId, name } as const)
        : ({ targetType: 'rawUrl', targetUrl: rawUrl, name } as const)

    const response = await apiClient.api.v1.qrcodes.$post({ json: requestBody })

    setIsSubmitting(false)

    if (!response.ok) {
      const body = await response.json()
      setErrorMessage('error' in body ? body.error.message : 'QRコードの作成に失敗しました')
      setErrorCode('error' in body ? body.error.code : null)
      return
    }

    const created = await response.json()
    await navigate(`/app/qrcodes/${created.id}`)
  }

  return (
    <Page title="QRコードを作成">
      {errorMessage && (
        <AlertMessage tone="error">
          {errorMessage}
          {errorCode === 'EMAIL_NOT_VERIFIED' && (
            <>
              {' '}
              <Link to="/verify-email">メールアドレスの確認はこちら</Link>
            </>
          )}
        </AlertMessage>
      )}
      <FormCard onSubmit={handleSubmit}>
        {fixedLink ? (
          <p>
            対象の短縮URL: <strong>{`${window.location.origin}/${fixedLink.shortCode}`}</strong>
          </p>
        ) : (
          <>
            <SelectField
              fieldId="qrcode-create-target-kind"
              label="対象の種類"
              options={[
                { value: 'link', label: '作成済みの短縮URL' },
                { value: 'rawUrl', label: '直接URLを指定' },
              ]}
              selectProps={{ value: targetKind, onChange: (e) => setTargetKind(e.target.value as 'link' | 'rawUrl') }}
            />

            {targetKind === 'link' ? (
              <Field fieldId="qrcode-create-link-select" label="対象の短縮URL">
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
              </Field>
            ) : (
              <FormField
                fieldId="qrcode-create-raw-url"
                label="対象URL"
                inputProps={{
                  type: 'url',
                  required: true,
                  // サーバー側スキーマ(httpUrlSchema)の上限と揃える
                  maxLength: URL_MAX_LENGTH,
                  placeholder: 'https://example.com',
                  value: rawUrl,
                  onChange: (e) => setRawUrl(e.target.value),
                }}
              />
            )}
          </>
        )}

        <FormField
          fieldId="qrcode-create-name"
          label="名前(任意)"
          hint="一覧などで表示する管理用の名前です。QR画像には表示されません。"
          inputProps={{ maxLength: QRCODE_NAME_MAX_LENGTH, value: name, onChange: (e) => setName(e.target.value) }}
        />

        <Button
          type="submit"
          disabled={isSubmitting || (!fixedLink && targetKind === 'link' && !selectedLinkId)}
        >
          {isSubmitting ? '作成中…' : 'QRコードを作成'}
        </Button>
      </FormCard>
    </Page>
  )
}
