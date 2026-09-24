// 各種入力値の文字数上限を定数として定義する。
// サーバー側のzodスキーマ(src/shared/schemas/配下)とフロントエンドのフォーム入力(maxLength)の
// 両方から同じ値を参照することで、両者の上限がずれることを防ぐ(公開前修正v2 T4/T5/T7)。

// URL(link.originalUrl・qrcode.targetUrl)の文字数上限。
// 実務上の一般的なURL長の上限として広く使われる2048文字を採用する(RFCで明確な上限は
// 規定されていないが、主要ブラウザ・サーバー実装が実質的な上限として扱う値のため)
export const URL_MAX_LENGTH = 2048

// 掲示物(poster)のタイトルの文字数上限。
// A6/A5の掲示物レイアウトに収まる見出しとして想定する長さ
export const POSTER_TITLE_MAX_LENGTH = 60

// 掲示物(poster)のサブタイトルの文字数上限
export const POSTER_SUBTITLE_MAX_LENGTH = 120

// 通報(report)の理由(自由記述)の文字数上限
export const REPORT_REASON_MAX_LENGTH = 1000

// 通報(report)対象を特定するshortCodeの文字数上限。
// 実際に生成されるshortCodeはこれより十分短いが、悪意のある巨大な文字列の送信を防ぐための
// 上限として定義する
export const REPORT_SHORT_CODE_MAX_LENGTH = 32
