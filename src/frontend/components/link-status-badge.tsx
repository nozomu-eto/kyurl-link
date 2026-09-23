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

// LinkStatusBadge: 状態を色付きのバッジで表示する(有効=緑、期限切れ・停止中=赤)
export function LinkStatusBadge({ status }: { status: LinkStatus }) {
  return <span className={`status-badge status-badge--${status}`}>{LINK_STATUS_LABELS[status]}</span>
}
