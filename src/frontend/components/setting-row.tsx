/** @jsxImportSource react */
import type { ReactNode } from 'react'

type SettingRowProps = {
  // 項目名(例: 「パスワード」)
  label: string
  // 現在の値(例: メールアドレス、伏せ字のパスワード)
  value: ReactNode
  // 右側の操作(例: 「変更」ボタン)。省略可
  action?: ReactNode
}

// SettingRow: アカウント設定の「項目名・現在の値・操作ボタン」を1行にまとめる共通部品
// (docs/mocks/AccountSettings.html「ログイン情報」)。スマホでは操作ボタンが値の下に回り込む
export function SettingRow({ label, value, action }: SettingRowProps) {
  return (
    <div className="setting-row">
      <div className="setting-row__text">
        <span className="setting-row__label">{label}</span>
        <span className="setting-row__value">{value}</span>
      </div>
      {action}
    </div>
  )
}
