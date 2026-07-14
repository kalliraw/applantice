/*
 * Zeitstrahl-Mathematik – reine Funktionen (Datum ↔ Semester ↔ ISO-KW ↔ Position).
 * Keine Bindung an "heute": alle Bezugsdaten werden hereingereicht, damit testbar.
 * Semester = 6-Monats-Blöcke ab Ausbildungsstart (konsistent mit dem Dashboard).
 */

export const LEHRJAHRE = 4
export const SEMESTER_ANZAHL = 8

/** Datum um n Monate verschieben (ohne die Ursprungsinstanz zu verändern). */
export function addMonate(d: Date, n: number): Date {
  const r = new Date(d)
  r.setMonth(r.getMonth() + n)
  return r
}

export type SemesterBlock = { nr: number; lehrjahr: number; von: Date; bis: Date }

/** Die 8 Semester-Blöcke ab Ausbildungsstart (bis = exklusiver Start des nächsten). */
export function semesterBloecke(start: Date): SemesterBlock[] {
  const bloecke: SemesterBlock[] = []
  for (let i = 0; i < SEMESTER_ANZAHL; i++) {
    bloecke.push({
      nr: i + 1,
      lehrjahr: Math.floor(i / 2) + 1,
      von: addMonate(start, i * 6),
      bis: addMonate(start, (i + 1) * 6),
    })
  }
  return bloecke
}

/** Ende der Ausbildung (Start + 4 Jahre). */
export function ausbildungsEnde(start: Date): Date {
  return addMonate(start, SEMESTER_ANZAHL * 6)
}

/** Anteil 0..1 einer Zeit innerhalb der Ausbildung (geklemmt auf [0,1]). */
export function positionAnteil(datum: Date, start: Date, ende: Date): number {
  const span = ende.getTime() - start.getTime()
  if (span <= 0) return 0
  return Math.max(0, Math.min(1, (datum.getTime() - start.getTime()) / span))
}

/** Semester-Nummer (1..8) zu einem Datum, oder null wenn ausserhalb der Ausbildung. */
export function semesterVon(datum: Date, start: Date): number | null {
  for (const b of semesterBloecke(start)) {
    if (datum >= b.von && datum < b.bis) return b.nr
  }
  return null
}

/** ISO-8601-Kalenderwoche eines Datums (1..53). */
export function isoWoche(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNr = (date.getUTCDay() + 6) % 7 // Montag = 0
  date.setUTCDate(date.getUTCDate() - dayNr + 3) // Donnerstag der aktuellen Woche
  const jahrStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - jahrStart.getTime()) / 86400000 + 1) / 7)
}

/** ISO-Wochenjahr (das Jahr, zu dem die ISO-Woche gehört – kann am Jahreswechsel abweichen). */
export function isoWochenJahr(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNr = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayNr + 3)
  return date.getUTCFullYear()
}

/** Anzahl ganzer Wochen zwischen zwei Daten (für die Höhenberechnung). */
export function wochenZwischen(von: Date, bis: Date): number {
  return Math.max(0, (bis.getTime() - von.getTime()) / (7 * 86400000))
}

/**
 * Rundet ein Datum auf den nächstgelegenen Wochenanfang (Montag, 00:00 lokal).
 * Für das Snapping beim Drag-and-Drop auf der Zeitachse (Bänder rasten auf KW ein).
 */
export function snapAufWoche(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  const tag = (r.getDay() + 6) % 7 // Montag = 0 … Sonntag = 6
  if (tag <= 3) r.setDate(r.getDate() - tag) // Mo–Do -> Montag dieser Woche
  else r.setDate(r.getDate() + (7 - tag)) // Fr–So -> nächster Montag
  return r
}

/** Datum als lokales ISO-Datum 'YYYY-MM-DD' (ohne UTC-Verschiebung). */
export function toIsoDatum(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const t = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${t}`
}
