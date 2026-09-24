import { z } from 'zod'
import { URL_MAX_LENGTH } from '@/shared/constants/input-limits'

// link.originalUrlとqrcode.targetUrl(rawUrl)で共通して使うURLスキーマ。
// zod v4のz.string().url()はhttp/https以外のスキーム(javascript:、data:、mailto:等)も
// 有効と判定してしまい、これらがリダイレクト先やQRコードの中身として保存され得るため、
// protocolをhttp/httpsのみに制限する。
// z.httpUrl()は内部でhostnameもドメイン形式の正規表現に制限しており、IPアドレスリテラルの
// ホスト名(例: http://192.168.0.1)を弾いてしまう。IPアドレスリテラルはurl-heuristics.tsが
// 既に「flagged」として検知する対象(悪意あるURLの疑いとして警告するが、作成自体は拒否しない)
// であり、z.httpUrl()を使うとこの既存の検知フローと矛盾するスキーマ側の拒否が発生してしまう。
// そのためprotocolのみを制限できるz.url({ protocol })を使う。
// .max()は、極端に長いURLによるDB圧迫・処理コスト増加(URLhaus照会・悪意あるURL検知の
// ヒューリスティック等)を防ぐための上限で、src/shared/constants/input-limits.tsの
// 定数値を用いる(公開前修正v2 T5)
export const httpUrlSchema = z.url({ protocol: /^https?$/ }).max(URL_MAX_LENGTH)
