/** @jsxImportSource react */
import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AlertMessage } from '@/frontend/components/alert-message'
import { apiClient } from '@/frontend/lib/api-client'
import { Button, ButtonLink } from '@/frontend/components/button'
import { Card, FormCard } from '@/frontend/components/card'
import { ChoiceButtonGroup } from '@/frontend/components/choice-button-group'
import { CheckboxField, FormField } from '@/frontend/components/form-field'
import { Page } from '@/frontend/components/page'
import { type ExpiryChoice, getTodayJstDateString, resolveExpiresAt } from '@/frontend/lib/link-expiry'
import { QRCODE_NAME_MAX_LENGTH, URL_MAX_LENGTH } from '@/shared/constants/input-limits'

// 有効期限の選択肢(docs/architecture.md 第6.7節「[無期限][1か月後][3か月後][日付を指定]」)
const EXPIRY_OPTIONS = [
  { value: 'none', label: '無期限' },
  { value: 'oneMonth', label: '1か月後' },
  { value: 'threeMonths', label: '3か月後' },
  { value: 'custom', label: '日付を指定' },
] as const

type CreatedLink = { id: string; shortCode: string }

// LinkCreatePage: 短縮URLの新規作成フォーム(docs/mocks/LinkCreate.html)。
// 元URL・有効期限・「QRコードも一緒に作成する」(初期値オン)とQRの名前(任意)を入力する。
//
// 作成は2段階のAPI呼び出しになる: ①POST /links(短縮URL) → ②POST /qrcodes(QRコード)。
// ①が成功して②が失敗した場合、短縮URLはすでに作成済みなので、フォームをそのまま再送信すると
// 同じURLの短縮URLが重複して作られてしまう。そのため②の失敗時はフォームを隠し、
// 作成済みの短縮URLに対してQRコードの作成だけを再試行できる表示に切り替える
export function LinkCreatePage() {
  const navigate = useNavigate()
  const [originalUrl, setOriginalUrl] = useState('')
  const [expiryChoice, setExpiryChoice] = useState<ExpiryChoice>('none')
  const [customExpiryDate, setCustomExpiryDate] = useState('')
  const [shouldCreateQrcode, setShouldCreateQrcode] = useState(true)
  const [qrcodeName, setQrcodeName] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // メール未確認によるエラー(EMAIL_NOT_VERIFIED)の場合のみ、「メール確認待ち」画面への
  // 導線を追加で表示するために、エラーコードも別途保持する
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // 短縮URLの作成には成功したがQRコードの作成に失敗した場合の、作成済みの短縮URL
  const [qrcodeRetryTarget, setQrcodeRetryTarget] = useState<CreatedLink | null>(null)

  // createQrcodeAndNavigate: 作成済みの短縮URLに対するQRコードを作成し、完了画面へ遷移する。
  // 失敗した場合は再試行用の表示に切り替える。成功・失敗は戻り値ではなく画面の状態で表す
  async function createQrcodeAndNavigate(createdLink: CreatedLink) {
    const qrcodeResponse = await apiClient.api.v1.qrcodes.$post({
      json: { targetType: 'link', targetId: createdLink.id, name: qrcodeName },
    })

    if (!qrcodeResponse.ok) {
      const body = await qrcodeResponse.json()
      setErrorMessage('error' in body ? body.error.message : 'QRコードの作成に失敗しました')
      setErrorCode('error' in body ? body.error.code : null)
      setQrcodeRetryTarget(createdLink)
      return
    }

    const createdQrcode = await qrcodeResponse.json()
    await navigate(`/app/links/${createdLink.id}/created?qrcodeId=${createdQrcode.id}`)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setErrorCode(null)
    setIsSubmitting(true)

    const linkResponse = await apiClient.api.v1.links.$post({
      json: { originalUrl, expiresAt: resolveExpiresAt(expiryChoice, customExpiryDate) },
    })

    if (!linkResponse.ok) {
      const body = await linkResponse.json()
      setErrorMessage('error' in body ? body.error.message : '短縮URLの作成に失敗しました')
      setErrorCode('error' in body ? body.error.code : null)
      setIsSubmitting(false)
      return
    }

    const createdLink = await linkResponse.json()

    if (shouldCreateQrcode) {
      await createQrcodeAndNavigate(createdLink)
      setIsSubmitting(false)
      return
    }

    setIsSubmitting(false)
    await navigate(`/app/links/${createdLink.id}/created`)
  }

  async function handleRetryQrcode() {
    if (!qrcodeRetryTarget) {
      return
    }
    setErrorMessage(null)
    setErrorCode(null)
    setIsSubmitting(true)
    await createQrcodeAndNavigate(qrcodeRetryTarget)
    setIsSubmitting(false)
  }

  const errorAlert = errorMessage && (
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
  )

  if (qrcodeRetryTarget) {
    return (
      <Page title="短縮URLを作成">
        {errorAlert}
        <Card title="QRコードを作成できませんでした">
          <p>
            短縮URL（{window.location.host}/{qrcodeRetryTarget.shortCode}）は作成済みです。QRコードの作成だけをやり直せます。
          </p>
          <div className="button-group">
            <Button disabled={isSubmitting} onClick={handleRetryQrcode}>
              {isSubmitting ? '作成中…' : 'QRコードの作成をやり直す'}
            </Button>
            <ButtonLink variant="outline" to={`/app/links/${qrcodeRetryTarget.id}/created`}>
              QRコードなしで進む
            </ButtonLink>
          </div>
        </Card>
      </Page>
    )
  }

  return (
    <Page title="短縮URLを作成">
      {errorAlert}
      <FormCard onSubmit={handleSubmit}>
        <FormField
          fieldId="link-create-original-url"
          label="案内したいページのURL(必須)"
          hint="お店のホームページ、予約ページ、SNSのページなどのURLを貼り付けてください。"
          inputProps={{
            type: 'url',
            required: true,
            // サーバー側スキーマ(httpUrlSchema)の上限と揃え、送信前に気づけるようにする
            maxLength: URL_MAX_LENGTH,
            placeholder: 'https://',
            value: originalUrl,
            onChange: (e) => setOriginalUrl(e.target.value),
          }}
        />
        <ChoiceButtonGroup
          legend="有効期限"
          hint="キャンペーンなど終わりが決まっている場合に設定します。あとから変更・延長もできます。指定した日の23:59(日本時間)に期限切れになります。"
          options={EXPIRY_OPTIONS}
          value={expiryChoice}
          onChange={setExpiryChoice}
        >
          {expiryChoice === 'custom' && (
            <FormField
              fieldId="link-create-expires-at"
              label="期限の日付"
              narrow
              inputProps={{
                type: 'date',
                required: true,
                // 今日(日本時間)以降だけ選べる。今日を選んでも23:59までは有効
                min: getTodayJstDateString(),
                value: customExpiryDate,
                onChange: (e) => setCustomExpiryDate(e.target.value),
              }}
            />
          )}
        </ChoiceButtonGroup>
        <CheckboxField
          fieldId="link-create-with-qrcode"
          checked={shouldCreateQrcode}
          onChange={setShouldCreateQrcode}
          label="QRコードも一緒に作成する"
        />
        {shouldCreateQrcode && (
          <FormField
            fieldId="link-create-qrcode-name"
            label="QRコードの名前(管理用・任意)"
            hint="一覧で見分けるための名前です。未入力の場合は作成日で表示します。"
            inputProps={{
              type: 'text',
              maxLength: QRCODE_NAME_MAX_LENGTH,
              placeholder: '例:店頭ポスター用',
              value: qrcodeName,
              onChange: (e) => setQrcodeName(e.target.value),
            }}
          />
        )}
        <div className="button-group">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? '作成中…' : '短縮URLを作成'}
          </Button>
          <ButtonLink variant="text" to="/app">
            キャンセル
          </ButtonLink>
        </div>
      </FormCard>
    </Page>
  )
}
