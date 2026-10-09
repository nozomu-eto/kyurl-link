import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { links } from '@/db/schema'
import { runLinkSecurityFullScan } from '@/lib/link-security-scan-batch'

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

describe('runLinkSecurityFullScan', () => {
  it('lastScannedAtの新旧を問わず、活動中(active・未削除)の全linkを対象にする', async () => {
    const userId = await signUpAndGetUserId()
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * ONE_HOUR_MS)

    // 対象: 作成・最終検査とも古いactiveなlink(作成直後でなくても日次の全件スキャンの対象になる)
    const oldActiveId = await insertLinkFixture({ userId, createdAt: thirtyDaysAgo, lastScannedAt: thirtyDaysAgo })

    // 対象外: activeでない
    const suspendedId = await insertLinkFixture({ userId, status: 'suspended', createdAt: thirtyDaysAgo, lastScannedAt: thirtyDaysAgo })

    // 対象外: ソフトデリート済み
    const deletedId = await insertLinkFixture({ userId, deletedAt: new Date(), createdAt: thirtyDaysAgo, lastScannedAt: thirtyDaysAgo })

    const processedCount = await runLinkSecurityFullScan(env)
    expect(processedCount).toBe(1)

    const oldActive = await getLink(oldActiveId)
    expect(oldActive.securityStatus).toBe('flagged')
    expect(oldActive.lastScannedAt.getTime()).toBeGreaterThan(thirtyDaysAgo.getTime())

    const suspended = await getLink(suspendedId)
    expect(suspended.lastScannedAt.getTime()).toBe(thirtyDaysAgo.getTime())

    const deleted = await getLink(deletedId)
    expect(deleted.lastScannedAt.getTime()).toBe(thirtyDaysAgo.getTime())
  })
})
