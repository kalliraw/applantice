/*
 * Notenberechnung – reine, ungebundene Funktionen (siehe planung/techstack.md:
 * "Notenformel-Logik als reine, ungebundene Funktionen mit Unit-Tests").
 *
 * Die GEWICHTE sind Daten, nicht Code: sie kommen aus der Tabelle `notenkomponente`
 * (kontext EFZ oder BM) und werden hier nur verrechnet. Diese Datei kennt keine
 * hartkodierten Prozentsätze – die EFZ-Formel (IPA 40 / Informatikkompetenzen 30
 * [BFS 80 + ÜK 20] / ABU 20 / EGK 10) lebt als Zeilen in der Datenbank und wird
 * als Baum von `Notenkomponente` hereingereicht.
 */

/** Eine Notenkomponente aus der DB, als Baum (parent → kinder) aufgebaut. */
export type Notenkomponente = {
  code: string
  name: string
  /** Gewicht innerhalb der Geschwister; wird pro Ebene normalisiert. */
  gewicht: number
  kinder?: Notenkomponente[]
}

/** Blattwerte: Komponenten-Code → bereits aggregierte Note (z.B. Erfahrungsnote). */
export type Blattwerte = Record<string, number | null | undefined>

/**
 * Gewichteter Mittelwert. Einträge ohne Wert (null/undefined) werden ignoriert.
 * Gibt null zurück, wenn kein Eintrag einen Wert oder Gesamtgewicht > 0 hat.
 */
export function gewichteterMittelwert(
  eintraege: { wert: number | null | undefined; gewicht: number }[],
): number | null {
  let summe = 0
  let gewichtSumme = 0
  for (const e of eintraege) {
    if (e.wert == null || e.gewicht <= 0) continue
    summe += e.wert * e.gewicht
    gewichtSumme += e.gewicht
  }
  if (gewichtSumme <= 0) return null
  return summe / gewichtSumme
}

/**
 * Wert einer Komponente:
 * - Blatt (keine Kinder): der eingegebene/aggregierte Blattwert.
 * - Knoten: gewichteter Mittelwert der Kinderwerte (Kinder ohne Wert fallen weg).
 */
export function berechneKomponente(
  komponente: Notenkomponente,
  blattwerte: Blattwerte,
): number | null {
  if (!komponente.kinder || komponente.kinder.length === 0) {
    const w = blattwerte[komponente.code]
    return w == null ? null : w
  }
  const eintraege = komponente.kinder.map((kind) => ({
    wert: berechneKomponente(kind, blattwerte),
    gewicht: kind.gewicht,
  }))
  return gewichteterMittelwert(eintraege)
}

/**
 * Gesamtnote über mehrere Wurzel-Komponenten (z.B. die vier EFZ-Komponenten).
 * Kombiniert deren Werte gewichtet. Fehlende Teilnoten werden ausgelassen, damit
 * der Rechner auch während der Lehre einen Zwischenstand liefert.
 */
export function berechneGesamt(
  wurzeln: Notenkomponente[],
  blattwerte: Blattwerte,
): number | null {
  const eintraege = wurzeln.map((k) => ({
    wert: berechneKomponente(k, blattwerte),
    gewicht: k.gewicht,
  }))
  return gewichteterMittelwert(eintraege)
}

/**
 * Modulnote = gewichteter Schnitt der Leistungsbeurteilungen (LBs) eines Moduls.
 * (z.B. mehrere Prüfungen + VA mit unterschiedlichem Gewicht.)
 */
export function modulnote(lbs: { wert: number | null | undefined; gewicht: number }[]): number | null {
  return gewichteterMittelwert(lbs)
}

/** Summe der LB-Gewichte (in Prozent). */
export function gewichtSumme(lbs: { gewicht: number }[]): number {
  return lbs.reduce((a, l) => a + (Number.isFinite(l.gewicht) ? l.gewicht : 0), 0)
}

/**
 * Modulstatus anhand der Gewichtssumme:
 * - 'leer': keine LBs erfasst
 * - 'abgeschlossen': Gewichte ergeben zusammen 100 %
 * - 'begonnen': LBs vorhanden, Summe ≠ 100 % (unvollständig -> rot markieren)
 */
export function modulStatus(lbs: { gewicht: number }[]): 'leer' | 'begonnen' | 'abgeschlossen' {
  if (lbs.length === 0) return 'leer'
  return Math.abs(gewichtSumme(lbs) - 100) < 0.01 ? 'abgeschlossen' : 'begonnen'
}

/** Flache Notenkomponente-Zeile aus der DB (parent_id-Verkettung). */
export type KomponenteRow = {
  id: string
  code: string
  name: string
  gewicht: number
  parent_id: string | null
}

/**
 * Baut aus flachen DB-Zeilen den Komponentenbaum (Wurzeln = parent_id null).
 * Reihenfolge der Eingabe bleibt erhalten.
 */
export function baueBaum(rows: KomponenteRow[]): Notenkomponente[] {
  const byId = new Map<string, Notenkomponente>()
  for (const r of rows) {
    byId.set(r.id, { code: r.code, name: r.name, gewicht: r.gewicht, kinder: [] })
  }
  const roots: Notenkomponente[] = []
  for (const r of rows) {
    const node = byId.get(r.id)!
    const parent = r.parent_id ? byId.get(r.parent_id) : undefined
    if (parent) parent.kinder!.push(node)
    else roots.push(node)
  }
  // Leere kinder-Arrays (Blätter) entfernen.
  for (const node of byId.values()) {
    if (node.kinder && node.kinder.length === 0) delete node.kinder
  }
  return roots
}

// --- Vollständiger Notenstand eines Lernenden (wiederverwendbar) --------------
// Dieselbe Berechnung, die der Notenrechner live anzeigt, als eine reine
// Funktion – damit die im Bildungsbericht eingefrorene Vornote garantiert
// mit dem Notenrechner übereinstimmt (kein zweiter, divergierender Pfad).

/** Notenkomponente-Zeile mit den für die Baum-/Dispensations-Logik nötigen Feldern. */
export type NotenkomponenteZeile = {
  id: string
  code: string
  name: string
  kontext: string
  parent_id: string | null
  gewicht: number
  entfaellt_bei_bm: boolean
}
/** Fach-Zeile, reduziert auf die für die Aggregation nötigen Felder. */
export type FachZeile = {
  id: string
  kontext: string
  notenkomponente_id: string | null
  gewicht: number
}
/** Eine Leistungsbeurteilung, reduziert auf Wert + Gewicht. */
export type LbWert = { wert: number | null | undefined; gewicht: number }

/**
 * Baut den Komponentenbaum für einen Kontext (EFZ/BM), aggregiert die
 * Modulnoten pro Blatt-Komponente und liefert Gesamt- + Teilnoten.
 * Bei `machtBM` werden im EFZ-Kontext die dispensierten Komponenten
 * (`entfaellt_bei_bm`) ausgeklammert.
 */
export function berechneNotenstand(
  komponenten: NotenkomponenteZeile[],
  faecher: FachZeile[],
  lbsByFach: Record<string, LbWert[]>,
  ipaWert: number | null,
  kontext: string,
  machtBM: boolean,
): { roots: Notenkomponente[]; blatt: Blattwerte; total: number | null; dispensiertIds: string[] } {
  const alleKontext = komponenten.filter((k) => k.kontext === kontext)
  const hatKinder = new Set(alleKontext.filter((k) => k.parent_id).map((k) => k.parent_id))
  const dispensiertIds =
    kontext === 'EFZ' && machtBM ? alleKontext.filter((k) => k.entfaellt_bei_bm).map((k) => k.id) : []
  const dispSet = new Set(dispensiertIds)
  const effektiv = alleKontext.filter((k) => !dispSet.has(k.id))
  const roots = baueBaum(
    effektiv.map((k) => ({ id: k.id, code: k.code, name: k.name, gewicht: k.gewicht, parent_id: k.parent_id })),
  )
  const blatt: Blattwerte = {}
  for (const k of effektiv) {
    if (hatKinder.has(k.id)) continue
    const faecherK = faecher.filter((f) => f.kontext === kontext && f.notenkomponente_id === k.id)
    const avg = gewichteterMittelwert(
      faecherK.map((f) => ({ wert: modulnote(lbsByFach[f.id] ?? []), gewicht: f.gewicht })),
    )
    blatt[k.code] = avg != null ? avg : k.code === 'IPA' ? ipaWert : null
  }
  return { roots, blatt, total: berechneGesamt(roots, blatt), dispensiertIds }
}

/** Rundung auf eine Dezimalstelle (EFZ-Gesamtnote / Erfahrungsnoten-Konvention). */
export function rundeAufZehntel(note: number): number {
  return Math.round(note * 10) / 10
}

/** Rundung auf halbe Note (Fach-/Zeugnisnoten-Konvention). */
export function rundeAufHalbe(note: number): number {
  return Math.round(note * 2) / 2
}
