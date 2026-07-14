import { Select } from '../ui/index.ts'
import { useLernende } from '../lib/LernendenContext.tsx'

/** Lernenden-Auswahl für den Berufsbildner. Bei Lernenden nicht sichtbar (nur sie selbst). */
export function LernendeAuswahl() {
  const { lernende, aktivId, setAktivId, istBB } = useLernende()
  if (!istBB) return null
  if (lernende.length === 0) return <span className="muted">Keine Lernenden erfasst</span>
  return (
    <Select
      aria-label="Lernende(r) auswählen"
      value={aktivId ?? ''}
      onChange={(e) => setAktivId(e.target.value)}
      options={lernende.map((l) => ({ value: l.id, label: l.name }))}
    />
  )
}
