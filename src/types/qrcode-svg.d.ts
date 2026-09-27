// qrcode-svgには型定義が無いため、実際に使うAPI(コンストラクタとsvg())のみの最小限の型を宣言する
declare module 'qrcode-svg' {
  interface QRCodeOptions {
    content: string
    padding?: number
    width?: number
    height?: number
    color?: string
    background?: string
    ecl?: 'L' | 'M' | 'Q' | 'H'
    // svg()内部のmodules[x][y]の添字の向きが、QRコードの規格(isDark(row, col)が
    // modules[row][col]を返す向き)と入れ替わっている(既知の実装。isDarkとsvg()の
    // 添字の使い方が食い違っている)ため、trueにして向きを規格どおりに補正する
    // (src/lib/qrcode-image.ts参照)
    swap?: boolean
  }
  export default class QRCode {
    constructor(options: QRCodeOptions | string)
    svg(): string
    // PNG生成(src/lib/qrcode-image.ts)で、SVGと同じマス目(モジュール)を再利用するために使う。
    // modules[row][col]がtrueなら黒(暗色)、falseなら白(明色)。isDark(row, col)と同じ向き
    // (QRコードの規格どおりの向き)。moduleCount相当はmodules.lengthで取れる
    qrcode: {
      modules: boolean[][]
    }
  }
}
