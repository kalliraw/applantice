import { useId, type SelectHTMLAttributes } from 'react'
import styles from './Select.module.css'

type Option = { value: string; label: string }

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  label?: string
  options: Option[]
}

export function Select({ label, options, className, id, ...rest }: Props) {
  const autoId = useId()
  const selectId = id ?? autoId
  return (
    <div className={styles.field}>
      {label && (
        <label htmlFor={selectId} className={styles.label}>
          {label}
        </label>
      )}
      <div className={styles.wrap}>
        <select id={selectId} className={`${styles.select} ${className ?? ''}`} {...rest}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <svg className={styles.chevron} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  )
}
