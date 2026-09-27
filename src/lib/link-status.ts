// linkの表示用の実効ステータス(displayStatus)を計算する。DB保存値のstatus列とは別に、
// 「今この瞬間、実際にどう扱うべきか」をレスポンス・リダイレクトの両方でその場で計算するために使う。
//
// status列に'expired'を指定するAPI経路は無くなった(linkUpdateInputSchemaはactive/suspendedのみ)
// ため、有効期限切れかどうかは常にexpiresAtから判定する。判定基準は次の優先順位で、
// src/routes/links.ts(GET一覧・詳細のdisplayStatus)とsrc/index.tsx(/:shortCodeの410判定)の
// 両方から呼び出すことで、両者の基準が食い違わないようにする:
//   1. moderationStatus === 'suspended' → 'suspended'(運営による強制停止)
//   2. status === 'suspended'           → 'suspended'(所有者による停止)
//   3. expiresAtが設定されていて、現在時刻を過ぎている → 'expired'
//   4. それ以外                          → 'active'
export type LinkDisplayStatus = 'active' | 'expired' | 'suspended'

type LinkStatusFields = {
  status: 'active' | 'expired' | 'suspended'
  expiresAt: string | null
  moderationStatus: 'none' | 'suspended'
}

export function computeLinkDisplayStatus(record: LinkStatusFields): LinkDisplayStatus {
  if (record.moderationStatus === 'suspended') {
    return 'suspended'
  }

  if (record.status === 'suspended') {
    return 'suspended'
  }

  if (record.expiresAt !== null && new Date(record.expiresAt) < new Date()) {
    return 'expired'
  }

  return 'active'
}
