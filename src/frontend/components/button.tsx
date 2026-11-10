/** @jsxImportSource react */
import type { ComponentProps } from 'react'
import { Link } from 'react-router'
import { cx } from '@/frontend/components/class-names'

// ボタンの見た目の種類(global.cssの.button--*に対応する)。
// primary: 紺(通常の送信) / cta: 朱(画面内で最も押してほしい1つだけ) / secondary: 紺の枠線 /
// outline: グレーの枠線(控えめな導線) / neutral: 白地・中立色の枠線(ログアウト等、危険でも
// 主要でもない操作) / danger: 確認の最後の段階(確認ダイアログの中、またはそれと同じ役割の画面)だけで使う塗りの削除ボタン(ctaと同色) /
// danger-outline: 画面上に置く削除ボタン(枠線) / text: 文字だけ
export type ButtonVariant = 'primary' | 'cta' | 'secondary' | 'outline' | 'neutral' | 'danger' | 'danger-outline' | 'text'

export type ButtonStyle = {
  variant?: ButtonVariant
  size?: 'medium' | 'large'
  // trueの場合、右向きの「›」を付ける(エックスサーバー風のCTA)
  withArrow?: boolean
}

// buttonClassName: ボタンのクラス名を組み立てる。<a>(外部リンク・ファイル書き出し等)を
// ボタンの見た目にしたい場合など、Button/ButtonLinkを使えない場面ではこれを直接使う
export function buttonClassName({ variant = 'primary', size = 'medium', withArrow = false }: ButtonStyle = {}, extraClassName?: string): string {
  return cx('button', `button--${variant}`, size === 'large' && 'button--large', withArrow && 'button--arrow', extraClassName)
}

type ButtonProps = ButtonStyle & ComponentProps<'button'>

// Button: <button>の共通部品。typeの既定値は'button'(フォーム内で意図せず送信されるのを防ぐため)。
// 送信ボタンにする場合はtype="submit"を明示する
export function Button({ variant, size, withArrow, className, type = 'button', ...buttonProps }: ButtonProps) {
  return <button type={type} className={buttonClassName({ variant, size, withArrow }, className)} {...buttonProps} />
}

type ButtonLinkProps = ButtonStyle & ComponentProps<typeof Link>

// ButtonLink: 画面遷移するリンクをボタンの見た目で表示する共通部品(react-routerのLinkを使う)
export function ButtonLink({ variant, size, withArrow, className, ...linkProps }: ButtonLinkProps) {
  return <Link className={buttonClassName({ variant, size, withArrow }, className)} {...linkProps} />
}
