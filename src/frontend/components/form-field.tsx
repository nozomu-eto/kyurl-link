/** @jsxImportSource react */
import type { ComponentProps } from 'react'

// FormField: ラベル・入力欄・エラー文言を1セットにまとめた、フォーム1項目分の部品。
// 各画面のフォーム(サインアップ・ログイン・link作成等)で共通の見た目・構造にするために使う。
// inputPropsはネイティブの<input>にそのまま渡す(name・type・defaultValue・required等)。
// errorMessageが渡された場合のみ、フィールド直下に赤字でエラー文言を表示する
type FormFieldProps = {
  // フィールドの識別子。ラベルのhtmlFor・inputのidを一致させ、クリックでフォーカスできるようにする
  fieldId: string
  // 画面に表示するラベル文言(例: 「メールアドレス」)
  label: string
  // サーバー側バリデーション等で発生したエラー文言。無ければ表示しない
  errorMessage?: string
  // ラベル下に常時表示する補足説明(例: 「8文字以上で入力してください」)
  hint?: string
  inputProps: ComponentProps<'input'>
}

export function FormField({ fieldId, label, errorMessage, hint, inputProps }: FormFieldProps) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={fieldId}>
        {label}
      </label>
      <input id={fieldId} className="field__input" {...inputProps} />
      {hint && !errorMessage && <span className="field__hint">{hint}</span>}
      {errorMessage && (
        <span className="field__error" role="alert">
          {errorMessage}
        </span>
      )}
    </div>
  )
}
