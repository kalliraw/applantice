import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.tsx'
import { supabaseKonfiguriert } from '../lib/supabase.ts'
import { Button, Card, TextField } from '../ui/index.ts'
import styles from './LoginPage.module.css'

export function LoginPage() {
  const { session, signInPassword } = useAuth()
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="3" y="13" width="4" height="8" rx="1.2" fill="#fff" opacity="0.75" />
              <rect x="10" y="8" width="4" height="13" rx="1.2" fill="#fff" opacity="0.88" />
              <rect x="17" y="3" width="4" height="18" rx="1.2" fill="#fff" />
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
          disabled
          title="Wird aktiv, sobald die Entra-App-Registrierung im Tenant steht (authconcept.md)"
        >
          Mit Microsoft Entra ID anmelden
        </Button>
        <p className={styles.note}>
          Single Sign-on wird aktiviert, sobald die Entra-App-Registrierung steht. Bis
          dahin: Break-Glass-Login.
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
