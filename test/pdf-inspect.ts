// テスト専用のPDF検査用ヘルパー。@cloudflare/puppeteer(page.pdf())が生成するPDFは、
// オブジェクトストリームで圧縮されない素朴な構造(プレーンテキストのオブジェクト)のため、
// 外部ライブラリを使わず正規表現で最小限の情報(ページ数・MediaBox)だけを取り出す
// (仕様上の全パターンに対応する汎用PDFパーサーではない)

// PDF中の"/Type /Page"(ページオブジェクト。"/Type /Pages"(ページツリーのルート)は除く)の
// 出現回数を数え、ページ数として返す
export function countPdfPages(pdf: Uint8Array): number {
  const text = new TextDecoder('latin1').decode(pdf)
  const matches = text.match(/\/Type\s*\/Page(?!s)/g)
  return matches ? matches.length : 0
}

// PDF中の最初の/MediaBox(用紙の大きさ、pt単位)を[x0, y0, x1, y1]の配列で返す
export function readPdfMediaBox(pdf: Uint8Array): [number, number, number, number] {
  const text = new TextDecoder('latin1').decode(pdf)
  const match = text.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/)
  if (!match) {
    throw new Error('PDFから/MediaBoxを読み取れませんでした')
  }
  return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])]
}
