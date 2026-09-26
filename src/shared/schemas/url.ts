import { z } from 'zod'

// link.originalUrlとqrcode.targetUrl(rawUrl)で共通して使うURLスキーマ。
// zod v4のz.string().url()はhttp/https以外のスキーム(javascript:、data:、mailto:等)も
// 有効と判定してしまい、これらがリダイレクト先やQRコードの中身として保存され得るため、
// protocolをhttp/httpsのみに制限する。
// z.httpUrl()は内部でhostnameもドメイン形式の正規表現に制限しており、IPアドレスリテラルの
// ホスト名(例: http://192.168.0.1)を弾いてしまう。IPアドレスリテラルはurl-heuristics.tsが
// 既に「flagged」として検知する対象(悪意あるURLの疑いとして警告するが、作成自体は拒否しない)
// であり、z.httpUrl()を使うとこの既存の検知フローと矛盾するスキーマ側の拒否が発生してしまう。
// そのためprotocolのみを制限できるz.url({ protocol })を使う
export const httpUrlSchema = z.url({ protocol: /^https?$/ })
