import styles from './Highlight.module.css'

/** Hebt Vorkommen von `query` in `text` gelb hervor (case-insensitiv). */
export function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  if (!q) return <>{text}</>
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const teile = text.split(new RegExp(`(${esc})`, 'gi'))
  const ql = q.toLowerCase()
  return (
    <>
      {teile.map((t, i) =>
        t.toLowerCase() === ql ? (
          <mark key={i} className={styles.treffer}>
            {t}
          </mark>
        ) : (
          <span key={i}>{t}</span>
        ),
      )}
    </>
  )
}
