import styles from './Spinner.module.css'

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      className={styles.spinner}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Lädt"
    />
  )
}

/** Ganzseitiger Ladezustand. */
export function LoadingScreen({ text = 'Lädt …' }: { text?: string }) {
  return (
    <div className={styles.screen}>
      <Spinner size={26} />
      <span className={styles.text}>{text}</span>
    </div>
  )
}
