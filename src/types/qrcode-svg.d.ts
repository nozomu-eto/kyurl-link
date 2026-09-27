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
  }
  export default class QRCode {
    constructor(options: QRCodeOptions | string)
    svg(): string
    // PNG生成(src/lib/qrcode-image.ts)で、SVGと同じマス目(モジュール)を再利用するために使う。
    // modules[x][y]がtrueなら黒(暗色)、falseなら白(明色)。moduleCount相当はmodules.lengthで取れる
    qrcode: {
      modules: boolean[][]
    }
  }
}
