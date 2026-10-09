/** @jsxImportSource react */
import type { ReactNode } from 'react'

export type ChoiceOption<Value extends string> = { value: Value; label: string }

type ChoiceButtonGroupProps<Value extends string> = {
  // グループの見出し(<legend>)
  legend: string
  // 補足説明。選択肢の下に表示する
  hint?: string
  options: readonly ChoiceOption<Value>[]
  value: Value
  onChange: (value: Value) => void
  // 選択肢の下(補足説明の上)に出す追加の入力欄(例: 「日付を指定」を選んだときの日付入力)
  children?: ReactNode
}

// ChoiceButtonGroup: 少数の選択肢をボタンの横並びで選ばせる共通部品(有効期限の[無期限][1か月後]…など)。
// 選ばれているボタンはaria-pressedで伝える。<select>より選択肢が一目で分かる場面で使う
export function ChoiceButtonGroup<Value extends string>({
  legend,
  hint,
  options,
  value,
  onChange,
  children,
}: ChoiceButtonGroupProps<Value>) {
  return (
    <fieldset className="choice-group">
      <legend className="field__label">{legend}</legend>
      <div className="choice-group__options">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="choice-group__button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </fieldset>
  )
}
