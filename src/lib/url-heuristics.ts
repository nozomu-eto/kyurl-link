// 既知の短縮URLサービスのホスト名一覧。これらへの「再短縮」(本来の遷移先を短縮URLの連鎖で
// 隠す手口)を検知するために使う
const KNOWN_URL_SHORTENER_HOSTS = new Set(['bit.ly', 'tinyurl.com', 'is.gd', 't.co', 'goo.gl'])

// ホスト名がIPv4アドレスリテラルかどうかを判定する(例: 192.168.1.1)。
// 正規のドメインではなくIPアドレスを直接指定するURLは、ドメイン取得・DNS登録の手間を
// 避けた悪意ある配布に使われやすいため、1つの検知シグナルとする
function isIpLiteralHost(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)
}

// ホスト名がPunycode(IDN、'xn--'始まり)かどうかを判定する。
// 見た目が正規ドメインに酷似した文字(キリル文字等)をPunycodeエンコードして
// ブラウザ表示上そっくりに見せる「ホモグラフ攻撃」の疑いがあるシグナルとする
function isPunycodeHost(hostname: string): boolean {
  return hostname.split('.').some((label) => label.startsWith('xn--'))
}

// URLが既知の短縮URLサービスへの「再短縮」になっていないかを判定する。
// 短縮URLを短縮URLで包むと、利用者はクリックするまで本来の遷移先を確認できなくなるため、
// 悪意あるURLを隠す手口として使われやすい
function isReshortenedUrl(hostname: string): boolean {
  return KNOWN_URL_SHORTENER_HOSTS.has(hostname.toLowerCase())
}

// URL全体の長さが異常に長くないかを判定する。
// 極端に長いURL(クエリパラメータの大量付与等)は、フィルタ回避や難読化の兆候として扱う
const MAX_REASONABLE_URL_LENGTH = 2000

// サブドメインの階層が異常に多くないかを判定する。
// 例: a.b.c.d.e.f.example.com のような多階層サブドメインは、正規ドメイン名の一部に
// 見せかけてブランド名等を埋め込む手口(タイポスクワッティングの一種)に使われやすい
const MAX_REASONABLE_SUBDOMAIN_DEPTH = 6

// 与えられたURLをヒューリスティックにより検査し、不審な特徴が無いかを判定する。
// DB・ネットワーク呼び出しを含まない純粋関数(文字列解析のみ)にすることで、
// 実際のネットワーク呼び出し無しに単体テストできるようにしている。
// docs/architecture.md 第4節「作成時のヒューリスティック」に対応する
export function checkUrlHeuristics(url: string): { flagged: boolean; reasons: string[] } {
  const reasons: string[] = []

  // URLとして解析できない場合、URLかどうかの検証自体は呼び出し元(zodのz.string().url())の
  // 責務のため、ここでは解析失敗を「不審」とはせず、それ以外のチェックのみ行う
  let hostname: string | null = null
  try {
    hostname = new URL(url).hostname
  } catch {
    hostname = null
  }

  if (hostname !== null) {
    if (isIpLiteralHost(hostname)) {
      reasons.push('ホスト名がIPアドレスリテラルです')
    }
    if (isPunycodeHost(hostname)) {
      reasons.push('ホスト名がPunycode(IDN)です')
    }
    if (isReshortenedUrl(hostname)) {
      reasons.push('既知の短縮URLサービスへの再短縮です')
    }
    const subdomainDepth = hostname.split('.').length
    if (subdomainDepth > MAX_REASONABLE_SUBDOMAIN_DEPTH) {
      reasons.push('サブドメインの階層が異常に多いです')
    }
  }

  // URLに'@'を含む場合、authority混乱攻撃(例: http://real.com@evil.com、'@'より前は
  // ユーザー情報として無視され実際には evil.com に遷移する)の疑いがある
  if (url.includes('@')) {
    reasons.push("URLに'@'を含みます(authority混乱攻撃の疑い)")
  }

  if (url.length > MAX_REASONABLE_URL_LENGTH) {
    reasons.push('URL全体が異常に長いです')
  }

  return { flagged: reasons.length > 0, reasons }
}
