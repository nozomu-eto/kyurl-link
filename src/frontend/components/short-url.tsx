/** @jsxImportSource react */

type ShortUrlProps = {
  shortCode: string
}

// ShortUrl: 短縮URLを「kyurl.link/コード」の形で表示する共通部品。コード部分だけ太字にして、
// 一覧などで見分けやすくする。ホスト名は現在開いているサイトのものを使う(開発環境でも実際のURLと一致させるため)
export function ShortUrl({ shortCode }: ShortUrlProps) {
  return (
    <span className="short-url">
      {window.location.host}/<span className="short-url__code">{shortCode}</span>
    </span>
  )
}
