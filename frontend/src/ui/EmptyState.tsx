import type { ReactNode } from 'react'
import styles from './EmptyState.module.css'

type Props = {
  title: string
  text?: string
  action?: ReactNode
}

export function EmptyState({ title, text, action }: Props) {
  return (
    <div className={styles.empty}>
      <div className={styles.title}>{title}</div>
      {text && <p className={styles.text}>{text}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
