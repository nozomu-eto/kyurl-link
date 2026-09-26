/** @jsxImportSource react */
import type { ComponentProps, ReactNode } from 'react'
import { cx } from '@/frontend/components/class-names'

type FieldBaseProps = {
  // フィールドの識別子。ラベルのhtmlFor・入力欄のidを一致させ、クリックでフォーカスできるようにする
  fieldId: string
  // 画面に表示するラベル文言(例: 「メールアドレス」)
  label: string
  // サーバー側バリデーション等で発生したエラー文言。無ければ表示しない
  errorMessage?: string
  // ラベル下に常時表示する補足説明(例: 「8文字以上で入力してください」)。エラー表示中は隠す
  hint?: string
  // trueの場合、入力欄の幅を狭める(状態の選択など短い値向け)
  narrow?: boolean
}

// Field: ラベル・補足説明・エラー文言の枠だけを持つ部品。入力欄そのものはchildrenで受け取る。
// 入力欄の出し分けが必要な場合など、FormField/SelectFieldに収まらない場面で使う。
// childrenの入力欄には、ラベルと紐づけるためfieldIdと同じidを付けること
export function Field({ fieldId, label, errorMessage, hint, narrow = false, children }: FieldBaseProps & { children: ReactNode }) {
  return (
    <div className={cx('field', narrow && 'field--narrow')}>
      <label className="field__label" htmlFor={fieldId}>
        {label}
      </label>
      {children}
      {hint && !errorMessage && <span className="field__hint">{hint}</span>}
      {errorMessage && (
        <span className="field__error" role="alert">
          {errorMessage}
        </span>
      )}
    </div>
  )
}

// FormField: ラベル・入力欄(<input>)・エラー文言を1セットにまとめた、フォーム1項目分の部品。
// inputPropsはネイティブの<input>にそのまま渡す(type・value・onChange・required等)
export function FormField({ inputProps, ...fieldProps }: FieldBaseProps & { inputProps: ComponentProps<'input'> }) {
  return (
    <Field {...fieldProps}>
      <input id={fieldProps.fieldId} className="field__input" {...inputProps} />
    </Field>
  )
}

export type SelectOption = { value: string; label: string }

// SelectField: 選択肢(<select>)版のFormField。選択肢はoptionsで渡し、
// value・onChange・disabled等はselectPropsでネイティブの<select>にそのまま渡す
export function SelectField({
  options,
  selectProps,
  ...fieldProps
}: FieldBaseProps & { options: readonly SelectOption[]; selectProps: ComponentProps<'select'> }) {
  return (
    <Field {...fieldProps}>
      <select id={fieldProps.fieldId} className="field__input" {...selectProps}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  )
}
