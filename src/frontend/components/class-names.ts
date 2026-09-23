// cx: 条件付きでクラス名を連結する小さなヘルパー。false・null・undefinedは無視する
// (例: cx('field', narrow && 'field--narrow') → narrowがfalseなら'field'だけになる)
export function cx(...classNames: (string | false | null | undefined)[]): string {
  return classNames.filter(Boolean).join(' ')
}
