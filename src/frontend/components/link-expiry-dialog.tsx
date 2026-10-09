/** @jsxImportSource react */
import { type FormEvent, useState } from 'react'
import { AlertMessage } from '@/frontend/components/alert-message'
import { Button } from '@/frontend/components/button'
import { ChoiceButtonGroup } from '@/frontend/components/choice-button-group'
import { Dialog } from '@/frontend/components/dialog'
import { FormField } from '@/frontend/components/form-field'
import { LinkStatusBadge, type LinkStatus } from '@/frontend/components/link-status-badge'
import { ShortUrl } from '@/frontend/components/short-url'
import { formatDateJst } from '@/frontend/lib/account-deletion'
import { addMonthsToJstDateString, getTodayJstDateString, toExpiresAt } from '@/frontend/lib/link-expiry'

// このダイアログで選べる定型の選択肢。日付入力を直接変更した場合はどれも選ばれていない状態になる
const PRESET_OPTIONS = [
  { value: 'oneMonth', label: '1か月後' },
  { value: 'threeMonths', label: '3か月後' },
  { value: 'none', label: '無期限' },
] as const
type Preset = (typeof PRESET_OPTIONS)[number]['value']

const FORM_ID = 'link-expiry-dialog-form'

type LinkExpiryDialogProps = {
  isOpen: boolean
  onClose: () => void
  link: { shortCode: string; expiresAt: string | null; displayStatus: LinkStatus }
  // 新しい有効期限(ISO文字列。無期限はnull)を保存する。失敗した場合はエラー文言を返し、成功したらnullを返す
  onSave: (expiresAt: string | null) => Promise<string | null>
}

// toJstDateString: ISO文字列を日本時間のYYYY-MM-DDにする(日付入力の初期値用)
function toJstDateString(isoString: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(isoString))
}

// LinkExpiryDialog: 有効期限の変更ダイアログ(docs/mocks/ExpiryDialog.html)。
// [1か月後][3か月後][無期限]+日付指定で選ばせ、指定日の23:59(日本時間)に期限切れにする。
// 期限切れの短縮URLでも、延長または無期限にすれば再開できる。スマホでは全画面で表示する(第6.5節)
export function LinkExpiryDialog({ isOpen, onClose, link, onSave }: LinkExpiryDialogProps) {
  const isExpired = link.displayStatus === 'expired'
  // 初期値: 期限切れなら3か月後、無期限なら「無期限」、期限付きならその日付
  const [preset, setPreset] = useState<Preset | null>(isExpired ? 'threeMonths' : link.expiresAt === null ? 'none' : null)
  const [date, setDate] = useState(
    isExpired ? addMonthsToJstDateString(3) : link.expiresAt === null ? '' : toJstDateString(link.expiresAt),
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  function handlePresetChange(nextPreset: Preset) {
    setPreset(nextPreset)
    setDate(nextPreset === 'oneMonth' ? addMonthsToJstDateString(1) : nextPreset === 'threeMonths' ? addMonthsToJstDateString(3) : '')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setIsSaving(true)
    const error = await onSave(preset === 'none' ? null : toExpiresAt(date))
    setIsSaving(false)
    if (error) {
      setErrorMessage(error)
    }
  }

  const currentExpiryText = link.expiresAt === null ? '無期限です' : `${formatDateJst(link.expiresAt)} ${isExpired ? 'に期限切れになりました' : 'に期限切れになります'}`

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="有効期限の変更"
      fullScreenOnMobile
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          {/* ボタンはDialogのfooterにあり<form>の外なので、form属性で送信先のフォームを指定する */}
          <Button type="submit" form={FORM_ID} disabled={isSaving}>
            {isSaving ? '保存中…' : isExpired ? '保存して再開する' : '保存'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} className="expiry-dialog" onSubmit={handleSubmit}>
        <div className="expiry-dialog__current">
          <div>
            <ShortUrl shortCode={link.shortCode} />
            <p className="expiry-dialog__current-text">{currentExpiryText}</p>
          </div>
          <LinkStatusBadge status={link.displayStatus} />
        </div>
        {isExpired && (
          <p>
            新しい期限を設定するか「無期限」にすると、<strong>印刷済みのQRコードからまた開けるようになります。</strong>
          </p>
        )}
        {errorMessage && <AlertMessage tone="error">{errorMessage}</AlertMessage>}
        <ChoiceButtonGroup legend="新しい有効期限" options={PRESET_OPTIONS} value={preset as Preset} onChange={handlePresetChange} />
        <FormField
          fieldId="link-expiry-dialog-date"
          label="日付を指定"
          hint="指定した日の23:59(日本時間)に期限切れになります。"
          narrow
          inputProps={{
            type: 'date',
            // 日付を直接入力したら定型の選択(無期限を含む)を外す。無期限の間は日付を空にしておく
            required: preset !== 'none',
            min: getTodayJstDateString(),
            value: date,
            onChange: (e) => {
              setDate(e.target.value)
              setPreset(null)
            },
          }}
        />
      </form>
    </Dialog>
  )
}
