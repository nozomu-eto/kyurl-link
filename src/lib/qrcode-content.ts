import { and, eq, isNull } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { links, qrcodes } from '@/db/schema'

// GET /api/v1/qrcodes/:id/imageで、QRコードに埋め込む内容(短縮URL、または直接指定のURL)を
// 決める処理。SVG・PNGのどちらの生成でも同じ内容にするため、共通の関数にまとめる
export type QrcodeContentResult = { ok: true; content: string } | { ok: false; message: string }

// dbはdrizzle(c.env.DB)由来のインスタンスを受け取る想定。呼び出し元のschema指定に依らず
// 使えるよう、任意のTSchemaを受け付ける(account-request-cancellation.tsと同じ考え方)
export async function resolveQrcodeContent<TSchema extends Record<string, unknown>>(
  db: DrizzleD1Database<TSchema>,
  record: typeof qrcodes.$inferSelect,
  origin: string,
): Promise<QrcodeContentResult> {
  if (record.targetType === 'link') {
    const targetId = record.targetId
    if (!targetId) {
      return { ok: false, message: '対象のlinkが見つかりません' }
    }

    // 対象linkのshortCodeを取得し、`{origin}/{shortCode}`(リダイレクトURL)をQRコードの内容にする
    const [targetLink] = await db
      .select({ shortCode: links.shortCode })
      .from(links)
      .where(and(eq(links.id, targetId), isNull(links.deletedAt)))
      .limit(1)

    if (!targetLink) {
      return { ok: false, message: '対象のlinkが見つかりません' }
    }

    return { ok: true, content: `${origin}/${targetLink.shortCode}` }
  }

  // targetType='rawUrl'の場合は、保存されたURLをそのままQRコードの内容にする
  const targetUrl = record.targetUrl
  if (!targetUrl) {
    return { ok: false, message: '対象URLが見つかりません' }
  }

  return { ok: true, content: targetUrl }
}
