import type { ReactNode } from 'react'
import styles from './Badge.module.css'

type Tone = 'kanton' | 'betrieblich' | 'neutral' | 'accent' | 'warn' | 'erledigt'

type Props = {
  tone?: Tone
  dot?: boolean
  children: ReactNode
}

export function Badge({ tone = 'neutral', dot = false, children }: Props) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`}>
      {dot && <span className={styles.dot} aria-hidden />}
      {children}
    </span>
  )
}
