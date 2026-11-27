// Worker Previewsにはメールバインディングを渡さず、テスト時の送信を抑止する。
export async function sendEmail(
  env: Pick<CloudflareBindings, 'APP_ENV' | 'EMAIL'>,
  to: string,
  message: { subject: string; text: string },
): Promise<void> {
  if (env.APP_ENV === 'preview') {
    return
  }

  await env.EMAIL.send({ from: 'no-reply@kyurl.link', to, ...message })
}
