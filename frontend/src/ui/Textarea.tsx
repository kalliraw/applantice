import { useId, type TextareaHTMLAttributes } from 'react'
import styles from './Textarea.module.css'

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string
  hint?: string
}

export function Textarea({ label, hint, className, id, rows = 4, ...rest }: Props) {
  const autoId = useId()
  const taId = id ?? autoId
  return (
    <div className={styles.field}>
      {label && (
        <label htmlFor={taId} className={styles.label}>
          {label}
        </label>
      )}
      <textarea id={taId} rows={rows} className={`${styles.textarea} ${className ?? ''}`} {...rest} />
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  )
}
