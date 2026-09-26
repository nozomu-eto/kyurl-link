// リダイレクト時のエラーページ(404・410 Gone)のHTMLを生成する。
// 見出し・本文・補足の文言はdocs/architecture.md 第6.3節「エラーメッセージ・ライティング方針」で
// 確定済みのため、ここでは変更しない。文言を変更する場合は、必ずドキュメント側(第6.3節)も
// 合わせて更新すること
// 見た目はdocs/architecture.md 第6.2節(デザイントークン)・第6.6節(フォント方針)・
// docs/mocks/Visitor404.html・Visitor410.html・VisitorWarning.htmlに合わせる

// HTMLに値を埋め込む前に、利用者の入力値由来の文字列をエスケープする。
// originalUrl(元URL)は利用者がPOST /links作成時に入力した値であり、そのまま埋め込むと
// HTMLインジェクションの原因になるため、特殊文字を実体参照に置き換える
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

// 3画面共通のヘッダー・フッター・ボタン等のスタイル。
// 色は第6.2節のトークンの値をそのまま使う(この段階ではCSS変数の3層構造は未導入のため、
// HEX値を直接指定する)。フォントは第6.6節どおりシステムフォントのみ
const PAGE_STYLE = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Noto Sans JP', Meiryo, sans-serif;
    color: #222222;
    background: #F7F5F0;
  }
  a { text-decoration: none; }
  header {
    height: 56px;
    display: flex;
    align-items: center;
    padding: 0 20px;
    background: #FFFFFF;
    border-bottom: 1px solid #E3DFD5;
  }
  .header-logo {
    display: inline-flex;
    align-items: center;
    font-size: 17px;
    font-weight: 700;
    color: #2F5A93;
  }
  .header-logo:hover, .header-logo:focus-visible { color: #254673; }
  main {
    max-width: 480px;
    margin: 0 auto;
    padding: 40px 24px 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .icon-badge {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  h1 { margin: 0; font-size: 23px; font-weight: 700; line-height: 1.45; color: #1F1F1F; }
  p { margin: 0; }
  .body-text { font-size: 16px; line-height: 1.85; color: #222222; }
  .note { font-size: 14px; line-height: 1.75; color: #5A5A5A; }
  .actions { display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 52px;
    padding: 0 20px;
    border-radius: 4px;
    font-size: 16px;
    font-weight: 700;
    width: 100%;
  }
  .button--filled { background: #2F5A93; color: #FFFFFF; border: 1px solid #2F5A93; }
  .button--filled:hover { background: #254673; border-color: #254673; }
  .button--outline { background: #FFFFFF; color: #2F5A93; border: 1px solid #2F5A93; }
  .button--outline:hover { color: #254673; border-color: #254673; }
  .info-box {
    display: flex;
    gap: 12px;
    padding: 16px;
    background: #FFFFFF;
    border: 1px solid #E3DFD5;
    border-radius: 4px;
  }
  .info-box p { font-size: 15px; line-height: 1.75; color: #222222; }
  footer {
    display: flex;
    justify-content: center;
    gap: 24px;
    padding: 16px 0 24px;
    font-size: 13px;
  }
  footer a { color: #5A5A5A; min-height: 44px; display: inline-flex; align-items: center; }
  a:focus-visible, button:focus-visible, input:focus-visible, summary:focus-visible {
    outline: 3px solid #254673;
    outline-offset: 2px;
  }
`

// 全画面共通のヘッダー(サービス名のみ、トップページへのリンク)
const HEADER_HTML = `
<header>
<a href="/" class="header-logo">kyurl.link</a>
</header>
`

// 全画面共通のフッター(利用規約・プライバシーポリシーへのリンク)
const FOOTER_HTML = `
<footer>
<a href="/terms">利用規約</a>
<a href="/privacy">プライバシーポリシー</a>
</footer>
`

// 全画面共通の<head>(viewport・favicon無効化・タイトル・スタイル)
function pageHead(title: string, extraStyle = ''): string {
  return `<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="icon" href="data:," />
<title>${title}</title>
<style>${PAGE_STYLE}${extraStyle}</style>
</head>`
}

// 404用の虫眼鏡アイコン(背景は紺の薄い色、線は紺)
const NOT_FOUND_ICON = `<div class="icon-badge" style="background: #EAEEF4;">
<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#2F5A93" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<circle cx="11" cy="11" r="6.5"></circle>
<path d="M16 16l4 4"></path>
<path d="M9 11h4"></path>
</svg>
</div>`

// 410用の時計アイコン(背景 #EBE8E1、線 #4D4A44)
const GONE_ICON = `<div class="icon-badge" style="background: #EBE8E1;">
<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#4D4A44" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<circle cx="12" cy="12" r="8.5"></circle>
<path d="M12 7.5V12l3 2"></path>
</svg>
</div>`

// 警告画面用の三角の注意マークアイコン(背景は朱の薄い色、線は朱)
const WARNING_ICON = `<div class="icon-badge" style="background: #FAECEA;">
<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#D03E2F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M12 4L2.5 20h19z"></path>
<path d="M12 10v4.5"></path>
<path d="M12 17.5v.5"></path>
</svg>
</div>`

// 404(存在しない短縮コード)用のページHTMLを返す
export function notFoundPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="ja">
${pageHead('このページは見つかりませんでした')}
<body>
${HEADER_HTML}
<main>
${NOT_FOUND_ICON}
<h1>このページは見つかりませんでした</h1>
<p class="body-text">アクセスしようとしたURLは存在しないか、入力内容に誤りがある可能性があります。QRコードを読み取った場合は、印刷物やポスターに汚れ・破損がないかご確認ください。</p>
<p class="note">URLを直接入力した場合は、大文字・小文字やスペルをご確認のうえ、もう一度お試しください。</p>
<div class="actions">
<a href="/" class="button button--filled">トップページへ戻る</a>
</div>
</main>
${FOOTER_HTML}
</body>
</html>`
}

// 410 Gone(有効期限切れ・削除済み)用のページHTMLを返す
export function goneePageHtml(): string {
  return `<!DOCTYPE html>
<html lang="ja">
${pageHead('このリンクは現在ご利用いただけません')}
<body>
${HEADER_HTML}
<main>
${GONE_ICON}
<h1>このリンクは現在ご利用いただけません</h1>
<p class="body-text">このQRコード・URLは、有効期限が終了したか、提供が終了したため、現在はご案内先へお進みいただけません。</p>
<div class="info-box">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2F5A93" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M4 11l8-7 8 7"></path>
<path d="M6 10v10h12V10"></path>
</svg>
<p>最新の情報については、直接お店・施設にお問い合わせください。</p>
</div>
<div class="actions">
<a href="/" class="button button--outline">トップページへ戻る</a>
</div>
</main>
${FOOTER_HTML}
</body>
</html>`
}

// 警告インターステシャル(悪意あるURL検知フラグ)用のページHTMLを返す。
// shortCodeはgenerateShortCode()(src/routes/links.ts)がSHORT_CODE_CHARS(英数字)のみから
// 生成するサーバー制御の値であり、利用者入力ではないためHTMLへの直接埋め込みでも安全だが、
// 念のためJSON.stringifyで文字列リテラルとしてエスケープしてから埋め込む。
// 一方originalUrlは利用者がlink作成時に入力した値のため、escapeHtml()で必ずエスケープする
// (docs/architecture.md 第6.3節「警告インターステシャルの表示項目」)。
// 「このまま進む」は現在のパスに?proceed=1を付けた相対リンクのみで実現し(サーバー側で
// index.tsxがこのクエリパラメータを見て通常の302リダイレクトに切り替える)、
// 「戻る」はトップページに戻す(404/410ページと同じ導線に揃える)。
// 通報導線(利用規約第9条)は、reports.ts側を変更せず既存のPOST /api/v1/reportsをそのまま
// 流用するため、<details>で折りたたんだ簡易フォーム+インラインスクリプトからfetchで呼び出す。
// POST /api/v1/reportsはbot対策としてturnstileTokenを必須にしているため(docs/architecture.md
// 参照)、フォームにもCloudflare Turnstileのウィジェットを埋め込む。このページは静的な
// サーバーレンダリングHTMLのため、SPA向けのexplicit renderingではなく、
// cf-turnstileクラスによる暗黙的レンダリング(implicit rendering)を使う
// nonce: CSP(Content-Security-Policy-Report-Only、src/index.tsx)のscript-srcに設定した
// NONCEハンドラが生成する値。このページのインラインscript(下記)のnonce属性に設定することで、
// 将来enforceモード(Content-Security-Policy、docs/deployment.md参照)に切り替えた際も
// このインラインscriptだけは実行が許可されるようにする(公開前修正v2 T9)。
// 外部スクリプト(challenges.cloudflare.comのTurnstile本体)はホスト指定で許可されるため
// nonceは不要
export function securityWarningPageHtml(shortCode: string, turnstileSiteKey: string, nonce: string | undefined, originalUrl: string): string {
  const shortCodeJson = JSON.stringify(shortCode)
  const turnstileSiteKeyAttr = JSON.stringify(turnstileSiteKey)
  const nonceAttr = nonce ? ` nonce="${nonce}"` : ''
  const escapedOriginalUrl = escapeHtml(originalUrl)

  return `<!DOCTYPE html>
<html lang="ja">
${pageHead(
    'このリンク先の安全性を確認できませんでした',
    `
  details { margin-top: 4px; font-size: 14px; }
  summary { min-height: 44px; display: flex; align-items: center; cursor: pointer; color: #2F5A93; text-decoration: underline; }
  .report-form { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; }
  .report-form label { font-size: 14px; font-weight: 700; }
  .report-form input[type="text"] {
    height: 44px;
    padding: 0 12px;
    border: 1px solid #8A8478;
    border-radius: 4px;
    font-size: 16px;
    font-family: inherit;
  }
  .report-form button {
    height: 44px;
    padding: 0 16px;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
    background: #FFFFFF;
    color: #2F5A93;
    border: 1px solid #2F5A93;
  }
  .url-box {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 14px 16px;
    background: #FFFFFF;
    border: 1px solid #8A8478;
    border-radius: 4px;
  }
  .url-box .label { font-size: 12px; font-weight: 700; color: #5A5A5A; }
  .url-box .value { font-size: 15px; line-height: 1.6; color: #1F1F1F; word-break: break-all; }
`,
  )}
<body>
${HEADER_HTML}
<main>
${WARNING_ICON}
<h1>このリンク先の安全性を確認できませんでした</h1>
<p class="body-text">このリンクは、自動チェックにより注意が必要と判定されました。個人情報の入力やファイルのダウンロードを求められた場合は、内容を十分にご確認ください。</p>
<div class="url-box">
<span class="label">移動先のURL</span>
<span class="value">${escapedOriginalUrl}</span>
</div>
<p class="note">この判定は自動処理によるもので、誤って表示される場合があります。</p>
<div class="actions">
<a href="/" class="button button--filled">戻る</a>
<a href="?proceed=1" class="button button--outline">このまま進む</a>
</div>
<details>
<summary>このリンクに問題があると思われる場合はこちらから報告</summary>
<form id="report-form" class="report-form">
<label for="report-reason">報告理由</label>
<input id="report-reason" type="text" name="reason" required />
<div class="cf-turnstile" data-sitekey=${turnstileSiteKeyAttr}></div>
<button type="submit">送信する</button>
</form>
<p id="report-result" hidden></p>
</details>
</main>
${FOOTER_HTML}
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<script${nonceAttr}>
document.getElementById('report-form').addEventListener('submit', async function (event) {
  event.preventDefault()
  var reason = event.target.elements.reason.value
  var resultEl = document.getElementById('report-result')
  // window.turnstileはcf-turnstileクラスの要素を自動検出してレンダリングされたウィジェットの
  // トークンを取得する。ウィジェットの検証が完了していない場合は空文字が返る
  var turnstileToken = window.turnstile ? window.turnstile.getResponse() : ''
  if (!turnstileToken) {
    resultEl.textContent = 'bot対策の確認が完了していません。しばらく待ってからもう一度お試しください。'
    resultEl.hidden = false
    return
  }
  try {
    var response = await fetch('/api/v1/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shortCode: ${shortCodeJson}, reason: reason, turnstileToken: turnstileToken }),
    })
    resultEl.textContent = response.ok ? '報告を受け付けました。ご協力ありがとうございます。' : '送信に失敗しました。時間をおいて再度お試しください。'
  } catch (error) {
    resultEl.textContent = '送信に失敗しました。時間をおいて再度お試しください。'
  }
  resultEl.hidden = false
})
</script>
</body>
</html>`
}
