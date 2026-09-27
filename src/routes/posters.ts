import puppeteer from '@cloudflare/puppeteer'
import { and, eq, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { links, posters, qrcodes } from '@/db/schema'
import { generatePosterHtml } from '@/lib/poster-template'
import { renderQrcodeSvg } from '@/lib/qrcode-image'
import { authMiddleware, type AuthUser } from '@/middleware/auth'
import { userRateLimitMiddleware } from '@/middleware/rate-limit'
import { requireVerifiedEmail } from '@/middleware/require-verified-email'
import {
  posterCreateInputSchema,
  posterListResponseSchema,
  posterSchema,
  posterUpdateInputSchema,
} from '@/shared/schemas/poster'

// レイアウトテンプレートは今回'default'のみを扱う
const DEFAULT_LAYOUT_TEMPLATE = 'default'

// DB上のposterレコード(styleOptionsはJSON文字列)を、レスポンス用スキーマの形
// (styleOptionsをJSON.parseしたオブジェクト)に変換する
function toPosterResponse(record: typeof posters.$inferSelect) {
  return posterSchema.parse({
    ...record,
    styleOptions: record.styleOptions === null ? null : JSON.parse(record.styleOptions),
  })
}

// poster(掲示物)リソースのルート。links.ts/qrcodes.tsと同じパターンでメソッドチェーンで定義する。
// c.env.DBを使うため、HonoのBindingsにCloudflareBindingsを、authMiddlewareが
// c.set('user', ...)するため、Variablesにもuserの型を指定する
const app = new Hono<{ Bindings: CloudflareBindings; Variables: { user: AuthUser } }>()
  .basePath('/posters')
  // 一覧取得は認証必須(docs/architecture.md 第7節)
  .get('/', authMiddleware, async (c) => {
    const db = drizzle(c.env.DB)
    const userId = c.get('user').id

    // ソフトデリート済み(deletedAtが設定されている)レコードは一覧に含めない。
    // 他人のposterが混ざらないよう、ログインユーザー自身のものだけに絞り込む。
    // ページングは未実装のため暫定的に固定値を返す
    const items = await db
      .select()
      .from(posters)
      .where(and(isNull(posters.deletedAt), eq(posters.userId, userId)))

    const response = posterListResponseSchema.parse({
      items: items.map((item) => toPosterResponse(item)),
      total: items.length,
      limit: 20,
      offset: 0,
    })

    return c.json(response)
  })
  // 新規作成
  .post('/', authMiddleware, requireVerifiedEmail, userRateLimitMiddleware('WRITE_RATE_LIMITER'), async (c) => {
    // リクエストボディをJSONとして読み取り、posterCreateInputSchemaで検証する
    const body = await c.req.json().catch(() => null)
    const parsed = posterCreateInputSchema.safeParse(body)

    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'リクエストボディが不正です',
            details: parsed.error.flatten(),
          },
        },
        400,
      )
    }

    const db = drizzle(c.env.DB)
    const userId = c.get('user').id

    // 指定されたqrCodeIdが実在し、ソフトデリートされておらず、かつログインユーザー自身の
    // qrcodeであることを確認する。userIdの条件を付けないと、他人のqrcodeにも自由に
    // 掲示物を紐付けられてしまうため必須
    const [targetQrcode] = await db
      .select({ id: qrcodes.id })
      .from(qrcodes)
      .where(and(eq(qrcodes.id, parsed.data.qrCodeId), isNull(qrcodes.deletedAt), eq(qrcodes.userId, userId)))
      .limit(1)

    if (!targetQrcode) {
      // 他人のqrcodeが存在すること自体を漏らさないよう、「存在しないqrCodeId」と同じエラーにする
      return c.json(
        {
          error: {
            code: 'INVALID_TARGET',
            message: '指定されたqrcodeが存在しないか、削除されています',
          },
        },
        400,
      )
    }

    // id・userId(所有者)・layoutTemplate・styleOptionsはサーバー側で決定して保存する
    // (layoutTemplateは今回'default'固定、styleOptionsは作成時null固定)
    const [created] = await db
      .insert(posters)
      .values({
        id: crypto.randomUUID(),
        userId,
        title: parsed.data.title,
        subtitle: parsed.data.subtitle ?? null,
        layoutTemplate: DEFAULT_LAYOUT_TEMPLATE,
        styleOptions: null,
        size: parsed.data.size,
        qrCodeId: parsed.data.qrCodeId,
      })
      .returning()

    return c.json(toPosterResponse(created), 201)
  })
  // 詳細取得
  .get('/:id', authMiddleware, async (c) => {
    const db = drizzle(c.env.DB)
    const id = c.req.param('id')
    const userId = c.get('user').id

    const [record] = await db
      .select()
      .from(posters)
      .where(and(eq(posters.id, id), eq(posters.userId, userId)))
      .limit(1)

    // 見つからない、ソフトデリート済み、または他人のposterの場合は404。
    // 他人のリソースが存在すること自体を漏らさないため、区別しない
    if (!record || record.deletedAt !== null) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: '指定されたposterが見つかりません',
          },
        },
        404,
      )
    }

    return c.json(toPosterResponse(record))
  })
  // title/subtitle/styleOptionsのみ更新可能
  .patch('/:id', authMiddleware, requireVerifiedEmail, async (c) => {
    const id = c.req.param('id')
    const userId = c.get('user').id

    const body = await c.req.json().catch(() => null)
    const parsed = posterUpdateInputSchema.safeParse(body)

    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'リクエストボディが不正です',
            details: parsed.error.flatten(),
          },
        },
        400,
      )
    }

    const db = drizzle(c.env.DB)

    const [existing] = await db
      .select()
      .from(posters)
      .where(and(eq(posters.id, id), eq(posters.userId, userId)))
      .limit(1)

    // 見つからない、ソフトデリート済み、または他人のposterの場合は404
    if (!existing || existing.deletedAt !== null) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: '指定されたposterが見つかりません',
          },
        },
        404,
      )
    }

    // リクエストで指定されたフィールドのみを更新対象にする。styleOptionsのDB保存時はJSON文字列化する
    const updateValues: Partial<typeof posters.$inferInsert> = {}
    if (parsed.data.title !== undefined) {
      updateValues.title = parsed.data.title
    }
    if (parsed.data.subtitle !== undefined) {
      updateValues.subtitle = parsed.data.subtitle
    }
    if (parsed.data.styleOptions !== undefined) {
      updateValues.styleOptions = JSON.stringify(parsed.data.styleOptions)
    }

    const [updated] = await db
      .update(posters)
      .set(updateValues)
      .where(and(eq(posters.id, id), eq(posters.userId, userId)))
      .returning()

    return c.json(toPosterResponse(updated))
  })
  // 物理削除はせず、deletedAtに現在時刻をセットするソフトデリート
  .delete('/:id', authMiddleware, async (c) => {
    const id = c.req.param('id')
    const userId = c.get('user').id
    const db = drizzle(c.env.DB)

    const [existing] = await db
      .select()
      .from(posters)
      .where(and(eq(posters.id, id), eq(posters.userId, userId)))
      .limit(1)

    // 見つからない、既に削除済み、または他人のposterの場合は404
    if (!existing || existing.deletedAt !== null) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: '指定されたposterが見つかりません',
          },
        },
        404,
      )
    }

    await db
      .update(posters)
      .set({ deletedAt: new Date() })
      .where(and(eq(posters.id, id), eq(posters.userId, userId)))

    // ボディ無しの204を返す
    return c.body(null, 204)
  })
  // PDF/PNG書き出し(Browser Rendering生成 + R2内容ハッシュキャッシュ、docs/architecture.md 第13節)
  .get('/:id/export', authMiddleware, requireVerifiedEmail, userRateLimitMiddleware('POSTER_EXPORT_RATE_LIMITER'), async (c) => {
    const db = drizzle(c.env.DB)
    const id = c.req.param('id')
    const userId = c.get('user').id

    // 1. まず対象posterに対する認可チェック(存在確認・ソフトデリート確認・所有者確認)を行う。
    // docs/architecture.md 第9節「掲示物PDFキャッシュ(R2)の認可チェックは、必ずWorkerの
    // コード内で所有者チェックを行ってからキャッシュを参照する設計」に従い、この確認を
    // R2キャッシュの参照よりも必ず先に行う。もしキャッシュ確認を先にしてしまうと、
    // 本来アクセスできないはずのposterのidさえ知っていれば、認可チェックをすり抜けて
    // キャッシュ済みのPDF/PNGの中身を直接読めてしまうため
    const [poster] = await db
      .select()
      .from(posters)
      .where(and(eq(posters.id, id), eq(posters.userId, userId)))
      .limit(1)

    if (!poster || poster.deletedAt !== null) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: '指定されたposterが見つかりません',
          },
        },
        404,
      )
    }

    // 2. formatクエリパラメータ(pdf/png)を検証する。未指定はpdfをデフォルトとする
    const format = c.req.query('format') ?? 'pdf'
    if (format !== 'pdf' && format !== 'png') {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'formatはpdfまたはpngを指定してください',
          },
        },
        400,
      )
    }

    // 3. poster.qrCodeIdからqrcodeレコードを取得し、GET /api/v1/qrcodes/:id/imageと
    // 同様の方法で対象URLを解決してQRコードのSVGを生成する
    const [qrcode] = await db.select().from(qrcodes).where(eq(qrcodes.id, poster.qrCodeId)).limit(1)

    if (!qrcode || qrcode.deletedAt !== null) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: '対象のqrcodeが見つかりません',
          },
        },
        404,
      )
    }

    let qrContent: string
    if (qrcode.targetType === 'link') {
      const targetId = qrcode.targetId
      if (!targetId) {
        return c.json({ error: { code: 'NOT_FOUND', message: '対象のlinkが見つかりません' } }, 404)
      }

      const [targetLink] = await db
        .select({ shortCode: links.shortCode })
        .from(links)
        .where(and(eq(links.id, targetId), isNull(links.deletedAt)))
        .limit(1)

      if (!targetLink) {
        return c.json({ error: { code: 'NOT_FOUND', message: '対象のlinkが見つかりません' } }, 404)
      }

      qrContent = `${new URL(c.req.url).origin}/${targetLink.shortCode}`
    } else {
      const targetUrl = qrcode.targetUrl
      if (!targetUrl) {
        return c.json({ error: { code: 'NOT_FOUND', message: '対象URLが見つかりません' } }, 404)
      }

      qrContent = targetUrl
    }

    // SVGの生成はqrcodes.tsのGET /:id/imageと共通のrenderQrcodeSvgを使う(向きの修正
    // (swap: true)を含め、QRコードの見た目が食い違わないようにするため)
    const qrCodeSvg = renderQrcodeSvg(qrContent)

    // 4. poster(title/subtitle/size/styleOptions)とQRコードのSVG内容からハッシュ値を計算し、
    // R2オブジェクトキーを作る(内容が変われば別のキーになるキャッシュキー)
    const hashSource = JSON.stringify({
      title: poster.title,
      subtitle: poster.subtitle,
      size: poster.size,
      styleOptions: poster.styleOptions,
      qrCodeSvg,
    })
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hashSource))
    const hash = Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
    const objectKey = `${poster.id}/${format}/${hash}`
    const contentType = format === 'pdf' ? 'application/pdf' : 'image/png'

    // 5. 認可チェック(手順1)が完了した後で、R2(POSTER_CACHE)に既存オブジェクトが無いか確認する。
    // あればそれをそのまま返す
    const cachedObject = await c.env.POSTER_CACHE.get(objectKey)
    if (cachedObject) {
      return c.body(cachedObject.body, 200, { 'Content-Type': contentType })
    }

    // 6. キャッシュが無ければ、generatePosterHtmlでHTMLを生成し、Browser Rendering
    // (@cloudflare/puppeteer)でページを開いてcontentをセットし、formatに応じてPDF/PNGを生成する
    const html = generatePosterHtml({ title: poster.title, subtitle: poster.subtitle, size: poster.size }, qrCodeSvg)

    const browser = await puppeteer.launch(c.env.BROWSER)
    let binary: Uint8Array<ArrayBuffer>
    try {
      const page = await browser.newPage()
      await page.setContent(html)
      const buffer = format === 'pdf' ? await page.pdf() : await page.screenshot({ type: 'png' })
      // Buffer(Uint8Array<ArrayBufferLike>)をHonoのc.body()が受け付けるUint8Array<ArrayBuffer>に変換する
      binary = new Uint8Array(buffer)
    } finally {
      // 生成後は必ずブラウザセッションを閉じる
      await browser.close()
    }

    // 7. 生成したバイナリをR2に手順4のキーでputし、クライアントに返す
    await c.env.POSTER_CACHE.put(objectKey, binary)

    return c.body(binary, 200, { 'Content-Type': contentType })
  })

export default app
// Hono RPCクライアントから型推論できるようルートの型をexportする
export type PostersAppType = typeof app
