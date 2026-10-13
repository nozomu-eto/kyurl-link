import { env } from 'cloudflare:test'

// Rate Limiting binding(wrangler.jsoncのratelimits)の期間(秒)。4つのバインディングはすべて60秒
const RATE_LIMIT_PERIOD_SECONDS = 60

// 窓の残り時間がこれより短い場合は、次の窓になるまで待ってからテストを始める(ミリ秒)。
// 上限まで連続でリクエストするテストは、約2〜3秒かかるため、余裕を持って10秒とする
const MIN_REMAINING_WINDOW_MS = 10_000

// この補助関数を呼ぶテストに付けるタイムアウト(ミリ秒)。最大で窓の残り時間(10秒未満)だけ
// 待ち、そのあとテスト本体が数秒かかる。Vitestの既定(5秒)では足りないため延ばす
export const RATE_LIMIT_TEST_TIMEOUT_MS = 75_000

// 窓の番号。Miniflareが再現するRate Limiting bindingと同じ計算(Date.now()をperiodで切り捨て)
function getWindowIndex(now: number): number {
  return Math.floor(now / (RATE_LIMIT_PERIOD_SECONDS * 1000))
}

// workerdの中では、Date.now()はI/Oを挟むまで進まないことがある。時刻を読む前に、軽いI/O(D1への問い合わせ)を挟んで
// 時計を進めてから読む
async function readCurrentTime(): Promise<number> {
  await env.DB.prepare('select 1').first()
  return Date.now()
}

// waitForFreshRateLimitWindow: 窓の残り時間が十分あるところまで待つ。
// Miniflareの Rate Limiting binding は、時計に揃えた窓(epoch)ごとに回数を数え、窓が切り替わると
// 数え直す。そのため、上限まで連続でリクエストして429を期待するテストは、途中で窓が切り替わると
// 回数が戻り、上限に達せず失敗する(分の境目をまたいで実行されたビルドで実際に起きた)。
// これを避けるため、窓の残りが短いときは次の窓になるまで待ってから始める
// (Cloudflare自身のテストのwaitForFreshRateLimitWindowと同じ考え方)。
// Vitestのretryは失敗を隠してしまうため使わない。
// 待ったあとは、時刻が実際に進み、窓が変わったことを確かめる。確かめられなければ例外にする
export async function waitForFreshRateLimitWindow(): Promise<void> {
  const periodMs = RATE_LIMIT_PERIOD_SECONDS * 1000
  const startedAt = await readCurrentTime()
  const remainingMs = periodMs - (startedAt % periodMs)
  if (remainingMs >= MIN_REMAINING_WINDOW_MS) {
    return
  }

  const startWindow = getWindowIndex(startedAt)
  // 窓の切り替わりより少し長く待つ(タイマーの誤差を見込む)
  await new Promise((resolve) => setTimeout(resolve, remainingMs + 200))

  const afterWaitAt = await readCurrentTime()
  if (afterWaitAt <= startedAt || getWindowIndex(afterWaitAt) === startWindow) {
    throw new Error(`レート制限の窓が切り替わりませんでした(待機前 ${startedAt}、待機後 ${afterWaitAt})`)
  }
}
