import { useAuth } from '../auth/AuthContext.tsx'
import { Card, PageHeader } from '../ui/index.ts'
import styles from './HomePage.module.css'

export function HomePage() {
  const { profil } = useAuth()
  if (!profil) return null

  const vorname = profil.name.split(' ')[0]
  const rollenlos = profil.rolle === null
  const rolleLabel =
    profil.rolle === 'admin'
      ? 'Admin'
      : profil.rolle === 'berufsbildner'
        ? 'Berufsbildner'
        : profil.rolle === 'teamowner'
          ? 'Teamowner'
          : 'Lernende(r)'

  const stats: { label: string; wert: string }[] = [
    { label: 'E-Mail', wert: profil.email },
    { label: 'Login-Typ', wert: profil.auth_typ === 'lokal' ? 'Break-Glass (lokal)' : 'Entra ID' },
  ]
  if (profil.rolle === 'lernende') {
    stats.push({ label: 'Ausbildungsstart', wert: profil.ausbildungsstart ?? 'noch nicht erfasst' })
    stats.push({ label: 'Berufsmaturität', wert: profil.macht_bm ? 'ja' : 'nein' })
  }

  return (
    <div>
      <PageHeader
        eyebrow="Übersicht"
        title={`Willkommen, ${vorname}`}
        description={
          rollenlos
            ? 'Dein Konto ist angelegt.'
            : `Angemeldet als ${rolleLabel}. Wähle links einen Bereich.`
        }
      />

      {rollenlos ? (
        <Card tone="warn" title="Rolle noch nicht zugewiesen">
          <p className="muted" style={{ margin: 0 }}>
            Dein Konto wurde angelegt, aber der Berufsbildner hat dir noch keine Rolle
            zugewiesen. Sobald das erledigt ist, erscheinen hier deine Bereiche.
          </p>
        </Card>
      ) : (
        <div className={styles.grid}>
          {stats.map((s) => (
            <Card key={s.label} className={styles.stat}>
              <div className={styles.statLabel}>{s.label}</div>
              <div className={styles.statValue}>{s.wert}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
