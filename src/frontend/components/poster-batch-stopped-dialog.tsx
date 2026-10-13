/** @jsxImportSource react */
import { Button } from '@/frontend/components/button'
import { Dialog } from '@/frontend/components/dialog'

type PosterBatchStoppedDialogProps = {
  isOpen: boolean
  onClose: () => void
  // リンクが使えない掲示物(タイトルと、その理由の注意書き)
  posters: { id: string; title: string; warning: string }[]
  onExportAnyway: () => void
}

// PosterBatchStoppedDialog: リンクが期限切れ・停止中・削除済みの掲示物を含むまとめて印刷を書き出すときの確認。
// 単体の書き出しの確認(PosterExportStoppedDialog)と同じ趣旨で、どの掲示物が該当するかを一覧で示す。
// 掲示物ごとに再開の導線を並べると煩雑になるため、再開は各掲示物の編集画面・短縮URLの詳細で行ってもらい、
// ここでは「このまま書き出す」か「戻る」を選ばせる
export function PosterBatchStoppedDialog({ isOpen, onClose, posters, onExportAnyway }: PosterBatchStoppedDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="今は開けないQRコードの掲示物が含まれています"
      isAlertDialog
      footer={
        <>
          <Button variant="outline" onClick={onExportAnyway}>
            このまま書き出す
          </Button>
          <Button variant="primary" onClick={onClose}>
            戻る
          </Button>
        </>
      }
    >
      <div className="stopped-dialog">
        <ul className="stopped-dialog__posters">
          {posters.map((poster) => (
            <li key={poster.id}>
              <strong>{poster.title}</strong>
              <span className="stopped-dialog__note">{poster.warning}</span>
            </li>
          ))}
        </ul>
        <p>このまま印刷しても、読み取った人には「このリンクは現在ご利用いただけません」と表示されます。</p>
        <p>有効期限や公開設定は、各掲示物の編集画面から短縮URLの詳細へ進んで確認できます。</p>
      </div>
    </Dialog>
  )
}
