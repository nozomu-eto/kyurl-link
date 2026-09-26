/** @jsxImportSource react */
import { Page } from '@/frontend/components/page'

export type LegalArticle = { title: string; paragraphs: string[] }

type LegalDocumentProps = {
  title: string
  // 前文(条文の前に置く説明)
  lead: string
  articles: LegalArticle[]
  // 末尾に表示する制定日・改定日
  dateNote: string
}

// LegalDocument: 利用規約・プライバシーポリシーのような条文形式の文書を表示する共通部品。
// 条文本文は改行(\n)を含むプレーンテキストのため、.legal-article__body(white-space: pre-wrap)で
// 改行をそのまま画面表示に反映する
export function LegalDocument({ title, lead, articles, dateNote }: LegalDocumentProps) {
  return (
    <Page contained title={title}>
      <p className="field__hint">{lead}</p>
      {articles.map((article) => (
        <section key={article.title} className="legal-article">
          <h2 className="legal-article__title">{article.title}</h2>
          {article.paragraphs.map((paragraph, index) => (
            <p key={index} className="legal-article__body">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
      <p className="field__hint">{dateNote}</p>
    </Page>
  )
}
