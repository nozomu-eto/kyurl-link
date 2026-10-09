/** @jsxImportSource react */
import { useId, type ReactNode } from 'react'

type SwitchFieldProps = {
  // スイッチの名前(例: 「リダイレクトを有効にする」)。スイッチのアクセシブルネームになる
  label: string
  // ラベルの下に出す補足説明
  description?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

// SwitchField: オン/オフを切り替えるスイッチ(role="switch")と、ラベル・補足説明を1組にした共通部品
// (docs/mocks/LinkDetail.html「公開状態」)。チェックボックスと違い、操作した瞬間に反映される設定に使う
export function SwitchField({ label, description, checked, onChange, disabled = false }: SwitchFieldProps) {
  const labelId = useId()

  return (
    <div className="switch-field">
      <button
        type="button"
        role="switch"
        className="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="switch__thumb" />
      </button>
      <div className="switch-field__text">
        <span id={labelId} className="switch-field__label">
          {label}
        </span>
        {description && <span className="switch-field__description">{description}</span>}
      </div>
    </div>
  )
}
