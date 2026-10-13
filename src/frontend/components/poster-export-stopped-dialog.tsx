/** @jsxImportSource react */
import { Button, ButtonLink } from '@/frontend/components/button'
import { Dialog } from '@/frontend/components/dialog'
import { LinkStatusBadge, type LinkStatus } from '@/frontend/components/link-status-badge'
import { ShortUrl } from '@/frontend/components/short-url'
import { formatDateJst } from '@/frontend/lib/account-deletion'

type PosterExportStoppedDialogProps = {
  isOpen: boolean
  onClose: () => void
  // 掲示物のQRコードが指す短縮URL。取得できなかった場合はnull(状態の表示だけを省く)
  link: { id: string; shortCode: string; expiresAt: string | null } | null
  // 期限切れ(expired)・停止中(suspended)・削除済み(deleted。短縮URLまたはQRコードが削除されている。掲示物一覧で使う)のどれか
  linkStatus: Extract<LinkStatus, 'expired' | 'suspended'> | 'deleted'
  onExportAnyway: () => void
}

// PosterExportStoppedDialog: リンクが期限切れ・停止中の掲示物を書き出すときの確認(docs/mocks/ExportExpiredDialog.html)。
// そのまま印刷すると、読み取った人には「現在ご利用いただけません」と表示されることを伝え、
// [有効期限を変更して再開](短縮URLの詳細へ)か[このまま書き出す]を選ばせる。
// 削除済みの場合は再開できないため、再開の案内とボタンは出さず[このまま書き出す]だけにする
export function PosterExportStoppedDialog({ isOpen, onClose, link, linkStatus, onExportAnyway }: PosterExportStoppedDialogProps) {
  const isExpired = linkStatus === 'expired'
  const isDeleted = linkStatus === 'deleted'

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="この掲示物のQRコードは、今は開けません"
      isAlertDialog
      footer={
        <>
          <Button variant="outline" onClick={onExportAnyway}>
            このまま書き出す
          </Button>
          {link && !isDeleted && (
            <ButtonLink to={`/app/links/${link.id}`} variant="primary">
              {isExpired ? '有効期限を変更して再開' : '公開設定を確認する'}
            </ButtonLink>
          )}
        </>
      }
    >
      <div className="stopped-dialog">
        {link && (
          <div className="stopped-dialog__link">
            <div>
              <ShortUrl shortCode={link.shortCode} />
              {isExpired && link.expiresAt && <p className="stopped-dialog__note">{formatDateJst(link.expiresAt)} に期限切れになりました</p>}
            </div>
            {!isDeleted && <LinkStatusBadge status={linkStatus} />}
          </div>
        )}
        <p>このまま印刷しても、読み取った人には「このリンクは現在ご利用いただけません」と表示されます。</p>
        {isDeleted ? (
          <p>この掲示物のリンクまたはQRコードは削除されているため、再開できません。別のQRコードを選んで掲示物を作り直してください。</p>
        ) : (
          <p>
            {isExpired
              ? '有効期限を延ばすと、印刷済みの掲示物も含めて、また開けるようになります。'
              : '公開をオンに戻すと、印刷済みの掲示物も含めて、また開けるようになります。'}
          </p>
        )}
      </div>
    </Dialog>
  )
}
