import styles from './ProgressBar.module.css'

type Props = {
  /** Fortschritt 0..100. */
  value: number
  label?: string
  caption?: string
  /** rechts oben angezeigter Wert (z.B. "12 / 33"). */
  valueLabel?: string
  tone?: 'accent' | 'gelb'
  /** optionale Markierung 0..100 (z.B. aktuelle Position). */
  marker?: number
}

export function ProgressBar({ value, label, caption, valueLabel, tone = 'accent', marker }: Props) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className={styles.wrap}>
      {(label || valueLabel) && (
        <div className={styles.top}>
          {label && <span className={styles.label}>{label}</span>}
          {valueLabel && <span className={styles.value}>{valueLabel}</span>}
        </div>
      )}
      <div className={styles.track}>
        <div
          className={`${styles.fill} ${tone === 'gelb' ? styles.gelb : styles.accent}`}
          style={{ width: `${v}%` }}
        />
        {marker !== undefined && (
          <div className={styles.marker} style={{ left: `${Math.max(0, Math.min(100, marker))}%` }} />
        )}
      </div>
      {caption && <div className={styles.caption}>{caption}</div>}
    </div>
  )
}
