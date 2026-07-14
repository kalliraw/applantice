import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext.tsx'
import { Button, Card, LoadingScreen } from '../ui/index.ts'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, profil, ladt, signOut } = useAuth()

  if (ladt) return <LoadingScreen />

  if (!session) return <Navigate to="/login" replace />

  // Eingeloggt, aber nicht in der Allowlist (kein benutzer-Eintrag).
  if (!profil) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 'var(--sp-5)' }}>
        <Card title="Kein Zugang" style={{ maxWidth: 440, textAlign: 'center' }}>
          <p className="muted" style={{ marginBottom: 'var(--sp-5)' }}>
            Dein Konto ist noch nicht für diese App freigegeben. Bitte wende dich an den
            Berufsbildner.
          </p>
          <Button variant="primary" onClick={() => void signOut()}>
            Abmelden
          </Button>
        </Card>
      </div>
    )
  }

  return <>{children}</>
}
