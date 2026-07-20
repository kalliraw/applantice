import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase.ts'
import type { Benutzer, Betreuung } from './types.ts'
import { useAuth } from '../auth/AuthContext.tsx'

type LernendenWert = {
  /**
   * Sichtbare Lernenden je Rolle: Admin = alle; Berufsbildner = die betreuten;
   * Lernende = nur sie selbst; Teamowner = keine (Team-Dashboard statt Auswahl).
   */
  lernende: Benutzer[]
  aktivId: string | null
  setAktivId: (id: string) => void
  aktiv: Benutzer | null
  /** true für Berufsbildner UND Admin – "darf Lernenden-Daten sehen/verwalten". */
  istBB: boolean
  istAdmin: boolean
  istTeamowner: boolean
  ladt: boolean
  /** Aktualisiert einen Lernenden lokal (z.B. nach macht_bm-Änderung). */
  patchLernende: (id: string, patch: Partial<Benutzer>) => void
}

const Ctx = createContext<LernendenWert | undefined>(undefined)

export function LernendenProvider({ children }: { children: ReactNode }) {
  const { profil } = useAuth()
  const rolle = profil?.rolle ?? null
  const istAdmin = rolle === 'admin'
  // "istBB" = darf Lernenden-Daten sehen/verwalten (Berufsbildner ODER Admin).
  const istBB = rolle === 'berufsbildner' || rolle === 'admin'
  const istTeamowner = rolle === 'teamowner'

  const [lernende, setLernende] = useState<Benutzer[]>([])
  const [aktivId, setAktivId] = useState<string | null>(null)
  const [ladt, setLadt] = useState(true)

  useEffect(() => {
    let aktiv = true
    async function laden() {
      if (!profil) return

      // Lernende: nur der eigene Datensatz.
      if (rolle === 'lernende') {
        if (aktiv) {
          setLernende([profil])
          setAktivId(profil.id)
          setLadt(false)
        }
        return
      }

      // Teamowner / rollenlos: keine Lernenden-Auswahl (eigenes Dashboard bzw. kein Zugriff).
      if (!istBB) {
        if (aktiv) {
          setLernende([])
          setAktivId(null)
          setLadt(false)
        }
        return
      }

      // Admin: alle aktiven Lernenden. Berufsbildner: nur die betreuten.
      let liste: Benutzer[] = []
      if (istAdmin) {
        const { data } = await supabase
          .from('benutzer')
          .select('*')
          .eq('rolle', 'lernende')
          .eq('aktiv', true)
          .order('name')
        liste = (data as Benutzer[] | null) ?? []
      } else {
        // Berufsbildner: offene (aktive) Betreuungen -> zugewiesene Lernende.
        // Aktiv = bis_datum leer; ein beendeter Eintrag verschwindet aus der Auswahl.
        const { data: betr } = await supabase
          .from('betreuung')
          .select('lernende_id, von_datum, bis_datum')
          .eq('berufsbildner_id', profil.id)
        const ids = ((betr as Betreuung[] | null) ?? [])
          .filter((b) => !b.bis_datum)
          .map((b) => b.lernende_id)
        const uniqueIds = [...new Set(ids)]
        if (uniqueIds.length > 0) {
          const { data } = await supabase
            .from('benutzer')
            .select('*')
            .in('id', uniqueIds)
            .eq('aktiv', true)
            .order('name')
          liste = (data as Benutzer[] | null) ?? []
        }
      }

      if (!aktiv) return
      setLernende(liste)
      setAktivId((cur) => cur ?? liste[0]?.id ?? null)
      setLadt(false)
    }
    void laden()
    return () => {
      aktiv = false
    }
  }, [profil, rolle, istBB, istAdmin])

  const aktiv = lernende.find((l) => l.id === aktivId) ?? null

  function patchLernende(id: string, patch: Partial<Benutzer>) {
    setLernende((cur) => cur.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  return (
    <Ctx.Provider
      value={{ lernende, aktivId, setAktivId, aktiv, istBB, istAdmin, istTeamowner, ladt, patchLernende }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useLernende(): LernendenWert {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useLernende muss innerhalb von <LernendenProvider> stehen')
  return ctx
}
