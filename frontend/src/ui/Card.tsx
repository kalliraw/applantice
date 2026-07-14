import type { HTMLAttributes, ReactNode } from 'react'
import styles from './Card.module.css'

type Props = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  /** Hebt die Karte mit Akzent-Rahmen hervor (z.B. Hinweise). */
  accent?: boolean
  /** 'warn' für gelben Akzentrahmen. */
  tone?: 'default' | 'warn'
}

export function Card({
  title,
  subtitle,
  actions,
  accent = false,
  tone = 'default',
  className,
  children,
  ...rest
}: Props) {
  const cls = [
    styles.card,
    accent ? styles.accent : '',
    tone === 'warn' ? styles.warn : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls} {...rest}>
      {(title || actions) && (
        <div className={styles.head}>
          <div>
            {title && <h3 className={styles.title}>{title}</h3>}
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
