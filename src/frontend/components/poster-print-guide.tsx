/** @jsxImportSource react */

// PosterPrintGuide: 掲示物をPDFで印刷するときの案内。掲示物の編集画面(単体の書き出し)と
// まとめて印刷で、同じ文言を出すための共通部品
export function PosterPrintGuide() {
  return (
    <div className="print-guide">
      <strong>印刷するときは</strong>
      <ul>
        <li>倍率は「100%(実際のサイズ)」で印刷し、切り取り線に沿って切ってください</li>
        <li>貼る前に、スマートフォンのカメラで読み取れるか確認してください</li>
      </ul>
    </div>
  )
}
