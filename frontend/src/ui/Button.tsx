import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './Button.module.css'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  block?: boolean
  loading?: boolean
  leftIcon?: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  block = false,
  loading = false,
  leftIcon,
  className,
  children,
  disabled,
  ...rest
}: Props) {
  const cls = [
    styles.btn,
    styles[variant],
    styles[size],
    block ? styles.block : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading ? <span className={styles.spinner} aria-hidden /> : leftIcon}
      {children}
    </button>
  )
}
