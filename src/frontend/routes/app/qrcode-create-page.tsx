/** @jsxImportSource react */
import { type FormEvent, useState } from 'react'
import { type LoaderFunctionArgs, Link, useLoaderData, useNavigate } from 'react-router'
import { AlertMessage } from '@/frontend/components/alert-message'
import { apiClient } from '@/frontend/lib/api-client'
import { Button, ButtonLink } from '@/frontend/components/button'
import { FormCard } from '@/frontend/components/card'
import { Field, FormField } from '@/frontend/components/form-field'
import { Page } from '@/frontend/components/page'
import { RadioCardGroup } from '@/frontend/components/radio-card-group'
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

// 読み取り先の選択肢(docs/architecture.md 第6.7節「作成済みの短縮URL(おすすめ)」「URLを直接指定」)
const TARGET_KIND_OPTIONS = [
  { value: 'link', label: '作成済みの短縮URL', badge: 'おすすめ', description: '印刷後も転送先を変えられ、読み取り数も確認できます。' },
  { value: 'rawUrl', label: 'URLを直接指定', description: '短縮せず、元のURLをそのままQRコードにします。' },
] as const

// QrCodeCreatePage: QRコードの新規作成フォーム(docs/mocks/QrCreate.html・MobileQrCreate.html)。
// 読み取り先は「既存の短縮URL(link)」または「直接指定するURL(rawUrl)」のいずれかを選ぶ
// (docs/architecture.md「QRコードは短縮後・短縮前どちらのURLにも紐づけ可能」に対応)。
// 直接指定では、印刷後に読み取り先を変更できず読み取り数も確認できない旨の注意と、
// 短縮URL作成への導線を表示する。
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
          {errorCode === 'ACCOUNT_DELETION_PENDING' && (
            <>
              {' '}
              <Link to="/app/account">アカウント設定はこちら</Link>
            </>
          )}
        </AlertMessage>
      )}
      <FormCard onSubmit={handleSubmit}>
        {fixedLink ? (
          <p>
            読み取り先の短縮URL: <strong>{`${window.location.origin}/${fixedLink.shortCode}`}</strong>
          </p>
        ) : (
          <>
            <RadioCardGroup
              legend="QRコードの読み取り先"
              name="qrcode-create-target-kind"
              options={TARGET_KIND_OPTIONS}
              value={targetKind}
              onChange={setTargetKind}
            />

            {targetKind === 'link' ? (
              <Field fieldId="qrcode-create-link-select" label="読み取り先の短縮URL">
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
                  <p className="field__hint">
                    まだ短縮URLがありません。<Link to="/app/links/new">先に短縮URLを作成</Link>してください。
                  </p>
                )}
              </Field>
            ) : (
              <>
                <FormField
                  fieldId="qrcode-create-raw-url"
                  label="読み取り先のURL"
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
                <AlertMessage tone="warning">
                  <strong>このQRコードは、印刷後に読み取り先を変更できません。</strong>
                  読み取り数の確認もできません。ページのURLが変わる可能性がある場合は、短縮URLを作ってからQRコードにするのがおすすめです。{' '}
                  <Link to="/app/links/new">短縮URLを作成する</Link>
                </AlertMessage>
              </>
            )}
          </>
        )}

        <FormField
          fieldId="qrcode-create-name"
          label="名前(管理用・任意)"
          hint="未入力の場合は作成日で表示します。QR画像には表示されません。"
          inputProps={{ maxLength: QRCODE_NAME_MAX_LENGTH, placeholder: '例:入口の案内用', value: name, onChange: (e) => setName(e.target.value) }}
        />

        <div className="button-group">
          <Button type="submit" disabled={isSubmitting || (!fixedLink && targetKind === 'link' && !selectedLinkId)}>
            {isSubmitting ? '作成中…' : 'QRコードを作成'}
          </Button>
          <ButtonLink variant="text" to="/app/qrcodes">
            キャンセル
          </ButtonLink>
        </div>
      </FormCard>
    </Page>
  )
}
