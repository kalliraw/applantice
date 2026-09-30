import { useEffect, useState } from 'react'

/*
 * Notensimulation ("Was wäre, wenn …"): geplante LBs, eine angenommene IPA-Note
 * und angenommene BM-Prüfungsnoten. Bewusst NUR im Browser (localStorage) – eine
 * Simulation ist kein Verlaufsdatum und landet nie in der Datenbank.
 */

export type SimLb = { id: string; titel: string; gewicht: number; wert: number; semester: number | null }

export type SimStand = {
  lbs: Record<string, SimLb[]>
  ipa: number | null
  pruefung: Record<string, number>
}

const LEER: SimStand = { lbs: {}, ipa: null, pruefung: {} }
const schluessel = (benutzerId: string) => `notenrechner-sim:${benutzerId}`

function lade(benutzerId: string | null): SimStand {
  if (!benutzerId) return LEER
  try {
    const roh = localStorage.getItem(schluessel(benutzerId))
    if (!roh) return LEER
    const s = JSON.parse(roh) as Partial<SimStand>
    return { lbs: s.lbs ?? {}, ipa: s.ipa ?? null, pruefung: s.pruefung ?? {} }
  } catch {
    return LEER
  }
}

export function useSimulation(benutzerId: string | null) {
  const [sim, setSim] = useState<SimStand>(() => lade(benutzerId))

  useEffect(() => setSim(lade(benutzerId)), [benutzerId])

  function aendere(next: SimStand) {
    setSim(next)
    if (!benutzerId) return
    try {
      localStorage.setItem(schluessel(benutzerId), JSON.stringify(next))
    } catch {
      // Speicher blockiert (privates Fenster) – Simulation gilt dann nur bis zum Neuladen.
    }
  }

  const aktiv =
    Object.values(sim.lbs).some((l) => l.length > 0) || sim.ipa != null || Object.keys(sim.pruefung).length > 0

  return {
    sim,
    aktiv,
    addLb: (fachId: string, lb: Omit<SimLb, 'id'>) =>
      aendere({
        ...sim,
        lbs: { ...sim.lbs, [fachId]: [...(sim.lbs[fachId] ?? []), { ...lb, id: crypto.randomUUID() }] },
      }),
    removeLb: (fachId: string, id: string) =>
      aendere({ ...sim, lbs: { ...sim.lbs, [fachId]: (sim.lbs[fachId] ?? []).filter((l) => l.id !== id) } }),
    setIpa: (ipa: number | null) => aendere({ ...sim, ipa }),
    setPruefung: (fachId: string, wert: number | null) => {
      const pruefung = { ...sim.pruefung }
      if (wert == null) delete pruefung[fachId]
      else pruefung[fachId] = wert
      aendere({ ...sim, pruefung })
    },
    reset: () => aendere(LEER),
  }
}

export type Simulation = ReturnType<typeof useSimulation>
