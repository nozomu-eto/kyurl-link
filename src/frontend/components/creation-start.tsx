/** @jsxImportSource react */
import { Link } from 'react-router'

// 利用者の目的別に入口を分け、既存の作成フローへ直接案内する。
const CREATION_CHOICES = [
  {
    title: 'QRコードを作る',
    description: 'URLをQRコードにして、画像を保存します。短縮URLがなくても作れます。',
    to: '/app/qrcodes/new',
    action: 'QRコードを作成',
    number: '01',
  },
  {
    title: '短縮URLを作る',
    description: '長いURLを短くして、コピーして共有します。QRコードは必要に応じて追加できます。',
    to: '/app/links/new?intent=link',
    action: '短縮URLを作成',
    number: '02',
  },
  {
    title: '掲示物を作る',
    description: 'QRコードを配置したA6・A5の掲示物を作成し、印刷用に保存します。',
    to: '/app/posters/new',
    action: '掲示物を作成',
    number: '03',
  },
] as const

export function CreationStart() {
  return (
    <section className="creation-start" aria-labelledby="creation-start-title">
      <div className="creation-start__heading">
        <h2 id="creation-start-title">何を作りますか？</h2>
        <p>やりたいことを選ぶと、必要な操作から始められます。</p>
      </div>
      <div className="creation-start__grid">
        {CREATION_CHOICES.map((choice) => (
          <Link key={choice.number} to={choice.to} className="creation-start__choice">
            <span className="creation-start__number" aria-hidden="true">{choice.number}</span>
            <span className="creation-start__title">{choice.title}</span>
            <span className="creation-start__description">{choice.description}</span>
            <span className="creation-start__action">{choice.action}<span aria-hidden="true"> →</span></span>
          </Link>
        ))}
      </div>
      <p className="creation-start__history">
        以前に作成したものを使う場合は、<Link to="/app/qrcodes">QRコード一覧</Link>・<Link to="/app/posters">掲示物一覧</Link>から確認できます。
      </p>
    </section>
  )
}
