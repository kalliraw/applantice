import type { Bedarf, Rundung } from '../../lib/noten.ts'
import { runde } from '../../lib/noten.ts'

/** Eingabe "4,5" / "4.5" → 4.5; nur gültige Schweizer Noten 1–6. */
export function parseNote(str: string | undefined | null): number | null {
  if (str == null || str === '') return null
  const n = Number(String(str).replace(',', '.'))
  return Number.isFinite(n) && n >= 1 && n <= 6 ? n : null
}

/** Anzeige mit einer Dezimalstelle; "—" für fehlende Werte. */
export const fmt = (v: number | null | undefined) => (v == null ? '—' : runde(v, 'zehntel').toFixed(1))

/** Anzeige einer (ggf. auf halbe) gerundeten Note, z.B. Modulnote. */
export const fmtGerundet = (v: number | null | undefined, rundung: Rundung) =>
  v == null ? '—' : runde(v, rundung).toFixed(rundung === 'halbe' || rundung === 'zehntel' ? 1 : 2)

/** Ziel-Optionen für Auswahlfelder (halbe Noten). */
export const ZIEL_OPTIONEN = [3.5, 4, 4.5, 5, 5.5, 6].map((z) => ({ value: String(z), label: z.toFixed(1) }))

export const SEMESTER_OPTIONEN = [
  { value: '', label: '–' },
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((s) => ({ value: String(s), label: `S${s}` })),
]

/** Kurztext für ein Zielnoten-Ergebnis. */
export function bedarfText(b: Bedarf): string {
  if (b.status === 'erreicht') return 'bereits erreicht'
  if (b.status === 'moeglich') return `mind. ${b.note.toFixed(1)}`
  return b.maximal != null ? `nicht erreichbar (max. ${b.maximal.toFixed(1)})` : 'nicht erreichbar'
}
