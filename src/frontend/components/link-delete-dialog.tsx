/** @jsxImportSource react */
import { AlertMessage } from '@/frontend/components/alert-message'
import { Button } from '@/frontend/components/button'
import { Dialog } from '@/frontend/components/dialog'
import { ShortUrl } from '@/frontend/components/short-url'

type LinkDeleteDialogProps = {
  isOpen: boolean
  onClose: () => void
  link: { shortCode: string; originalUrl: string }
  // この短縮URLに紐づくQRコードの件数。削除の影響の説明に使う
  qrcodeCount: number
  // 削除せず公開をオフにする、の案内を出すか(すでに停止中・運営による停止中の場合はfalse)
  canSuspendInstead: boolean
  isDeleting: boolean
  errorMessage: string | null
  onDelete: () => void
  onSuspendInstead: () => void
}

// LinkDeleteDialog: 短縮URLの削除確認ダイアログ(docs/mocks/DeleteDialog.html)。
// 削除の影響(印刷済みのQRコードから開けなくなる)と、代わりに「公開をオフ」にできることを案内する。
// 取り消せない操作のためalertdialogにする
export function LinkDeleteDialog({
  isOpen,
  onClose,
  link,
  qrcodeCount,
  canSuspendInstead,
  isDeleting,
  errorMessage,
  onDelete,
  onSuspendInstead,
}: LinkDeleteDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="この短縮URLを削除しますか?"
      isAlertDialog
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button variant="danger" disabled={isDeleting} onClick={onDelete}>
            {isDeleting ? '削除中…' : '削除する'}
          </Button>
        </>
      }
    >
      <div className="delete-dialog">
        <div className="delete-dialog__target">
          <ShortUrl shortCode={link.shortCode} />
          <p className="delete-dialog__original-url">{link.originalUrl}</p>
        </div>
        <p>
          削除すると、このURLや
          <strong>{qrcodeCount > 0 ? `印刷済みのQRコード(${qrcodeCount}件)や掲示物` : '印刷済みのQRコードや掲示物'}</strong>
          から開いた人には、ページが見つからない旨の案内が表示されます。この操作は取り消せません。
        </p>
        {canSuspendInstead && (
          <p>
            一時的に止めたいだけなら、削除せずに
            <Button variant="text" onClick={onSuspendInstead}>
              公開をオフ
            </Button>
            にすることもできます。
          </p>
        )}
        {errorMessage && <AlertMessage tone="error">{errorMessage}</AlertMessage>}
      </div>
    </Dialog>
  )
}
