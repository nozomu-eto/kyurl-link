// リダイレクト時のエラーページ(404・410 Gone)のHTMLを生成する。
// 見出し・本文・補足の文言はdocs/architecture.md 第6.3節「エラーメッセージ・ライティング方針」で
// 確定済みのため、ここでは変更しない。文言を変更する場合は、必ずドキュメント側(第6.3節)も
// 合わせて更新すること
const PAGE_STYLE = `
  body { font-family: sans-serif; line-height: 1.6; margin: 0; padding: 2rem 1.5rem; color: #222; }
  main { max-width: 480px; margin: 0 auto; }
  h1 { font-size: 1.25rem; }
  p { margin: 0.75rem 0; }
  .note { font-size: 0.875rem; color: #555; }
  a { display: inline-block; margin-top: 1.5rem; color: #0057ff; }
`

// 404(存在しない短縮コード)用のページHTMLを返す
export function notFoundPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<title>このページは見つかりませんでした</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<main>
<h1>このページは見つかりませんでした</h1>
<p>アクセスしようとしたURLは存在しないか、入力内容に誤りがある可能性があります。QRコードを読み取った場合は、印刷物やポスターに汚れ・破損がないかご確認ください。</p>
<p class="note">URLを直接入力した場合は、大文字・小文字やスペルをご確認のうえ、もう一度お試しください。</p>
<a href="/">トップページへ戻る</a>
</main>
</body>
</html>`
}

// 410 Gone(有効期限切れ・削除済み)用のページHTMLを返す
export function goneePageHtml(): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<title>このリンクは現在ご利用いただけません</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<main>
<h1>このリンクは現在ご利用いただけません</h1>
<p>このQRコード・URLは、有効期限が終了したか、提供が終了したため、現在はご案内先へお進みいただけません。</p>
<p class="note">最新の情報については、直接お店・施設にお問い合わせください。</p>
<a href="/">トップページへ戻る</a>
</main>
</body>
</html>`
}

// 警告インターステシャル(悪意あるURL検知フラグ)用のページHTMLを返す。
// shortCodeはgenerateShortCode()(src/routes/links.ts)がSHORT_CODE_CHARS(英数字)のみから
// 生成するサーバー制御の値であり、利用者入力ではないためHTMLへの直接埋め込みでも安全だが、
// 念のためJSON.stringifyで文字列リテラルとしてエスケープしてから埋め込む。
// 「このまま進む」は現在のパスに?proceed=1を付けた相対リンクのみで実現し(サーバー側で
// index.tsxがこのクエリパラメータを見て通常の302リダイレクトに切り替える)、
// 「戻る」はトップページに戻す(404/410ページと同じ導線に揃える)。
// 通報導線(利用規約第9条)は、reports.ts側を変更せず既存のPOST /api/v1/reportsをそのまま
// 流用するため、<details>で折りたたんだ簡易フォーム+インラインスクリプトからfetchで呼び出す
export function securityWarningPageHtml(shortCode: string): string {
  const shortCodeJson = JSON.stringify(shortCode)

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<title>このリンク先の安全性を確認できませんでした</title>
<style>${PAGE_STYLE}
  details { margin-top: 1.5rem; font-size: 0.875rem; }
  summary { cursor: pointer; color: #0057ff; }
  form { margin-top: 0.75rem; }
  input[type="text"] { width: 100%; box-sizing: border-box; padding: 0.4rem; }
  button { margin-top: 0.5rem; }
  .actions a { margin-right: 1rem; }
</style>
</head>
<body>
<main>
<h1>このリンク先の安全性を確認できませんでした</h1>
<p>このリンクは、自動チェックにより注意が必要と判定されました。個人情報の入力やファイルのダウンロードを求められた場合は、内容を十分にご確認ください。</p>
<p class="note">この判定は自動処理によるもので、誤って表示される場合があります。</p>
<p class="actions">
<a href="?proceed=1">このまま進む</a>
<a href="/">戻る</a>
</p>
<details>
<summary>このリンクに問題があると思われる場合はこちらから報告</summary>
<form id="report-form">
<label>報告理由: <input type="text" name="reason" required /></label>
<button type="submit">送信する</button>
</form>
<p id="report-result" hidden></p>
</details>
<script>
document.getElementById('report-form').addEventListener('submit', async function (event) {
  event.preventDefault()
  var reason = event.target.elements.reason.value
  var resultEl = document.getElementById('report-result')
  try {
    var response = await fetch('/api/v1/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shortCode: ${shortCodeJson}, reason: reason }),
    })
    resultEl.textContent = response.ok ? '報告を受け付けました。ご協力ありがとうございます。' : '送信に失敗しました。時間をおいて再度お試しください。'
  } catch (error) {
    resultEl.textContent = '送信に失敗しました。時間をおいて再度お試しください。'
  }
  resultEl.hidden = false
})
</script>
</main>
</body>
</html>`
}
