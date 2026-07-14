import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase.ts'
import type { Benutzer } from './types.ts'
import { useAuth } from '../auth/AuthContext.tsx'

type LernendenWert = {
  /** Berufsbildner: alle aktiven Lernenden. Lernende: nur sie selbst. */
  lernende: Benutzer[]
  aktivId: string | null
  setAktivId: (id: string) => void
  aktiv: Benutzer | null
  istBB: boolean
  ladt: boolean
  /** Aktualisiert einen Lernenden lokal (z.B. nach macht_bm-Änderung). */
  patchLernende: (id: string, patch: Partial<Benutzer>) => void
}

const Ctx = createContext<LernendenWert | undefined>(undefined)

export function LernendenProvider({ children }: { children: ReactNode }) {
  const { profil } = useAuth()
  const istBB = profil?.rolle === 'berufsbildner'
  const [lernende, setLernende] = useState<Benutzer[]>([])
  const [aktivId, setAktivId] = useState<string | null>(null)
  const [ladt, setLadt] = useState(true)

  useEffect(() => {
    let aktiv = true
    async function laden() {
      if (!profil) return
      if (!istBB) {
        // Lernende: nur der eigene Datensatz.
        if (aktiv) {
          setLernende([profil])
          setAktivId(profil.id)
          setLadt(false)
        }
        return
      }
      const { data } = await supabase
        .from('benutzer')
        .select('*')
        .eq('rolle', 'lernende')
        .eq('aktiv', true)
        .order('name')
      if (!aktiv) return
      const liste = (data as Benutzer[] | null) ?? []
      setLernende(liste)
      setAktivId((cur) => cur ?? liste[0]?.id ?? null)
      setLadt(false)
    }
    void laden()
    return () => {
      aktiv = false
    }
  }, [profil, istBB])

  const aktiv = lernende.find((l) => l.id === aktivId) ?? null

  function patchLernende(id: string, patch: Partial<Benutzer>) {
    setLernende((cur) => cur.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  return (
    <Ctx.Provider value={{ lernende, aktivId, setAktivId, aktiv, istBB, ladt, patchLernende }}>
      {children}
    </Ctx.Provider>
  )
}

export function useLernende(): LernendenWert {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useLernende muss innerhalb von <LernendenProvider> stehen')
  return ctx
}
