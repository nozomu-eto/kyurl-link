import { and, eq, getTableColumns, isNull, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { links, posters, qrcodes } from '@/db/schema'
import { authMiddleware, type AuthUser } from '@/middleware/auth'
import { userRateLimitMiddleware } from '@/middleware/rate-limit'
import { blockAccountDeletionPending } from '@/middleware/block-account-deletion-pending'
import { requireVerifiedEmail } from '@/middleware/require-verified-email'
import { jsonValidator } from '@/middleware/json-validator'
import { resolveQrcodeContent } from '@/lib/qrcode-content'
import { QRCODE_IMAGE_SIZE_OPTIONS, type QrcodeImageSize, renderQrcodePng, renderQrcodeSvg } from '@/lib/qrcode-image'
import {
  qrcodeCreateInputSchema,
  qrcodeListResponseSchema,
  qrcodeSchema,
  qrcodeUpdateInputSchema,
} from '@/shared/schemas/qrcode'

// qrcodeの取得に使う列。qrcodesの全列に加えて、レスポンスに必要な次の2つをサブクエリで同時に取得する
// (別テーブルの値のため、DBの列を増やさずに済む):
// - targetShortCode: 紐づく短縮URLのshortCode(targetType='rawUrl'の場合はNULL)
// - posterCount: このQRコードを使っている掲示物の件数(ソフトデリート済みは除く)
// 一覧の件数が多くてもD1のバインド変数の上限(IN句の個数)に当たらないよう、IN句ではなく行ごとの相関サブクエリにしている
//
// 注意: Drizzleは単一テーブルのselectでは列名にテーブル名を付けずに出力する(`"id"`のようになる)。
// サブクエリ内で外側のqrcodes.idを`"id"`と書くと、内側のテーブル(posters.id)を指してしまい常に不一致になるため、
// 外側の列は`${qrcodes}.列名`の形でテーブル名を明示している
const qrcodeSelection = {
  ...getTableColumns(qrcodes),
  targetShortCode: sql<string | null>`(select ${links.shortCode} from ${links} where ${links}.id = ${qrcodes}.target_id)`,
  posterCount: sql<number>`(select count(*) from ${posters} where ${posters}.qr_code_id = ${qrcodes}.id and ${posters}.deleted_at is null)`,
}

// DB上のqrcodeレコード(qrcodeSelectionで取得したもの)を、レスポンス用スキーマの形
// (createdAtをISO文字列化したもの)に変換する
function toQrcodeResponse(record: typeof qrcodes.$inferSelect & { targetShortCode: string | null; posterCount: number }) {
  return qrcodeSchema.parse({
    ...record,
    createdAt: record.createdAt.toISOString(),
    // SQLiteのcount(*)は整数だが、念のため数値に正規化する
    posterCount: Number(record.posterCount),
  })
}

// qrcode(QRコード)リソースのルート。links.tsと同じパターンでメソッドチェーンで定義する。
// c.env.DBを使うため、HonoのBindingsにCloudflareBindingsを、authMiddlewareが
// c.set('user', ...)するため、Variablesにもuserの型を指定する
const app = new Hono<{ Bindings: CloudflareBindings; Variables: { user: AuthUser } }>()
  .basePath('/qrcodes')
  // 一覧取得は認証必須(docs/architecture.md 第7節)
  .get('/', authMiddleware, async (c) => {
    const db = drizzle(c.env.DB)
    const userId = c.get('user').id

    // ソフトデリート済み(deletedAtが設定されている)レコードは一覧に含めない。
    // 他人のqrcodeが混ざらないよう、ログインユーザー自身のものだけに絞り込む。
    // ページングは未実装のため暫定的に固定値を返す
    const items = await db
      .select(qrcodeSelection)
      .from(qrcodes)
      .where(and(isNull(qrcodes.deletedAt), eq(qrcodes.userId, userId)))

    const response = qrcodeListResponseSchema.parse({
      items: items.map((item) => toQrcodeResponse(item)),
      total: items.length,
      limit: 20,
      offset: 0,
    })

    return c.json(response)
  })
  // 新規作成
  .post('/', authMiddleware, requireVerifiedEmail, blockAccountDeletionPending, userRateLimitMiddleware('WRITE_RATE_LIMITER'), jsonValidator(qrcodeCreateInputSchema), async (c) => {
    // 検証済みのリクエストボディ(jsonValidatorがスキーマで検証する)
    const input = c.req.valid('json')

    const db = drizzle(c.env.DB)
    const userId = c.get('user').id

    // targetType='link'の場合、指定されたtargetIdが実在し、ソフトデリートされておらず、
    // かつログインユーザー自身のlinkであることを確認する。
    // userIdの条件を付けないと、他人のlinkにも自由にQRコードを紐付けられてしまうため必須
    if (input.targetType === 'link') {
      const [targetLink] = await db
        .select({ id: links.id })
        .from(links)
        .where(and(eq(links.id, input.targetId), isNull(links.deletedAt), eq(links.userId, userId)))
        .limit(1)

      if (!targetLink) {
        // 他人のlinkが存在すること自体を漏らさないよう、「存在しないtargetId」と同じエラーにする
        return c.json(
          {
            error: {
              code: 'INVALID_TARGET',
              message: '指定されたlinkが存在しないか、削除されています',
            },
          },
          400,
        )
      }
    }

    // id・userId(所有者)はサーバー側で決定して保存する。
    // nameは任意入力のため、省略時(undefined)はnullとして保存する
    const [created] = await db
      .insert(qrcodes)
      .values({
        id: crypto.randomUUID(),
        userId,
        targetType: input.targetType,
        targetId: input.targetType === 'link' ? input.targetId : null,
        targetUrl: input.targetType === 'rawUrl' ? input.targetUrl : null,
        name: input.name ?? null,
      })
      .returning({ id: qrcodes.id })

    // 作成直後のレコードを、レスポンスに必要な値(読み取り先のshortCode・掲示物の件数)付きで取り直す
    const [createdRecord] = await db.select(qrcodeSelection).from(qrcodes).where(eq(qrcodes.id, created.id)).limit(1)

    return c.json(toQrcodeResponse(createdRecord), 201)
  })
  // 詳細取得
  .get('/:id', authMiddleware, async (c) => {
    const db = drizzle(c.env.DB)
    const id = c.req.param('id')
    const userId = c.get('user').id

    const [record] = await db
      .select(qrcodeSelection)
      .from(qrcodes)
      .where(and(eq(qrcodes.id, id), eq(qrcodes.userId, userId)))
      .limit(1)

    // 見つからない、ソフトデリート済み、または他人のqrcodeの場合は404。
    // 他人のリソースが存在すること自体を漏らさないため、区別しない
    if (!record || record.deletedAt !== null) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: '指定されたqrcodeが見つかりません',
          },
        },
        404,
      )
    }

    return c.json(toQrcodeResponse(record))
  })
  // nameのみ更新可能
  .patch('/:id', authMiddleware, requireVerifiedEmail, jsonValidator(qrcodeUpdateInputSchema), async (c) => {
    const id = c.req.param('id')
    const userId = c.get('user').id

    // 検証済みのリクエストボディ(jsonValidatorがスキーマで検証する)
    const input = c.req.valid('json')

    const db = drizzle(c.env.DB)

    const [existing] = await db
      .select(qrcodeSelection)
      .from(qrcodes)
      .where(and(eq(qrcodes.id, id), eq(qrcodes.userId, userId)))
      .limit(1)

    // 見つからない、ソフトデリート済み、または他人のqrcodeの場合は404
    if (!existing || existing.deletedAt !== null) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: '指定されたqrcodeが見つかりません',
          },
        },
        404,
      )
    }

    // リクエストで指定されたフィールドのみを更新対象にする
    const updateValues: Partial<typeof qrcodes.$inferInsert> = {}
    if (input.name !== undefined) {
      updateValues.name = input.name
    }

    // 更新対象が1つもない場合(空ボディや、無視される古いキーのみの場合)は、
    // UPDATE文が不正になるためDBを更新せず現在の内容をそのまま返す
    if (Object.keys(updateValues).length === 0) {
      return c.json(toQrcodeResponse(existing))
    }

    await db
      .update(qrcodes)
      .set(updateValues)
      .where(and(eq(qrcodes.id, id), eq(qrcodes.userId, userId)))

    // 更新後のレコードを、レスポンスに必要な値(読み取り先のshortCode・掲示物の件数)付きで取り直す
    const [updated] = await db.select(qrcodeSelection).from(qrcodes).where(eq(qrcodes.id, id)).limit(1)

    return c.json(toQrcodeResponse(updated))
  })
  // 物理削除はせず、deletedAtに現在時刻をセットするソフトデリート
  .delete('/:id', authMiddleware, async (c) => {
    const id = c.req.param('id')
    const userId = c.get('user').id
    const db = drizzle(c.env.DB)

    const [existing] = await db
      .select()
      .from(qrcodes)
      .where(and(eq(qrcodes.id, id), eq(qrcodes.userId, userId)))
      .limit(1)

    // 見つからない、既に削除済み、または他人のqrcodeの場合は404
    if (!existing || existing.deletedAt !== null) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: '指定されたqrcodeが見つかりません',
          },
        },
        404,
      )
    }

    await db
      .update(qrcodes)
      .set({ deletedAt: new Date() })
      .where(and(eq(qrcodes.id, id), eq(qrcodes.userId, userId)))

    // ボディ無しの204を返す
    return c.body(null, 204)
  })
  // QRコード画像(SVG・PNG)。リダイレクト等と同様、認証不要の公開エンドポイントとする
  // (docs/architecture.md 第7節)。所有者チェックの対象外(誰でもQRコードを読み取れる必要があるため)
  .get('/:id/image', async (c) => {
    // クエリformat(svg/png、既定svg。既存の<img src=".../image">の表示を変えないため既定はsvgのまま)。
    // sizeはformat=pngのときだけ使う(3-4のpaperと同じ扱い)
    const format = c.req.query('format') ?? 'svg'
    if (format !== 'svg' && format !== 'png') {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'formatにはsvgまたはpngを指定してください' } },
        400,
      )
    }

    let size: QrcodeImageSize = 1024
    if (format === 'png') {
      const rawSize = c.req.query('size')
      const parsedSize = rawSize === undefined ? 1024 : Number(rawSize)
      if (!QRCODE_IMAGE_SIZE_OPTIONS.includes(parsedSize as QrcodeImageSize)) {
        return c.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: `sizeには${QRCODE_IMAGE_SIZE_OPTIONS.join('/')}のいずれかを指定してください`,
            },
          },
          400,
        )
      }
      size = parsedSize as QrcodeImageSize
    }

    const db = drizzle(c.env.DB)
    const id = c.req.param('id')

    const [record] = await db.select().from(qrcodes).where(eq(qrcodes.id, id)).limit(1)

    // authMiddlewareを通さないため、エラーレスポンスもここでJSON形式に統一する
    if (!record || record.deletedAt !== null) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: '指定されたqrcodeが見つかりません',
          },
        },
        404,
      )
    }

    // QRコードに埋め込む内容(短縮URL、または直接指定のURL)を決める処理はSVG・PNGで共通
    const contentResult = await resolveQrcodeContent(db, record, new URL(c.req.url).origin)
    if (!contentResult.ok) {
      return c.json({ error: { code: 'NOT_FOUND', message: contentResult.message } }, 404)
    }

    if (format === 'svg') {
      return c.body(renderQrcodeSvg(contentResult.content), 200, { 'Content-Type': 'image/svg+xml' })
    }

    // PNGはマス目から直接生成でき数ミリ秒で終わるため、R2キャッシュには保存しない
    // (docs/architecture.md 第15節)。QRコード・リンクが削除された後に古い画像が長く
    // 出回らないよう、キャッシュは短め(1時間)にする
    const png = await renderQrcodePng(contentResult.content, size)
    return c.body(png, 200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600',
    })
  })

export default app
// Hono RPCクライアントから型推論できるようルートの型をexportする
export type QrcodesAppType = typeof app
