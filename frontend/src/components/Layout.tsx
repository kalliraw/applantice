import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.tsx'
import type { Rolle } from '../lib/types.ts'
import { Badge, Icon, type IconName } from '../ui/index.ts'
import styles from './Layout.module.css'

type NavEintrag = {
  pfad: string
  label: string
  icon: IconName
  /** Rollen, die diesen Eintrag sehen. */
  rollen: Rolle[]
}

const ALLE_FACH: Rolle[] = ['lernende', 'berufsbildner', 'admin']
const VERWALTUNG: Rolle[] = ['berufsbildner', 'admin']

const NAV: NavEintrag[] = [
  { pfad: '/', label: 'Start', icon: 'home', rollen: ['lernende', 'teamowner', 'berufsbildner', 'admin'] },
  { pfad: '/dashboard', label: 'Dashboard', icon: 'dashboard', rollen: ALLE_FACH },
  { pfad: '/mein-team', label: 'Mein Team', icon: 'target', rollen: ['teamowner'] },
  { pfad: '/handlungskompetenzen', label: 'Handlungskompetenzen', icon: 'target', rollen: ALLE_FACH },
  { pfad: '/selbsteinschaetzung', label: 'Selbsteinschätzung', icon: 'check-square', rollen: ['lernende'] },
  { pfad: '/noten', label: 'Notenrechner', icon: 'calculator', rollen: ALLE_FACH },
  { pfad: '/bildungsbericht', label: 'Bildungsbericht', icon: 'file-text', rollen: ALLE_FACH },
  { pfad: '/faecher', label: 'Fächer verwalten', icon: 'book', rollen: VERWALTUNG },
  { pfad: '/planung', label: 'Ausbildungsplanung', icon: 'calendar', rollen: ALLE_FACH },
  { pfad: '/einstellungen', label: 'Einstellungen', icon: 'settings', rollen: VERWALTUNG },
]

const ROLLE_LABEL: Record<Rolle, string> = {
  lernende: 'Lernende(r)',
  teamowner: 'Teamowner',
  berufsbildner: 'Berufsbildner',
  admin: 'Admin',
}

function initialen(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((t) => t[0]?.toUpperCase() ?? '')
    .join('')
}

export function Layout() {
  const { profil, signOut } = useAuth()
  const rolle = profil?.rolle ?? null

  const sichtbar = NAV.filter((n) => {
    if (rolle === null) return n.pfad === '/'
    return n.rollen.includes(rolle)
  })

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.logo}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M8.5 7 4 12l4.5 5M15.5 7 20 12l-4.5 5M13.7 4.5l-3.4 15"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className={styles.brandText}>
            Ausbildungsplan
            <span>Informatik EFZ</span>
          </div>
        </div>

        <nav className={styles.nav}>
          {sichtbar.map((n) => (
            <NavLink
              key={n.pfad}
              to={n.pfad}
              end={n.pfad === '/'}
              className={({ isActive }) =>
                styles.navlink + (isActive ? ' ' + styles.active : '')
              }
            >
              <Icon name={n.icon} size={18} />
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.spacer} />

        <div className={styles.userbox}>
          <div className={styles.avatar}>{initialen(profil?.name ?? '?')}</div>
          <div className={styles.userinfo}>
            <div className={styles.username}>{profil?.name}</div>
            {rolle ? (
              <Badge tone={rolle === 'lernende' ? 'neutral' : 'accent'}>
                {ROLLE_LABEL[rolle]}
              </Badge>
            ) : (
              <Badge tone="warn">ohne Rolle</Badge>
            )}
          </div>
          <button className={styles.logout} title="Abmelden" onClick={() => void signOut()}>
            <Icon name="log-out" size={18} />
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.content}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
