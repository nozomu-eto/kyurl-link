// テスト専用のPNG検査用ヘルパー。src/lib/qrcode-image.tsが生成したPNGを、外部ライブラリを
// 使わず最小限のパース・展開だけで検証できるようにする(仕様上の全チャンク・カラータイプに
// 対応する汎用デコーダーではない)

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
}

// PNGのIHDRチャンク(signature 8バイトの直後、常に最初のチャンク)から幅・高さを読む
export function readPngDimensions(png: Uint8Array): { width: number; height: number } {
  return {
    width: readUint32(png, 16),
    height: readUint32(png, 20),
  }
}

// IDATチャンク(1つ、qrcode-image.tsの実装上必ず1つにまとまる)のデータをzlib展開(inflate)し、
// 各行の先頭のフィルタータイプバイトを取り除いた、8bitグレースケールの生ピクセル値を返す。
// qrcode-image.tsは全行フィルター「None」(0)固定で出力するため、フィルター解除は
// 単純にバイトを読み飛ばすだけで済む
export async function decodeGrayscalePixels(png: Uint8Array): Promise<Uint8Array> {
  const { width, height } = readPngDimensions(png)

  // IHDRチャンクは8(signature) + 4(length) + 4(type) + 13(data) + 4(crc) = 33バイトで終わる
  const idatLength = readUint32(png, 33)
  const idatData = png.slice(41, 41 + idatLength)

  const stream = new DecompressionStream('deflate')
  const writer = stream.writable.getWriter()
  void writer.write(new Uint8Array(idatData)).then(() => writer.close())

  const chunks: Uint8Array[] = []
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
  const rawWithFilter = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    rawWithFilter.set(chunk, offset)
    offset += chunk.length
  }

  const pixels = new Uint8Array(width * height)
  for (let row = 0; row < height; row++) {
    const srcStart = row * (1 + width) + 1 // 先頭のフィルタータイプバイトを読み飛ばす
    const destStart = row * width
    pixels.set(rawWithFilter.subarray(srcStart, srcStart + width), destStart)
  }

  return pixels
}
