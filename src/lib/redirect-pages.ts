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
