import { and, eq, gt, isNull, lte, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { links } from '@/db/schema'
import { determineLinkSecurityStatus } from '@/lib/link-security-check'

// links.createdAtは秒精度(mode: 'timestamp')、links.lastScannedAtはミリ秒精度
// (mode: 'timestamp_ms')で保存されている(理由はsrc/db/schema.tsのコメント参照)。
// SQL上で両者を直接比較すると単位が食い違い誤判定するため、createdAtを*1000してミリ秒に揃える。
// さらに、作成時チェック(POST /links)ではcreatedAt(DBのunixepoch()、秒未満切り捨て)と
// lastScannedAt(アプリ側のnew Date()、ミリ秒まで含む)がほぼ同時刻でも数百ms前後ずれうるため、
// 「作成時チェックからまだ再検査されていない」と判定する猶予(バッファ)を設ける
const CREATED_AT_TO_MS = 1000
const CREATION_SCAN_BUFFER_MS = 60_000

// 24時間以内の追跡スキャン(docs/architecture.md 第4節「第2段階」)。
// 作成後24時間以内で、かつ作成時チェック以降まだ再検査されていない(lastScannedAtが
// createdAt+バッファの範囲内にとどまっている)activeなlinkを対象に、ヒューリスティック+
// URLhaus照合を再実行する。作成直後は問題が無くても、URLhausへの登録がその後に
// 行われるケースを拾うための追跡措置。
// Cron Trigger(1日1回、src/index.tsxのscheduledハンドラ)から呼び出される想定
export async function runLinkSecurityTrackingScan(env: CloudflareBindings): Promise<number> {
  const db = drizzle(env.DB)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const targets = await db
    .select()
    .from(links)
    .where(
      and(
        eq(links.status, 'active'),
        isNull(links.deletedAt),
        gt(links.createdAt, twentyFourHoursAgo),
        lte(links.lastScannedAt, sql`${links.createdAt} * ${CREATED_AT_TO_MS} + ${CREATION_SCAN_BUFFER_MS}`),
      ),
    )

  for (const target of targets) {
    const securityStatus = await determineLinkSecurityStatus(target.originalUrl, env.URLHAUS_API_KEY)
    await db.update(links).set({ securityStatus, lastScannedAt: new Date() }).where(eq(links.id, target.id))
  }

  return targets.length
}

// 週1回の全件再スキャン(docs/architecture.md 第4節「第3段階」)。
// lastScannedAtによる絞り込みは行わず、activeな全linkを対象に再検査する
// (作成からしばらく経ってサイト内容が改ざんされた・悪用され始めたケースを拾うための措置)。
// Cron Trigger(週1回、src/index.tsxのscheduledハンドラ)から呼び出される想定
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
