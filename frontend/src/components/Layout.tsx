import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.tsx'
import { Badge, Icon, type IconName } from '../ui/index.ts'
import styles from './Layout.module.css'

type NavEintrag = {
  pfad: string
  label: string
  icon: IconName
  nurBB?: boolean
  nurLernende?: boolean
}

const NAV: NavEintrag[] = [
  { pfad: '/', label: 'Start', icon: 'home' },
  { pfad: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { pfad: '/handlungskompetenzen', label: 'Handlungskompetenzen', icon: 'target' },
  { pfad: '/selbsteinschaetzung', label: 'Selbsteinschätzung', icon: 'check-square', nurLernende: true },
  { pfad: '/noten', label: 'Notenrechner', icon: 'calculator' },
  { pfad: '/bildungsbericht', label: 'Bildungsbericht', icon: 'file-text' },
  { pfad: '/faecher', label: 'Fächer verwalten', icon: 'book', nurBB: true },
  { pfad: '/teams', label: 'Team-Rotation', icon: 'users' },
]

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
    if (n.nurBB) return rolle === 'berufsbildner'
    if (n.nurLernende) return rolle === 'lernende'
    return true
  })

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.logo}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="3" y="13" width="4" height="8" rx="1.2" fill="#fff" opacity="0.75" />
              <rect x="10" y="8" width="4" height="13" rx="1.2" fill="#fff" opacity="0.88" />
              <rect x="17" y="3" width="4" height="18" rx="1.2" fill="#fff" />
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
              <Badge tone={rolle === 'berufsbildner' ? 'accent' : 'neutral'}>
                {rolle === 'berufsbildner' ? 'Berufsbildner' : 'Lernende(r)'}
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
