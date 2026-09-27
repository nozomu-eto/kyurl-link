/** @jsxImportSource react */
import { useState } from 'react'
import { AlertMessage } from '@/frontend/components/alert-message'
import { Button } from '@/frontend/components/button'
import { calculateRemainingDays, formatDateJst } from '@/frontend/lib/account-deletion'
import { useCancelAccountDeletion } from '@/frontend/lib/use-cancel-account-deletion'

type AccountDeletionBannerProps = {
  // 物理削除予定日時(ISO文字列)
  scheduledDeletionAt: string
  // 取り消しに成功した際に呼ばれるコールバック。トースト表示は親(DashboardPage・
  // AccountSettingsPage)が行う。理由: 取り消し成功後はloaderの再実行で申請がpendingで
  // なくなり、このバナー自体が親から取り除かれる。トーストをこのコンポーネントの中で
  // 持つと、バナーが消えるのと同時にトーストまで消えてしまい、利用者に「取り消しました」
  // が伝わらなくなる(バナーの表示・非表示に関わらず残り続ける親でトーストを持つ必要がある)
  onCancelled: () => void
}

const HEADING_ID = 'account-deletion-banner-heading'

// AccountDeletionBanner: アカウント削除申請の猶予期間中、ダッシュボード・アカウント設定の
// 上部(見出しの直下)に表示する常設の案内(docs/architecture.md 第7.1節、
// docs/mocks/AccountSettings.html)。
// role="alert"は付けない。alertは開いた瞬間に強制的に読み上げられる属性のため、
// 画面を開くたびに毎回表示される常設の案内には向かない(モックにはroleが付いているが、
// あえて見出し付きのsection(aria-labelledby)にとどめる)
export function AccountDeletionBanner({ scheduledDeletionAt, onCancelled }: AccountDeletionBannerProps) {
  const { cancel, isCancelling } = useCancelAccountDeletion()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleCancelClick() {
    setErrorMessage(null)
    const result = await cancel()

    if (result.outcome === 'cancelled') {
      onCancelled()
    } else if (result.outcome === 'grace-period-expired') {
      setErrorMessage('猶予期間を過ぎているため、削除を取り消せません')
    } else if (result.outcome === 'error') {
      setErrorMessage('取り消しに失敗しました。時間をおいて再度お試しください')
    }
    // 'already-cancelled'(別タブ等で既に取り消し済み)の場合は、何も表示せず
    // loaderの再実行(useCancelAccountDeletion内)に任せる。再実行後は申請が
    // pendingでなくなり、このバナー自体が表示されなくなる
  }

  return (
    <>
      <section className="account-deletion-banner" aria-labelledby={HEADING_ID}>
        <div className="account-deletion-banner__body">
          <h2 id={HEADING_ID} className="account-deletion-banner__heading">
            このアカウントは {formatDateJst(scheduledDeletionAt)} に完全に削除されます(あと{calculateRemainingDays(scheduledDeletionAt)}日)
          </h2>
          <span className="account-deletion-banner__text">
            現在、短縮URLとQRコードは停止しています。削除を取り消すと、すべてこれまでどおり使えるようになります。
          </span>
        </div>
        <Button variant="primary" onClick={handleCancelClick} disabled={isCancelling}>
          {isCancelling ? '取り消し中…' : '削除を取り消す'}
        </Button>
      </section>
      {errorMessage && <AlertMessage tone="error">{errorMessage}</AlertMessage>}
    </>
  )
}
