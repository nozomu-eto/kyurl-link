import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { links } from '@/db/schema'
import { runLinkSecurityFullScan, runLinkSecurityTrackingScan } from '@/lib/link-security-scan-batch'

// サインアップし、linksのuserId外部キーに使える実在のuser idを取得する(セッションは不要なため
// 返さない。このファイルのテストはlinksテーブルへ直接insertし、APIルートは経由しないため)
async function signUpAndGetUserId(): Promise<string> {
  const response = await SELF.fetch('https://example.com/api/auth/sign-up/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: env.BETTER_AUTH_URL,
    },
    body: JSON.stringify({
      email: `test-${crypto.randomUUID()}@example.com`,
      password: 'password1234',
      name: 'Test User',
      agreeToTerms: true,
    }),
  })
  const body = await response.json<{ user: { id: string } }>()
  return body.user.id
}

// テスト用のlinkを1件、直接D1にinsertする(APIルートを経由せず、createdAt/lastScannedAt/
// status/deletedAtを個別に制御するため)。デフォルトのoriginalUrlはIPアドレスリテラルとし、
// スキャンが実際に走ればヒューリスティックによりflagged判定されるようにしておく
// (URLHAUS_API_KEYはテスト環境では未設定のため、URLhaus照会には依存しない検証にする)
async function insertLinkFixture(overrides: {
  userId: string
  originalUrl?: string
  status?: 'active' | 'expired' | 'suspended'
  deletedAt?: Date | null
  createdAt: Date
  lastScannedAt: Date
}) {
  const db = drizzle(env.DB)
  const id = crypto.randomUUID()
  await db.insert(links).values({
    id,
    userId: overrides.userId,
    originalUrl: overrides.originalUrl ?? 'http://192.168.1.1/suspicious-path',
    shortCode: id,
    status: overrides.status ?? 'active',
    expiresAt: null,
    deletedAt: overrides.deletedAt ?? null,
    createdAt: overrides.createdAt,
    lastScannedAt: overrides.lastScannedAt,
    securityStatus: 'unscanned',
  })
  return id
}

async function getLink(id: string) {
  const db = drizzle(env.DB)
  const [record] = await db.select().from(links).where(eq(links.id, id))
  return record
}

const ONE_HOUR_MS = 60 * 60 * 1000

describe('runLinkSecurityTrackingScan', () => {
  it('作成後24時間以内かつ未再検査のactiveなlinkのみを対象にし、securityStatus・lastScannedAtを更新する', async () => {
    const userId = await signUpAndGetUserId()
    const oneHourAgo = new Date(Date.now() - ONE_HOUR_MS)
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * ONE_HOUR_MS)

    // 対象: 1時間前に作成され、作成時チェックからまだ再検査されていない(lastScannedAtが
    // createdAtとほぼ同時刻)
    const eligibleId = await insertLinkFixture({ userId, createdAt: oneHourAgo, lastScannedAt: oneHourAgo })

    // 対象外: 1時間前に作成されたが、既に再検査済み(lastScannedAtがcreatedAtよりずっと後)
    const alreadyRescannedId = await insertLinkFixture({ userId, createdAt: oneHourAgo, lastScannedAt: new Date() })

    // 対象外: 作成から24時間を超えている
    const tooOldId = await insertLinkFixture({ userId, createdAt: twentyFiveHoursAgo, lastScannedAt: twentyFiveHoursAgo })

    // 対象外: activeでない(意図的に停止済み)
    const suspendedId = await insertLinkFixture({ userId, status: 'suspended', createdAt: oneHourAgo, lastScannedAt: oneHourAgo })

    // 対象外: ソフトデリート済み
    const deletedId = await insertLinkFixture({ userId, deletedAt: new Date(), createdAt: oneHourAgo, lastScannedAt: oneHourAgo })

    const processedCount = await runLinkSecurityTrackingScan(env)
    expect(processedCount).toBe(1)

    // 対象になったlinkは、ヒューリスティック(IPアドレスリテラル)によりflaggedへ更新され、
    // lastScannedAtも新しい時刻に更新されている
    const eligible = await getLink(eligibleId)
    expect(eligible.securityStatus).toBe('flagged')
    expect(eligible.lastScannedAt.getTime()).toBeGreaterThan(oneHourAgo.getTime())

    // 対象外だったlinkはsecurityStatus・lastScannedAtとも変化していない
    const alreadyRescanned = await getLink(alreadyRescannedId)
    expect(alreadyRescanned.securityStatus).toBe('unscanned')

    const tooOld = await getLink(tooOldId)
    expect(tooOld.securityStatus).toBe('unscanned')
    expect(tooOld.lastScannedAt.getTime()).toBe(twentyFiveHoursAgo.getTime())

    const suspended = await getLink(suspendedId)
    expect(suspended.securityStatus).toBe('unscanned')

    const deleted = await getLink(deletedId)
    expect(deleted.securityStatus).toBe('unscanned')
  })

  it('対象が無い場合は0を返す', async () => {
    const processedCount = await runLinkSecurityTrackingScan(env)
    expect(processedCount).toBe(0)
  })
})

describe('runLinkSecurityFullScan', () => {
  it('lastScannedAtの新旧を問わず、活動中(active・未削除)の全linkを対象にする', async () => {
    const userId = await signUpAndGetUserId()
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * ONE_HOUR_MS)

    // 対象: 作成・最終検査とも古いactiveなlink(24時間以内追跡スキャンの対象からは外れるが、
    // 週次の全件再スキャンでは対象になるべき)
    const oldActiveId = await insertLinkFixture({ userId, createdAt: thirtyDaysAgo, lastScannedAt: thirtyDaysAgo })

    // 対象外: activeでない
    const suspendedId = await insertLinkFixture({ userId, status: 'suspended', createdAt: thirtyDaysAgo, lastScannedAt: thirtyDaysAgo })

    // 対象外: ソフトデリート済み
    const deletedId = await insertLinkFixture({ userId, deletedAt: new Date(), createdAt: thirtyDaysAgo, lastScannedAt: thirtyDaysAgo })

    // このテストファイル内の他のit()ブロック(runLinkSecurityTrackingScan)で作成したactiveな
    // linkも同じD1インスタンスに残ったままのため(@cloudflare/vitest-pluginはテストファイル単位で
    // D1を使い回す)、processedCountの厳密な値ではなく、個々のlinkの更新有無で検証する
    const processedCount = await runLinkSecurityFullScan(env)
    expect(processedCount).toBeGreaterThanOrEqual(1)

    const oldActive = await getLink(oldActiveId)
    expect(oldActive.securityStatus).toBe('flagged')
    expect(oldActive.lastScannedAt.getTime()).toBeGreaterThan(thirtyDaysAgo.getTime())

    const suspended = await getLink(suspendedId)
    expect(suspended.lastScannedAt.getTime()).toBe(thirtyDaysAgo.getTime())

    const deleted = await getLink(deletedId)
    expect(deleted.lastScannedAt.getTime()).toBe(thirtyDaysAgo.getTime())
  })
})
