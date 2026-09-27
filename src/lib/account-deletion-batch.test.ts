import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { user } from '@/db/auth-schema'
import { accountRequests, links, posters, qrcodes } from '@/db/schema'
import { runAccountDeletionBatch } from '@/lib/account-deletion-batch'
import { linkSchema } from '@/shared/schemas/link'
import { posterSchema } from '@/shared/schemas/poster'
import { qrcodeSchema } from '@/shared/schemas/qrcode'
import { markEmailVerified } from '../../test/mark-email-verified'

const TEST_PASSWORD = 'password1234'

// サインアップし、authMiddlewareを通すためのセッションCookieと、作成されたuserのidを取得する。
// requireVerifiedEmailミドルウェアを通すため、作成直後にemailVerifiedをtrueにしておく
async function signUp() {
  const response = await SELF.fetch('https://example.com/api/auth/sign-up/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Better AuthはCSRF対策としてOriginを検証するため、BETTER_AUTH_URLと同じ値を付与する
      Origin: env.BETTER_AUTH_URL,
    },
    body: JSON.stringify({
      email: `test-${crypto.randomUUID()}@example.com`,
      password: TEST_PASSWORD,
      name: 'Test User',
      agreeToTerms: true,
    }),
  })

  const setCookie = response.headers.get('set-cookie')
  if (!setCookie) {
    throw new Error('サインアップのレスポンスにset-cookieが含まれていません')
  }
  const sessionCookie = setCookie.split(';')[0]

  const body = await response.json<{ user: { id: string } }>()
  const userId = body.user.id
  await markEmailVerified(userId)
  return { sessionCookie, userId }
}

// 認証済みlinkを1件作成する
async function createLink(sessionCookie: string) {
  const response = await SELF.fetch('https://example.com/api/v1/links', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify({ originalUrl: 'https://example.com/deletion-batch-target' }),
  })
  expect(response.status).toBe(201)
  return linkSchema.parse(await response.json())
}

// 認証済みqrcodeを1件作成する(targetType='rawUrl')
async function createQrcode(sessionCookie: string) {
  const response = await SELF.fetch('https://example.com/api/v1/qrcodes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify({ targetType: 'rawUrl', targetUrl: 'https://example.com/deletion-batch-qr' }),
  })
  expect(response.status).toBe(201)
  return qrcodeSchema.parse(await response.json())
}

// 認証済みposterを1件作成する
async function createPoster(sessionCookie: string, qrCodeId: string) {
  const response = await SELF.fetch('https://example.com/api/v1/posters', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify({ title: 'テスト掲示物', size: 'A6', qrCodeId }),
  })
  expect(response.status).toBe(201)
  return posterSchema.parse(await response.json())
}

// 退会申請を行い、作成されたaccountRequestのidを返す
async function requestAccountDeletion(sessionCookie: string) {
  const response = await SELF.fetch('https://example.com/api/v1/account-requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify({ password: TEST_PASSWORD }),
  })
  expect(response.status).toBe(201)
  const body = await response.json<{ id: string }>()
  return body.id
}

describe('runAccountDeletionBatch', () => {
  // GET /:id/exportを経由してR2にキャッシュを作るため、Browser Renderingを実際に起動する。
  // CI環境ではヘッドレスブラウザ実行に必要な共有ライブラリが無いためスキップする
  // (posters.test.tsと同じ理由。docs/deployment.md参照)
  it.skipIf(process.env.CI_SKIP_BROWSER_TEST)(
    '猶予期間を過ぎたaccountRequestのユーザーとリソースを物理削除し、R2キャッシュも削除する',
    async () => {
      const { sessionCookie, userId } = await signUp()
      const link = await createLink(sessionCookie)
      const qrcode = await createQrcode(sessionCookie)
      const poster = await createPoster(sessionCookie, qrcode.id)

      // env.EMAIL.send()を差し替えて、送信されたメールを記録する。
      // 申請受付メール(POST /api/v1/account-requests)と完全削除完了メール(バッチ内)の
      // 両方がこの過程で送信されるため、後段でsubjectを見て区別する
      const sentEmails: { subject?: string }[] = []
      env.EMAIL.send = async (message) => {
        sentEmails.push(message as { subject?: string })
        return { messageId: 'test-message-id' }
      }

      // R2に掲示物のキャッシュを作っておく(削除対象があることを確認するため)
      const exportResponse = await SELF.fetch(`https://example.com/api/v1/posters/${poster.id}/export?format=pdf`, {
        headers: { Cookie: sessionCookie },
      })
      expect(exportResponse.status).toBe(200)

      const listBefore = await env.POSTER_CACHE.list({ prefix: `${poster.id}/` })
      expect(listBefore.objects.length).toBeGreaterThan(0)

      const accountRequestId = await requestAccountDeletion(sessionCookie)

      // テストのため、scheduledDeletionAt(通常は申請から7日後)を直接過去の日時に書き換える
      const db = drizzle(env.DB)
      await db
        .update(accountRequests)
        .set({ scheduledDeletionAt: new Date(Date.now() - 1000) })
        .where(eq(accountRequests.id, accountRequestId))

      const processedCount = await runAccountDeletionBatch(env)
      expect(processedCount).toBe(1)

      // userテーブルから該当ユーザーが消えていること
      const [deletedUser] = await db.select().from(user).where(eq(user.id, userId))
      expect(deletedUser).toBeUndefined()

      // links/qrcodes/posters/accountRequestsも(cascadeにより)消えていること
      const [remainingLink] = await db.select().from(links).where(eq(links.id, link.id))
      expect(remainingLink).toBeUndefined()

      const [remainingQrcode] = await db.select().from(qrcodes).where(eq(qrcodes.id, qrcode.id))
      expect(remainingQrcode).toBeUndefined()

      const [remainingPoster] = await db.select().from(posters).where(eq(posters.id, poster.id))
      expect(remainingPoster).toBeUndefined()

      const [remainingRequest] = await db.select().from(accountRequests).where(eq(accountRequests.id, accountRequestId))
      expect(remainingRequest).toBeUndefined()

      // R2(POSTER_CACHE)から該当posterのオブジェクトが消えていること
      const listAfter = await env.POSTER_CACHE.list({ prefix: `${poster.id}/` })
      expect(listAfter.objects.length).toBe(0)

      // 完全削除完了メールが送信されたことを確認する(申請受付メールと合わせて2通のはず)
      expect(sentEmails).toHaveLength(2)
      expect(sentEmails).toContainEqual(
        expect.objectContaining({ subject: '【kyurl.link】アカウント削除が完了しました' }),
      )
    },
    30000,
  )

  it('scheduledDeletionAtがまだ未来のaccountRequestは処理対象にならない', async () => {
    const { sessionCookie, userId } = await signUp()
    await requestAccountDeletion(sessionCookie)
    // scheduledDeletionAtはデフォルト(申請から7日後)のまま、未来の日時になっている

    const processedCount = await runAccountDeletionBatch(env)
    expect(processedCount).toBe(0)

    const db = drizzle(env.DB)
    const [remainingUser] = await db.select().from(user).where(eq(user.id, userId))
    expect(remainingUser).toBeDefined()
  })

  it('取り消し済み(status: cancelled)のaccountRequestは、scheduledDeletionAtを過ぎていても処理対象にならない', async () => {
    const { sessionCookie, userId } = await signUp()
    const accountRequestId = await requestAccountDeletion(sessionCookie)

    const cancelResponse = await SELF.fetch('https://example.com/api/v1/account-requests/cancel', {
      method: 'POST',
      headers: { Cookie: sessionCookie },
    })
    expect(cancelResponse.status).toBe(200)

    // 猶予期間を過ぎた状態を再現する(runAccountDeletionBatchはstatus: 'pending'のみを対象にするため、
    // statusが'cancelled'に変わっていればこの日時になっていても処理されないはず)
    const db = drizzle(env.DB)
    await db
      .update(accountRequests)
      .set({ scheduledDeletionAt: new Date(Date.now() - 1000) })
      .where(eq(accountRequests.id, accountRequestId))

    const processedCount = await runAccountDeletionBatch(env)
    expect(processedCount).toBe(0)

    const [remainingUser] = await db.select().from(user).where(eq(user.id, userId))
    expect(remainingUser).toBeDefined()
  })
})
