/** @jsxImportSource react */
import type { z } from 'zod'
import type { SelectOption } from '@/frontend/components/form-field'
import type { linkSchema } from '@/shared/schemas/link'

export type LinkStatus = z.infer<typeof linkSchema>['status']

// 短縮URLの状態(active/expired/suspended)の表示名。一覧のバッジと詳細画面の選択肢で共有する
export const LINK_STATUS_LABELS: Record<LinkStatus, string> = {
  active: '有効',
  expired: '期限切れ',
  suspended: '停止中',
}

// SelectField用の選択肢。LINK_STATUS_LABELSから作るため、状態が増えた場合もラベルの追加だけで済む
export const LINK_STATUS_OPTIONS: SelectOption[] = (Object.keys(LINK_STATUS_LABELS) as LinkStatus[]).map((status) => ({
  value: status,
  label: LINK_STATUS_LABELS[status],
}))

// LinkStatusBadge: 状態を色だけでなく形・アイコンでも区別して表示する
// (有効=点、期限切れ=時計アイコン、停止中=一時停止アイコン。色覚特性によらず区別できるようにするため)
export function LinkStatusBadge({ status }: { status: LinkStatus }) {
  return (
    <span className={`status-badge status-badge--${status}`}>
      <LinkStatusIcon status={status} />
      {LINK_STATUS_LABELS[status]}
    </span>
  )
}

function LinkStatusIcon({ status }: { status: LinkStatus }) {
  if (status === 'active') {
    return <span className="status-badge__dot" aria-hidden="true" />
  }

  if (status === 'expired') {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </svg>
    )
  }

  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6v12" />
      <path d="M15 6v12" />
    </svg>
  )
}
