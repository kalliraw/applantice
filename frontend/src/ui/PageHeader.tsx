import type { ReactNode } from 'react'
import styles from './PageHeader.module.css'

type Props = {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ eyebrow, title, description, actions }: Props) {
  return (
    <div className={styles.header}>
      <div className={styles.text}>
        {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  )
}
