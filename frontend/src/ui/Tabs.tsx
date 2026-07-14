import styles from './Tabs.module.css'

type Tab = { id: string; label: string }

type Props = {
  tabs: Tab[]
  active: string
  onChange: (id: string) => void
}

export function Tabs({ tabs, active, onChange }: Props) {
  return (
    <div className={styles.tabs} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === active}
          className={`${styles.tab} ${t.id === active ? styles.active : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
