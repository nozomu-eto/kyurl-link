// アカウント削除申請・完了通知メールの件名・本文テンプレート(docs/architecture.md 第7.1節
// 「④通知メール」、第11節)。docs/data-breach-response.md 第5節の本人通知テンプレートと
// 同程度のトーン(丁寧・簡潔な日本語のプレーンテキスト)に揃える

// 日時をローカル(日本時間)の分かりやすい表記に変換する(例: 2026年9月29日 19:00)
function formatJapaneseDateTime(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  }).format(date)
}

// アカウント削除申請を受け付けた際に送る通知メール(docs/architecture.md 第7.1節「④通知メール」の1通目)
export function buildRequestReceivedEmail(scheduledDeletionAt: Date): { subject: string; text: string } {
  const scheduledDeletionAtText = formatJapaneseDateTime(scheduledDeletionAt)

  return {
    subject: '【kyurl.link】アカウント削除申請を受け付けました',
    text: `日頃よりkyurl.linkをご利用いただきありがとうございます。

アカウント削除のお申し込みを受け付けました。

${scheduledDeletionAtText}をもって、アカウントおよび関連データを完全に削除いたします。

それまでの間にログインいただくと、削除の申請を取り消すことができます。
削除を希望されない場合は、期限までにログインしてください。

ご不明点は info@kyurl.link までご連絡ください。`,
  }
}

// アカウントの物理削除が完了した際に送る通知メール(docs/architecture.md 第7.1節「④通知メール」の2通目)
export function buildDeletionCompletedEmail(): { subject: string; text: string } {
  return {
    subject: '【kyurl.link】アカウント削除が完了しました',
    text: `日頃よりkyurl.linkをご利用いただきありがとうございます。

お申し込みいただいていたアカウントの削除が完了しました。
アカウントおよび関連するすべてのデータ(短縮URL・QRコード・掲示物等)を削除いたしました。

これまでご利用いただきありがとうございました。

ご不明点は info@kyurl.link までご連絡ください。`,
  }
}
