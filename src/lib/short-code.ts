// shortCode生成に使う文字種(英数字62文字)
const SHORT_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
// shortCodeの長さ(6〜8文字程度の目安として7文字固定)
export const SHORT_CODE_LENGTH = 7

// 0〜255のバイト値をSHORT_CODE_CHARS(62文字)にマッピングする際、256は62で割り切れないため
// (256 % 62 = 8)、単純にbyte % 62を使うと先頭8種類の文字が他より出現しやすくなる偏り
// (modulo bias)が生じる。これを避けるため、62の倍数として使える最大の範囲(256 - 8 = 248)を
// 超えるバイト値は捨てて再取得する(棄却サンプリング)
const MAX_UNBIASED_BYTE_VALUE = 256 - (256 % SHORT_CODE_CHARS.length)

// 暗号論的に安全な乱数(crypto.getRandomValues)を使い、英数字のshortCodeを1件生成する。
// shortCodeは推測されにくいことが重要(第三者に短縮URLの存在を推測・列挙されると、
// 非公開のつもりで共有したリンク先が意図せず閲覧されうるため)、Math.random()ではなく
// 暗号論的に安全な乱数源を使い、modulo biasを避けた実装にする
export function generateShortCode(length: number = SHORT_CODE_LENGTH): string {
  let code = ''

  while (code.length < length) {
    // 棄却される分を見込みつつ、必要な残り文字数分をまとめて取得する
    // (1バイトずつcrypto.getRandomValues()を呼ぶオーバーヘッドを減らすため)
    const bytes = new Uint8Array(length - code.length)
    crypto.getRandomValues(bytes)

    for (const byte of bytes) {
      if (byte >= MAX_UNBIASED_BYTE_VALUE) {
        // 偏りが出る範囲のバイト値は棄却し、このバイトは使わない
        continue
      }
      code += SHORT_CODE_CHARS[byte % SHORT_CODE_CHARS.length]
      if (code.length === length) {
        break
      }
    }
  }

  return code
}
