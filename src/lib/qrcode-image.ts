import QRCode from 'qrcode-svg'

// GET /api/v1/qrcodes/:id/imageのクエリsize(docs/architecture.md 第7節「PNG(512 / 1024 /
// 2048px、初期値1024)」)
export const QRCODE_IMAGE_SIZE_OPTIONS = [512, 1024, 2048] as const
export type QrcodeImageSize = (typeof QRCODE_IMAGE_SIZE_OPTIONS)[number]

// QR外周の余白(モジュール単位、片側)。qrcode-svgの既定のpadding(4)と揃える
// (SVG・PNGで見た目の余白比率を揃えるため)
const PADDING_MODULES = 4

// renderQrcodeSvg: QRコードのSVGを生成する(既存のqrcode-svgをそのまま使う。掲示物の
// 書き出し(posters.ts)がこのSVGの内容からR2キャッシュのキーを計算しているため、
// 中身を変えるとキャッシュが全て無効になる。そのため生成方法・既定値(誤り訂正レベルM等)は
// 変更しない)。
// swap: trueは必須(src/types/qrcode-svg.d.ts参照)。qrcode-svgのsvg()は内部でmodules[x][y]を
// (xを横方向として)描画するが、QRコードの規格上の向き(isDark(row, col)がmodules[row][col]を
// 返す向き)とは縦横が入れ替わっており、swap: trueを指定しないと出力されるQRコードが
// 対角線で反転した状態になる(多くのスマホは鏡像も読み取れるため気づきにくいが、規格どおりの
// 向きではなく、一部の読み取りアプリでは読み取れない)
export function renderQrcodeSvg(content: string): string {
  return new QRCode({ content, swap: true }).svg()
}

// renderQrcodePng: 指定サイズの正方形PNG画像を、QRコードの白黒のマス目から直接組み立てる。
// SVGに変換してからラスタライズする方式(resvg等のWASM)や、Browser Renderingでの描画は、
// 白黒の正方形を並べるだけのQRコードには過剰(前者は初期化コスト、後者は従量課金と
// 掲示物書き出しとのBrowser Rendering枠の奪い合いが生じる)なため採用しない。
// 外部ライブラリ(@juit/qrcode等)の追加導入も検討したが、SVGの生成に既に使っている
// qrcode-svgが、SVGを描画する際に使うのと同じマス目の配列(QRCode#qrcode.modules)を
// そのまま公開しているため、これを再利用して自前でPNGを組み立てる方が、新規依存を
// 増やさずに済み、かつSVGとPNGで模様が完全に一致することも保証できる
// (docs/architecture.md 第15節参照)。
// 誤り訂正レベルはqrcode-svgの既定値(M)のまま、SVGと同じにする
export async function renderQrcodePng(content: string, size: QrcodeImageSize): Promise<Uint8Array<ArrayBuffer>> {
  const modules = new QRCode({ content }).qrcode.modules
  const moduleCount = modules.length

  // 1マスのピクセル数は整数にする(マスの境目に灰色のにじみを出さないため)。
  // マス数(モジュール数+左右または上下の余白8マス分)で割り切れず余ったピクセルは、
  // 周囲の白い余白に均等に振り分けて中央に配置する
  const totalModules = moduleCount + PADDING_MODULES * 2
  const pixelsPerModule = Math.max(1, Math.floor(size / totalModules))
  const usedPixels = pixelsPerModule * totalModules
  const extraPixels = size - usedPixels
  // 余白は最低4マス分(PADDING_MODULES)を確保したうえで、余ったピクセルの半分ずつを
  // 前後(上下・左右)に足す。前後の合計が必ずsizeちょうどになるよう、後ろ側は
  // 差分(size - 前側 - QR本体)として計算する
  const marginBefore = pixelsPerModule * PADDING_MODULES + Math.floor(extraPixels / 2)

  // 白(255)で初期化した1チャンネル(グレースケール)のピクセル配列。背景は不透明な白、
  // 模様は黒のみにするため、中間色は一切使わない
  const pixels = new Uint8Array(size * size).fill(255)

  for (let x = 0; x < moduleCount; x++) {
    for (let y = 0; y < moduleCount; y++) {
      // QRコードの規格どおりの向き(isDark(row, col)がmodules[row][col]を返す向き)に合わせる。
      // 画素の横方向(x)が列(col)、縦方向(y)が行(row)に対応するため、modules[y][x]を参照する
      // (modules[x][y]で参照すると、renderQrcodeSvgのswap:trueと同様の理由でQRコードが
      // 対角線で反転してしまう)
      if (!modules[y][x]) {
        continue
      }

      const colStart = marginBefore + x * pixelsPerModule
      const rowStart = marginBefore + y * pixelsPerModule
      for (let dy = 0; dy < pixelsPerModule; dy++) {
        const rowOffset = (rowStart + dy) * size
        pixels.fill(0, rowOffset + colStart, rowOffset + colStart + pixelsPerModule)
      }
    }
  }

  return encodeGrayscalePng(size, size, pixels)
}

// PNGの署名(仕様で固定のマジックバイト)
const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// encodeGrayscalePng: 8bitグレースケール(色type 0)のPNGを組み立てる。
// フィルターは全行「None」(0)固定でよい(白黒2値のみで、他のフィルターによる圧縮効率改善が
// ほぼ無いため、実装を単純に保つことを優先する)
async function encodeGrayscalePng(width: number, height: number, grayscalePixels: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  // 各行の先頭にフィルタータイプバイト(0 = None)を付けた生データを組み立てる
  const rawWithFilter = new Uint8Array(height * (1 + width))
  for (let row = 0; row < height; row++) {
    const srcStart = row * width
    const destStart = row * (1 + width)
    rawWithFilter[destStart] = 0
    rawWithFilter.set(grayscalePixels.subarray(srcStart, srcStart + width), destStart + 1)
  }

  const ihdrData = new Uint8Array(13)
  const ihdrView = new DataView(ihdrData.buffer)
  ihdrView.setUint32(0, width)
  ihdrView.setUint32(4, height)
  ihdrData[8] = 8 // bit depth
  ihdrData[9] = 0 // color type: グレースケール
  ihdrData[10] = 0 // compression method(仕様上0のみ)
  ihdrData[11] = 0 // filter method(仕様上0のみ)
  ihdrData[12] = 0 // interlace: なし

  const idatData = await deflateZlib(rawWithFilter)

  const ihdrChunk = buildPngChunk('IHDR', ihdrData)
  const idatChunk = buildPngChunk('IDAT', idatData)
  const iendChunk = buildPngChunk('IEND', new Uint8Array(0))

  const png = new Uint8Array(PNG_SIGNATURE.length + ihdrChunk.length + idatChunk.length + iendChunk.length)
  let offset = 0
  png.set(PNG_SIGNATURE, offset)
  offset += PNG_SIGNATURE.length
  png.set(ihdrChunk, offset)
  offset += ihdrChunk.length
  png.set(idatChunk, offset)
  offset += idatChunk.length
  png.set(iendChunk, offset)

  return png
}

// PNGの1チャンク(長さ + 種別 + データ + CRC32)を組み立てる
function buildPngChunk(type: string, data: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const typeBytes = new Uint8Array(4)
  for (let i = 0; i < 4; i++) {
    typeBytes[i] = type.charCodeAt(i)
  }

  const typeAndData = new Uint8Array(typeBytes.length + data.length)
  typeAndData.set(typeBytes, 0)
  typeAndData.set(data, typeBytes.length)

  const chunk = new Uint8Array(4 + typeAndData.length + 4)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, data.length)
  chunk.set(typeAndData, 4)
  view.setUint32(4 + typeAndData.length, crc32(typeAndData))

  return chunk
}

// PNG仕様のCRC32(多項式0xEDB88320)。テーブルは初回呼び出し時に1度だけ作る
let crcTable: Uint32Array | undefined
function getCrcTable(): Uint32Array {
  if (crcTable) {
    return crcTable
  }

  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  crcTable = table
  return table
}

function crc32(data: Uint8Array<ArrayBuffer>): number {
  const table = getCrcTable()
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

// PNGのIDATが要求するzlib形式(RFC 1950)への圧縮。Web標準のCompressionStream('deflate')は
// (WHATWG Compression Streams仕様上)まさにこのzlib形式を出力するため、そのまま使える
// (deflate-rawだとzlibヘッダ・Adler32チェックサムが付かず、PNGの仕様を満たさない)
async function deflateZlib(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new CompressionStream('deflate')
  const writer = stream.writable.getWriter()
  const dataCopy = new Uint8Array(data)
  void writer.write(dataCopy).then(() => writer.close())

  const chunks: Uint8Array<ArrayBuffer>[] = []
  const reader = stream.readable.getReader()
  let totalLength = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    chunks.push(value)
    totalLength += value.length
  }

  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}
