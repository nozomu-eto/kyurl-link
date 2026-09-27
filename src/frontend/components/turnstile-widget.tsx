/** @jsxImportSource react */
import { forwardRef, useEffect, useId, useImperativeHandle, useRef } from 'react'

// Turnstileのグローバルオブジェクト(window.turnstile)の、このコンポーネントが使う範囲のみの型。
// 公式の型定義パッケージは提供されていないため、必要な範囲だけ最小限に宣言する
declare global {
  interface Window {
    turnstile?: {
      render: (container: string, options: Record<string, unknown>) => string
      remove: (widgetId: string) => void
      reset: (widgetId: string) => void
    }
  }
}

const TURNSTILE_SCRIPT_ID = 'cf-turnstile-script'
// SPA(React Router data mode)でウィジェットを動的に生成するため、explicit rendering
// (render=explicitパラメータ)を使う。docs/architecture.md参照
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

type TurnstileWidgetProps = {
  // 検証成功時、生成されたトークンを受け取るコールバック
  onVerify: (token: string) => void
  // ウィジェットの検証失敗時・スクリプトの読み込み失敗時に呼ばれるコールバック(任意)
  onError?: () => void
}

// 親コンポーネントからウィジェットをリセットするための命令的ハンドル。
// 登録失敗時、使用済みのTurnstile検証結果を再送すると「timeout-or-duplicate」エラーになるため、
// 失敗時はリセットして検証を取り直させる必要がある(このためだけにforwardRefを使う)
export type TurnstileWidgetHandle = {
  reset: () => void
}

// TurnstileWidget: Cloudflare Turnstileのウィジェットを埋め込む共通部品。
// サインアップ画面・警告ページの通報フォーム(こちらは別途サーバー側でHTML+インラインscriptとして
// 生成しているため、このコンポーネントは使わず同等の処理を直接記述する。src/lib/redirect-pages.ts参照)
// から利用する想定。スクリプトタグは複数箇所で呼ばれても1つだけ読み込むようIDで重複を防ぐ
export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(function TurnstileWidget(
  { onVerify, onError },
  ref,
) {
  // 1ページに複数のウィジェットが同時に存在することは無い想定だが、
  // コンテナ要素のidが衝突しないようuseIdで一意な値を生成する
  const containerId = `turnstile-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const widgetIdRef = useRef<string | null>(null)

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current)
      }
    },
  }))

  useEffect(() => {
    let cancelled = false

    function renderWidget() {
      if (cancelled || !window.turnstile) {
        return
      }
      widgetIdRef.current = window.turnstile.render(`#${containerId}`, {
        sitekey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
        callback: onVerify,
        'error-callback': onError,
      })
    }

    if (window.turnstile) {
      renderWidget()
    } else {
      let script = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null
      if (!script) {
        script = document.createElement('script')
        script.id = TURNSTILE_SCRIPT_ID
        script.src = TURNSTILE_SCRIPT_SRC
        script.async = true
        // スクリプト自体の読み込みに失敗した場合(ネットワーク不調・広告ブロッカー等)も、
        // 検証失敗と同様に扱いエラーを通知する
        script.addEventListener('error', () => onError?.())
        document.head.appendChild(script)
      }
      script.addEventListener('load', renderWidget)
    }

    return () => {
      cancelled = true
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
      }
    }
  }, [containerId, onVerify, onError])

  return <div id={containerId} />
})
