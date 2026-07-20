import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.tsx'
import { supabaseKonfiguriert } from '../lib/supabase.ts'
import { Button, Card, TextField } from '../ui/index.ts'
import styles from './LoginPage.module.css'

export function LoginPage() {
  const { session, signInPassword, signInEntra } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [passwort, setPasswort] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function login(e: FormEvent) {
    e.preventDefault()
    setFehler(null)
    setLaeuft(true)
    const err = await signInPassword(email.trim(), passwort)
    setLaeuft(false)
    if (err) setFehler('Login fehlgeschlagen – E-Mail oder Passwort prüfen.')
    else navigate('/', { replace: true })
  }

  return (
    <div className={styles.wrap}>
      <Card className={styles.card}>
        <div className={styles.brand}>
          <div className={styles.logo}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden>
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
            <span>Informatik EFZ · Swiss TPH</span>
          </div>
        </div>

        <h1 className={styles.title}>Anmelden</h1>
        <p className={styles.lead}>Melde dich an, um deinen Ausbildungsstand zu sehen.</p>

        {!supabaseKonfiguriert && (
          <p className={styles.note} style={{ color: 'var(--gelb)' }}>
            Keine Backend-Verbindung konfiguriert (frontend/.env).
          </p>
        )}

        <Button
          variant="secondary"
          block
          onClick={() => signInEntra()}
          title="Anmeldung über Microsoft Entra ID (Swiss TPH SSO)"
        >
          Mit Microsoft Entra ID anmelden
        </Button>
        <p className={styles.note}>
          Single Sign-on über Swiss TPH. Alternativ: Break-Glass-Login.
        </p>

        <div className={styles.divider}>
          <span>oder</span>
        </div>

        <form className={styles.form} onSubmit={login}>
          <TextField
            label="E-Mail"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@swisstph.ch"
            required
          />
          <TextField
            label="Passwort"
            type="password"
            autoComplete="current-password"
            value={passwort}
            onChange={(e) => setPasswort(e.target.value)}
            error={fehler}
            required
          />
          <Button variant="primary" type="submit" block loading={laeuft}>
            Anmelden
          </Button>
        </form>
      </Card>
    </div>
  )
}
