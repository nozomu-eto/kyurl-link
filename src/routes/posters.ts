import puppeteer from '@cloudflare/puppeteer'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { links, posters, qrcodes } from '@/db/schema'
import { buildPosterExportHashSource, computePosterBatchExportCacheKey, computePosterExportCacheKey } from '@/lib/poster-export-cache'
import { computePosterLinkStatus, type PosterLinkStatus } from '@/lib/poster-link-status'
import {
  generatePosterA4SheetHtml,
  generatePosterA4SheetsHtml,
  generatePosterFaceHtml,
  generatePosterHtml,
  getA4SheetMaxFaces,
  getPosterBatchMaxFaces,
  getPosterShortUrlText,
  POSTER_PDF_OPTIONS,
  POSTER_PNG_DEVICE_SCALE_FACTOR,
  POSTER_BATCH_MAX_SHEETS,
  POSTER_PNG_ELEMENT_SELECTOR,
  POSTER_TEMPLATE_VERSION,
} from '@/shared/poster-template'
import { resolveQrcodeContent } from '@/lib/qrcode-content'
import { renderQrcodeSvg } from '@/lib/qrcode-image'
import { authMiddleware, type AuthUser } from '@/middleware/auth'
import { userRateLimitMiddleware } from '@/middleware/rate-limit'
import { blockAccountDeletionPending } from '@/middleware/block-account-deletion-pending'
import { requireVerifiedEmail } from '@/middleware/require-verified-email'
import { jsonValidator } from '@/middleware/json-validator'
import {
  posterBatchExportInputSchema,
  posterCreateInputSchema,
  posterListResponseSchema,
  posterSchema,
  posterUpdateInputSchema,
} from '@/shared/schemas/poster'

// レイアウトテンプレートは現在'default'のみを扱う
const DEFAULT_LAYOUT_TEMPLATE = 'default'

// DB上のposterレコード(styleOptionsはJSON文字列)を、レスポンス用スキーマの形
// (styleOptionsをJSON.parseしたオブジェクト・linkStatusを追加したもの)に変換する
// 使っているQRコードの名前と作成日時(一覧・詳細の表示用)も、QRコードのレコードから付け足す
function toPosterResponse(
  record: typeof posters.$inferSelect,
  qrcode: typeof qrcodes.$inferSelect | null,
  link: typeof links.$inferSelect | null,
  linkStatus: PosterLinkStatus,
) {
  // 短縮URL経由のQRコードのときだけ、短縮URLの情報を返す(直接指定のときはnull)
  const targetLink = qrcode?.targetType === 'link' ? link : null
  return posterSchema.parse({
    ...record,
    createdAt: record.createdAt.toISOString(),
    qrCodeName: qrcode?.name ?? null,
    qrCodeCreatedAt: (qrcode?.createdAt ?? record.createdAt).toISOString(),
    targetShortCode: targetLink?.shortCode ?? null,
    targetLinkId: targetLink?.id ?? null,
    linkExpiresAt: targetLink?.expiresAt ?? null,
    styleOptions: record.styleOptions === null ? null : JSON.parse(record.styleOptions),
    linkStatus,
  })
}

// 掲示物(poster)→QRコード(qrcodes)→短縮URL(links)をleftJoinでまとめて取得するクエリを
// 組み立てる。一覧・詳細のどちらも、掲示物ごとに追加の問い合わせをせず1回のクエリで
// linkStatus計算に必要な情報を取得するために共有する
function selectPostersWithLinkFields(db: ReturnType<typeof drizzle>) {
  return db
    .select({ poster: posters, qrcode: qrcodes, link: links })
    .from(posters)
    .leftJoin(qrcodes, eq(posters.qrCodeId, qrcodes.id))
    .leftJoin(links, eq(qrcodes.targetId, links.id))
}

// poster(掲示物)リソースのルート。links.ts/qrcodes.tsと同じパターンでメソッドチェーンで定義する。
// c.env.DBを使うため、HonoのBindingsにCloudflareBindingsを、authMiddlewareが
// c.set('user', ...)するため、Variablesにもuserの型を指定する
const app = new Hono<{ Bindings: CloudflareBindings; Variables: { user: AuthUser } }>()
  .basePath('/posters')
  // 一覧取得は認証必須(docs/architecture.mdの「API設計」)
  .get('/', authMiddleware, async (c) => {
    const db = drizzle(c.env.DB)
    const userId = c.get('user').id

    // ソフトデリート済み(deletedAtが設定されている)レコードは一覧に含めない。
    // 他人のposterが混ざらないよう、ログインユーザー自身のものだけに絞り込む。
    // 並びは作成日が新しい順(docs/architecture.mdの「後で見直すべき点」参照)。
    // ページングは未実装のため固定値を返す
    const rows = await selectPostersWithLinkFields(db)
      .where(and(isNull(posters.deletedAt), eq(posters.userId, userId)))
      .orderBy(desc(posters.createdAt))

    const response = posterListResponseSchema.parse({
      items: rows.map((row) => toPosterResponse(row.poster, row.qrcode, row.link, computePosterLinkStatus(row.qrcode, row.link))),
      total: rows.length,
      limit: 20,
      offset: 0,
    })

    return c.json(response)
  })
  // 新規作成
  .post('/', authMiddleware, requireVerifiedEmail, blockAccountDeletionPending, userRateLimitMiddleware('WRITE_RATE_LIMITER'), jsonValidator(posterCreateInputSchema), async (c) => {
    // 検証済みのリクエストボディ(jsonValidatorがスキーマで検証する)
    const input = c.req.valid('json')

    const db = drizzle(c.env.DB)
    const userId = c.get('user').id

    // 指定されたqrCodeIdが実在し、ソフトデリートされておらず、かつログインユーザー自身の
    // qrcodeであることを確認する。userIdの条件を付けないと、他人のqrcodeにも自由に
    // 掲示物を紐付けられてしまうため必須
    const [targetQrcode] = await db
      .select({ id: qrcodes.id })
      .from(qrcodes)
      .where(and(eq(qrcodes.id, input.qrCodeId), isNull(qrcodes.deletedAt), eq(qrcodes.userId, userId)))
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
    // (layoutTemplateは現在'default'固定、styleOptionsは作成時null固定)。
    // subtitleは省略時undefinedになるためnullへ変換する
    const [created] = await db
      .insert(posters)
      .values({
        id: crypto.randomUUID(),
        userId,
        title: input.title,
        subtitle: input.subtitle ?? null,
        layoutTemplate: DEFAULT_LAYOUT_TEMPLATE,
        styleOptions: null,
        size: input.size,
        qrCodeId: input.qrCodeId,
      })
      .returning()

    // linkStatus計算のため、作成したposterを対象にqrcode/linkを含めて再取得する
    const [row] = await selectPostersWithLinkFields(db).where(eq(posters.id, created.id)).limit(1)

    return c.json(toPosterResponse(created, row?.qrcode ?? null, row?.link ?? null, computePosterLinkStatus(row?.qrcode ?? null, row?.link ?? null)), 201)
  })
  // 詳細取得
  .get('/:id', authMiddleware, async (c) => {
    const db = drizzle(c.env.DB)
    const id = c.req.param('id')
    const userId = c.get('user').id

    const [row] = await selectPostersWithLinkFields(db)
      .where(and(eq(posters.id, id), eq(posters.userId, userId)))
      .limit(1)

    // 見つからない、ソフトデリート済み、または他人のposterの場合は404。
    // 他人のリソースが存在すること自体を漏らさないため、区別しない
    if (!row || row.poster.deletedAt !== null) {
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

    return c.json(toPosterResponse(row.poster, row.qrcode, row.link, computePosterLinkStatus(row.qrcode, row.link)))
  })
  // title/subtitle/styleOptions/size/qrCodeIdを更新できる
  .patch('/:id', authMiddleware, requireVerifiedEmail, jsonValidator(posterUpdateInputSchema), async (c) => {
    const id = c.req.param('id')
    const userId = c.get('user').id

    // 検証済みのリクエストボディ(jsonValidatorがスキーマで検証する)
    const input = c.req.valid('json')

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

    // 使うQRコードを変える場合は、作成時と同じく、自分の・削除されていないQRコードであることを確認する
    if (input.qrCodeId !== undefined) {
      const [targetQrcode] = await db
        .select({ id: qrcodes.id })
        .from(qrcodes)
        .where(and(eq(qrcodes.id, input.qrCodeId), isNull(qrcodes.deletedAt), eq(qrcodes.userId, userId)))
        .limit(1)

      if (!targetQrcode) {
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
    }

    // リクエストで指定されたフィールドのみを更新対象にする。styleOptionsのDB保存時はJSON文字列化する
    const updateValues: Partial<typeof posters.$inferInsert> = {}
    if (input.title !== undefined) {
      updateValues.title = input.title
    }
    if (input.subtitle !== undefined) {
      updateValues.subtitle = input.subtitle
    }
    if (input.styleOptions !== undefined) {
      updateValues.styleOptions = JSON.stringify(input.styleOptions)
    }
    if (input.size !== undefined) {
      updateValues.size = input.size
    }
    if (input.qrCodeId !== undefined) {
      updateValues.qrCodeId = input.qrCodeId
    }

    const [updated] = await db
      .update(posters)
      .set(updateValues)
      .where(and(eq(posters.id, id), eq(posters.userId, userId)))
      .returning()

    const [row] = await selectPostersWithLinkFields(db).where(eq(posters.id, id)).limit(1)

    return c.json(toPosterResponse(updated, row?.qrcode ?? null, row?.link ?? null, computePosterLinkStatus(row?.qrcode ?? null, row?.link ?? null)))
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
  // PDF/PNG書き出し(Browser Rendering生成 + R2内容ハッシュキャッシュ、docs/architecture.mdの「掲示物PDF/PNG生成・キャッシュ設計」)
  .get('/:id/export', authMiddleware, requireVerifiedEmail, userRateLimitMiddleware('POSTER_EXPORT_RATE_LIMITER'), async (c) => {
    const db = drizzle(c.env.DB)
    const id = c.req.param('id')
    const userId = c.get('user').id

    // 1. まず対象posterに対する認可チェック(存在確認・ソフトデリート確認・所有者確認)を行う。
    // docs/architecture.mdの「セキュリティ設計」「掲示物PDFキャッシュ(R2)の認可チェックは、必ずWorkerの
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

    // 2.5 paperクエリパラメータ(a4/fit、初期値a4)を検証する。format=pngの場合はpaperを
    // 無視する(検証もしない。3-3のqrcodesのsizeと同じ扱い)ため、format=pdfのときだけ検証する
    let paper: 'a4' | 'fit' = 'a4'
    if (format === 'pdf') {
      const rawPaper = c.req.query('paper') ?? 'a4'
      if (rawPaper !== 'a4' && rawPaper !== 'fit') {
        return c.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'paperにはa4またはfitを指定してください',
            },
          },
          400,
        )
      }
      paper = rawPaper
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

    // QRコードに埋め込む内容は、GET /api/v1/qrcodes/:id/imageと共通の関数で決める
    // (短縮URL経由は`{origin}/{shortCode}`、直接指定はそのURL)
    const contentResult = await resolveQrcodeContent(db, qrcode, new URL(c.req.url).origin)
    if (!contentResult.ok) {
      return c.json({ error: { code: 'NOT_FOUND', message: contentResult.message } }, 404)
    }
    const qrContent = contentResult.content
    // 掲示物に出す短縮URLも同じ内容(qrContent)から作り、QRコードと食い違わないようにする
    // (短縮URL経由のときだけ文字列になり、直接指定のURLのときはnullで表示しない)
    const shortUrlText = getPosterShortUrlText(qrcode.targetType, qrContent)

    // SVGの生成はqrcodes.tsのGET /:id/imageと共通のrenderQrcodeSvgを使う(向きの修正
    // (swap: true)を含め、QRコードの見た目が食い違わないようにするため)
    const qrCodeSvg = renderQrcodeSvg(qrContent)

    // 4. poster(title/subtitle/size/styleOptions)・QRコードのSVG内容・paper(pdfのみ)・
    // テンプレートの版からハッシュ値を計算し、R2オブジェクトキーを作る
    // (内容や書き出し設定が変われば別のキーになるキャッシュキー)
    const hashSource = buildPosterExportHashSource({
      title: poster.title,
      subtitle: poster.subtitle,
      size: poster.size,
      styleOptions: poster.styleOptions,
      qrCodeSvg,
      format,
      paper,
    })
    const objectKey = await computePosterExportCacheKey({
      posterId: poster.id,
      format,
      paper,
      templateVersion: POSTER_TEMPLATE_VERSION,
      hashSource,
    })
    const contentType = format === 'pdf' ? 'application/pdf' : 'image/png'

    // 5. 認可チェック(手順1)が完了した後で、R2(POSTER_CACHE)に既存オブジェクトが無いか確認する。
    // あればそれをそのまま返す
    const cachedObject = await c.env.POSTER_CACHE.get(objectKey)
    if (cachedObject) {
      return c.body(cachedObject.body, 200, { 'Content-Type': contentType })
    }

    // 6. キャッシュが無ければHTMLを生成し、Browser Rendering(@cloudflare/puppeteer)で
    // ページを開いてcontentをセットし、formatに応じてPDF/PNGを生成する。
    // format=pdf かつ paper=a4 の場合のみ、同じ掲示物をA4シートの全面に並べたHTMLにする
    // それ以外(format=pdf かつ paper=fit、またはformat=pngの場合。PNGはpaperを無視して
    // 常に掲示物1面分にする)は、掲示物サイズそのままの単体HTMLにする
    const html =
      format === 'pdf' && paper === 'a4'
        ? generatePosterA4SheetHtml(poster.size, Array(getA4SheetMaxFaces(poster.size)).fill(generatePosterFaceHtml({ ...poster, shortUrlText }, qrCodeSvg)))
        : generatePosterHtml({ title: poster.title, subtitle: poster.subtitle, size: poster.size, shortUrlText }, qrCodeSvg)

    const browser = await puppeteer.launch(c.env.BROWSER)
    let binary: Uint8Array<ArrayBuffer>
    try {
      const page = await browser.newPage()

      if (format === 'png') {
        // 既定のビューポート(800×600)のままだと掲示物の一部しか写らないため、ビューポートを指定する。
        // deviceScaleFactorでSNSに使える解像度にする(PDFは@pageのサイズがそのまま
        // 用紙サイズになるため、ビューポートの変更は不要)
        await page.setViewport({ width: 800, height: 600, deviceScaleFactor: POSTER_PNG_DEVICE_SCALE_FACTOR })
      }

      await page.setContent(html)

      let buffer: Uint8Array
      if (format === 'pdf') {
        buffer = await page.pdf(POSTER_PDF_OPTIONS)
      } else {
        // 画面全体ではなく、掲示物の要素だけを撮影する(PNGはpaperに関係なく掲示物1面分)
        const posterElement = await page.$(POSTER_PNG_ELEMENT_SELECTOR)
        if (!posterElement) {
          throw new Error(`掲示物の要素(${POSTER_PNG_ELEMENT_SELECTOR})が見つかりませんでした`)
        }
        buffer = await posterElement.screenshot({ type: 'png' })
      }

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

  // まとめて印刷: 同じサイズの複数の掲示物を、枚数を指定してA4用紙にまとめ、1つのPDFで返す
  // (docs/architecture.mdの「まとめて印刷」・第13節「まとめて印刷のキャッシュ」)。
  // 単体の書き出しと同じレート制限(POSTER_EXPORT_RATE_LIMITER)をかける。
  // 認可・存在・サイズ・上限のチェックは、すべてBrowser Rendering(puppeteer)を起動する前に行う
  .post('/batch-export', authMiddleware, requireVerifiedEmail, userRateLimitMiddleware('POSTER_EXPORT_RATE_LIMITER'), jsonValidator(posterBatchExportInputSchema), async (c) => {
    const { size, items } = c.req.valid('json')
    const db = drizzle(c.env.DB)
    const userId = c.get('user').id

    // 1. 上限(A4用紙10枚分の面数)を超えていないか。掲示物の件数だけで超える場合は、DBを引く前に弾く
    const maxFaces = getPosterBatchMaxFaces(size)
    const totalFaces = items.reduce((sum, item) => sum + item.count, 0)
    if (items.length > maxFaces || totalFaces > maxFaces) {
      return c.json(
        {
          error: {
            code: 'LIMIT_EXCEEDED',
            message: `1回にまとめて印刷できるのはA4用紙${POSTER_BATCH_MAX_SHEETS}枚(${size}は${maxFaces}面)までです`,
          },
        },
        400,
      )
    }

    // 2. 掲示物を、ログインユーザー自身の・削除されていないものに限って取得する。
    // 1件でも見つからない(存在しない・他人の・削除済み)場合は、どれが原因かを明かさず404にする
    const posterRows = await db
      .select()
      .from(posters)
      .where(
        and(
          inArray(
            posters.id,
            items.map((item) => item.posterId),
          ),
          eq(posters.userId, userId),
          isNull(posters.deletedAt),
        ),
      )
    const postersById = new Map(posterRows.map((row) => [row.id, row]))
    const targetPosters = items.map((item) => postersById.get(item.posterId))
    if (targetPosters.some((poster) => poster === undefined)) {
      return c.json({ error: { code: 'NOT_FOUND', message: '指定されたposterが見つかりません' } }, 404)
    }

    // 3. 指定されたサイズと違う掲示物が含まれていないか(A5とA6は同じ用紙に混ぜられない)
    if (targetPosters.some((poster) => poster?.size !== size)) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: `${size}以外のサイズの掲示物が含まれています。サイズごとに分けて印刷してください` } }, 400)
    }

    // 4. 掲示物ごとに、単体の書き出しと同じ手順でQRコードの内容(resolveQrcodeContent)・SVG・短縮URLの表示を決める。
    // 同じQRコードを使う掲示物が複数あっても、QRコードの解決は1回で済ませる
    const origin = new URL(c.req.url).origin
    const qrcodeCache = new Map<string, { qrCodeSvg: string; shortUrlText: string | null } | null>()
    const faceInputs: { poster: typeof posters.$inferSelect; qrCodeSvg: string; shortUrlText: string | null; count: number }[] = []

    for (const [index, poster] of targetPosters.entries()) {
      if (!poster) {
        continue
      }
      if (!qrcodeCache.has(poster.qrCodeId)) {
        const [qrcode] = await db.select().from(qrcodes).where(eq(qrcodes.id, poster.qrCodeId)).limit(1)
        if (!qrcode || qrcode.deletedAt !== null) {
          qrcodeCache.set(poster.qrCodeId, null)
        } else {
          const contentResult = await resolveQrcodeContent(db, qrcode, origin)
          qrcodeCache.set(
            poster.qrCodeId,
            contentResult.ok ? { qrCodeSvg: renderQrcodeSvg(contentResult.content), shortUrlText: getPosterShortUrlText(qrcode.targetType, contentResult.content) } : null,
          )
        }
      }

      const resolved = qrcodeCache.get(poster.qrCodeId)
      if (!resolved) {
        return c.json({ error: { code: 'NOT_FOUND', message: '対象のqrcodeが見つかりません' } }, 404)
      }
      faceInputs.push({ poster, ...resolved, count: items[index].count })
    }

    // 5. キャッシュキー: 単体の書き出し(PDF・A4)と同じ内容ハッシュを、順番どおりに枚数つきで並べる。
    // 認可チェック(手順2〜3)が済んでからR2を参照する(単体の書き出しと同じ順序)
    const objectKey = await computePosterBatchExportCacheKey({
      userId,
      size,
      templateVersion: POSTER_TEMPLATE_VERSION,
      items: faceInputs.map(({ poster, qrCodeSvg, count }) => ({
        hashSource: buildPosterExportHashSource({
          title: poster.title,
          subtitle: poster.subtitle,
          size: poster.size,
          styleOptions: poster.styleOptions,
          qrCodeSvg,
          format: 'pdf',
          paper: 'a4',
        }),
        count,
      })),
    })

    const cachedObject = await c.env.POSTER_CACHE.get(objectKey)
    if (cachedObject) {
      return c.body(cachedObject.body, 200, { 'Content-Type': 'application/pdf' })
    }

    // 6. キャッシュが無ければ、組み合わせ全体のHTML(複数のA4シートを改ページでつないだもの)を1回描画してPDFにする
    const faceHtmlList = faceInputs.flatMap(({ poster, qrCodeSvg, shortUrlText, count }) =>
      Array<string>(count).fill(generatePosterFaceHtml({ title: poster.title, subtitle: poster.subtitle, size, shortUrlText }, qrCodeSvg)),
    )
    const html = generatePosterA4SheetsHtml(size, faceHtmlList)

    const browser = await puppeteer.launch(c.env.BROWSER)
    let binary: Uint8Array<ArrayBuffer>
    try {
      const page = await browser.newPage()
      await page.setContent(html)
      binary = new Uint8Array(await page.pdf(POSTER_PDF_OPTIONS))
    } finally {
      await browser.close()
    }

    await c.env.POSTER_CACHE.put(objectKey, binary)

    return c.body(binary, 200, { 'Content-Type': 'application/pdf' })
  })

export default app
// Hono RPCクライアントから型推論できるようルートの型をexportする
export type PostersAppType = typeof app
