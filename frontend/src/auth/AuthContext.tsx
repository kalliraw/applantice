import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase.ts'

export type Rolle = 'lernende' | 'berufsbildner'

/** Profil-Zeile aus public.benutzer (rolle kann null sein: Entra-Sync ohne Rolle). */
export type Benutzer = {
  id: string
  auth_user_id: string | null
  email: string
  name: string
  rolle: Rolle | null
  auth_typ: 'entra_id' | 'lokal'
  upn: string | null
  ausbildungsstart: string | null
  macht_bm: boolean
  aktiv: boolean
}

type AuthContextWert = {
  session: Session | null
  profil: Benutzer | null
  ladt: boolean
  signInPassword: (email: string, passwort: string) => Promise<string | null>
  signInEntra: () => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextWert | undefined>(undefined)

async function ladeProfil(authUserId: string): Promise<Benutzer | null> {
  const { data, error } = await supabase
    .from('benutzer')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  if (error) {
    console.error('Profil laden fehlgeschlagen:', error.message)
    return null
  }
  return data as Benutzer | null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profil, setProfil] = useState<Benutzer | null>(null)
  const [ladt, setLadt] = useState(true)

  useEffect(() => {
    let aktiv = true

    async function init() {
      const { data } = await supabase.auth.getSession()
      if (!aktiv) return
      setSession(data.session)
      setProfil(data.session ? await ladeProfil(data.session.user.id) : null)
      setLadt(false)
    }
    init()

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!aktiv) return
      setSession(s)
      setProfil(s ? await ladeProfil(s.user.id) : null)
    })

    return () => {
      aktiv = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const wert: AuthContextWert = {
    session,
    profil,
    ladt,
    async signInPassword(email, passwort) {
      const { error } = await supabase.auth.signInWithPassword({ email, password: passwort })
      return error ? error.message : null
    },
    async signInEntra() {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: { redirectTo: window.location.origin, scopes: 'openid email profile' },
      })
      return error ? error.message : null
    },
    async signOut() {
      await supabase.auth.signOut()
    },
  }

  return <AuthContext.Provider value={wert}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextWert {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth muss innerhalb von <AuthProvider> verwendet werden')
  return ctx
}
