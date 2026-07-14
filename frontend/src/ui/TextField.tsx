import { useId, type InputHTMLAttributes } from 'react'
import styles from './TextField.module.css'

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  hint?: string
  error?: string | null
}

export function TextField({ label, hint, error, className, id, ...rest }: Props) {
  const autoId = useId()
  const inputId = id ?? autoId

  return (
    <div className={styles.field}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`${styles.input} ${error ? styles.inputError : ''} ${className ?? ''}`}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      {error ? (
        <span className={styles.error}>{error}</span>
      ) : hint ? (
        <span className={styles.hint}>{hint}</span>
      ) : null}
    </div>
  )
}
