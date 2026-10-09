import { and, eq, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { links } from '@/db/schema'
import { determineLinkSecurityStatus } from '@/lib/link-security-check'

// 日次の全件スキャン(docs/architecture.md 第4節「第2段階」)。
// lastScannedAtによる絞り込みは行わず、activeな全linkを対象に再検査する
// (作成後にURLhausへ登録された・サイト内容が改ざんされた・悪用され始めたケースを、
// 翌日までに拾うための措置)。
// Cron Trigger(1日1回、src/index.tsxのscheduledハンドラ)から呼び出される想定
export async function runLinkSecurityFullScan(env: CloudflareBindings): Promise<number> {
  const db = drizzle(env.DB)

  const targets = await db
    .select()
    .from(links)
    .where(and(eq(links.status, 'active'), isNull(links.deletedAt)))

  for (const target of targets) {
    const securityStatus = await determineLinkSecurityStatus(target.originalUrl, env.URLHAUS_API_KEY)
    await db.update(links).set({ securityStatus, lastScannedAt: new Date() }).where(eq(links.id, target.id))
  }

  return targets.length
}
