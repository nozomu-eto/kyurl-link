/** @jsxImportSource react */
import type { ReactNode } from 'react'

export type RadioCardOption<Value extends string> = {
  value: Value
  label: string
  // 選択肢の下に出す説明
  description: string
  // ラベルの横に出す小さな印(例: 「おすすめ」)
  badge?: string
}

type RadioCardGroupProps<Value extends string> = {
  // グループの見出し(<legend>)
  legend: string
  // 同じグループのラジオボタンをまとめるname
  name: string
  options: readonly RadioCardOption<Value>[]
  value: Value
  onChange: (value: Value) => void
  children?: ReactNode
}

// RadioCardGroup: 説明文付きの選択肢を、カード状のラジオボタンで縦に並べる共通部品
// (QRコードの読み取り先の選択、ダウンロード形式の選択など)。選ばれているカードは枠線で示す
export function RadioCardGroup<Value extends string>({ legend, name, options, value, onChange, children }: RadioCardGroupProps<Value>) {
  return (
    <fieldset className="radio-card-group">
      <legend className="field__label">{legend}</legend>
      <div className="radio-card-group__options">
        {options.map((option) => (
          <label key={option.value} className="radio-card" data-checked={option.value === value}>
            <input
              type="radio"
              name={name}
              className="radio-card__input"
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span className="radio-card__text">
              <span className="radio-card__label">
                {option.label}
                {option.badge && <span className="radio-card__badge">{option.badge}</span>}
              </span>
              <span className="radio-card__description">{option.description}</span>
            </span>
          </label>
        ))}
      </div>
      {children}
    </fieldset>
  )
}
