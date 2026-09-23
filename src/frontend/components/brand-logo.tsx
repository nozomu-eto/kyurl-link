/** @jsxImportSource react */

// BrandLogo: 「kyurl.link」のロゴ表記。ドットだけアクセント色にする。
// ヘッダー・フッター・サイドナビで共有し、リンクにする場合は呼び出し側でLinkに包む
export function BrandLogo() {
  return (
    <span className="brand-logo">
      kyurl<span className="brand-logo__dot">.</span>link
    </span>
  )
}
