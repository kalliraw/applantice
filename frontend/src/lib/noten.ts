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

/** Rundungsregel aus den Daten: auf halbe Note, auf Zehntel oder ungerundet (null). */
export type Rundung = 'halbe' | 'zehntel' | null

/** Eine Notenkomponente aus der DB, als Baum (parent → kinder) aufgebaut. */
export type Notenkomponente = {
  code: string
  name: string
  /** Gewicht innerhalb der Geschwister; wird pro Ebene normalisiert. */
  gewicht: number
  /** Rundung des Komponentenwerts (z.B. IK auf Zehntel). */
  rundung?: Rundung
  /** Fallnote: Mindestwert zum Bestehen (null = keine Bedingung). */
  mindestnote?: number | null
  kinder?: Notenkomponente[]
}

// Kleiner Zuschlag gegen Gleitkomma-Artefakte (4.75 * 2 = 9.499999…).
const EPS = 1e-9

/** Kaufmännische Rundung gemäss Regel ("halbe": 4.75 → 5.0, "zehntel": 4.45 → 4.5). */
export function runde(note: number, regel: Rundung | undefined): number {
  if (regel === 'halbe') return Math.floor(note * 2 + 0.5 + EPS) / 2
  if (regel === 'zehntel') return Math.floor(note * 10 + 0.5 + EPS) / 10
  return note
}
const rundeOpt = (note: number | null, regel: Rundung | undefined) => (note == null ? null : runde(note, regel))

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
    return rundeOpt(w == null ? null : w, komponente.rundung)
  }
  const eintraege = komponente.kinder.map((kind) => ({
    wert: berechneKomponente(kind, blattwerte),
    gewicht: kind.gewicht,
  }))
  return rundeOpt(gewichteterMittelwert(eintraege), komponente.rundung)
}

/**
 * Gesamtnote über mehrere Wurzel-Komponenten (z.B. die vier EFZ-Komponenten).
 * Kombiniert deren Werte gewichtet. Fehlende Teilnoten werden ausgelassen, damit
 * der Rechner auch während der Lehre einen Zwischenstand liefert.
 */
export function berechneGesamt(
  wurzeln: Notenkomponente[],
  blattwerte: Blattwerte,
  rundungGesamt: Rundung = null,
): number | null {
  const eintraege = wurzeln.map((k) => ({
    wert: berechneKomponente(k, blattwerte),
    gewicht: k.gewicht,
  }))
  return rundeOpt(gewichteterMittelwert(eintraege), rundungGesamt)
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
  rundung?: Rundung
  mindestnote?: number | null
}

/**
 * Baut aus flachen DB-Zeilen den Komponentenbaum (Wurzeln = parent_id null).
 * Reihenfolge der Eingabe bleibt erhalten.
 */
export function baueBaum(rows: KomponenteRow[]): Notenkomponente[] {
  const byId = new Map<string, Notenkomponente>()
  for (const r of rows) {
    byId.set(r.id, {
      code: r.code,
      name: r.name,
      gewicht: r.gewicht,
      rundung: r.rundung ?? null,
      mindestnote: r.mindestnote ?? null,
      kinder: [],
    })
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
  /** Rundung jeder Fach-/Modulnote vor dem Mitteln (z.B. halbe). */
  rundung_einzelnote?: Rundung
  rundung?: Rundung
  mindestnote?: number | null
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
  rundungGesamt: Rundung = null,
): { roots: Notenkomponente[]; blatt: Blattwerte; total: number | null; dispensiertIds: string[] } {
  const alleKontext = komponenten.filter((k) => k.kontext === kontext)
  const hatKinder = new Set(alleKontext.filter((k) => k.parent_id).map((k) => k.parent_id))
  const dispensiertIds =
    kontext === 'EFZ' && machtBM ? alleKontext.filter((k) => k.entfaellt_bei_bm).map((k) => k.id) : []
  const dispSet = new Set(dispensiertIds)
  const effektiv = alleKontext.filter((k) => !dispSet.has(k.id))
  const roots = baueBaum(
    effektiv.map((k) => ({
      id: k.id,
      code: k.code,
      name: k.name,
      gewicht: k.gewicht,
      parent_id: k.parent_id,
      rundung: k.rundung ?? null,
      mindestnote: k.mindestnote ?? null,
    })),
  )
  const blatt: Blattwerte = {}
  for (const k of effektiv) {
    if (hatKinder.has(k.id)) continue
    const faecherK = faecher.filter((f) => f.kontext === kontext && f.notenkomponente_id === k.id)
    const avg = gewichteterMittelwert(
      faecherK.map((f) => ({
        wert: rundeOpt(modulnote(lbsByFach[f.id] ?? []), k.rundung_einzelnote),
        gewicht: f.gewicht,
      })),
    )
    blatt[k.code] = avg != null ? avg : k.code === 'IPA' ? ipaWert : null
  }
  return { roots, blatt, total: berechneGesamt(roots, blatt, rundungGesamt), dispensiertIds }
}

/** Rundung auf eine Dezimalstelle (EFZ-Gesamtnote / Erfahrungsnoten-Konvention). */
export function rundeAufZehntel(note: number): number {
  return runde(note, 'zehntel')
}

/** Rundung auf halbe Note (Fach-/Zeugnisnoten-Konvention). */
export function rundeAufHalbe(note: number): number {
  return runde(note, 'halbe')
}

// --- Bestehen (Fallnoten) -----------------------------------------------------

export type Bedingung = {
  /** Anzeigename, z.B. "IPA" oder "Gesamtnote". */
  label: string
  wert: number | null
  mindest: number
  /** 'offen' = noch keine Note vorhanden. */
  status: 'erfuellt' | 'nicht_erfuellt' | 'offen'
}

const bedingungStatus = (wert: number | null, mindest: number): Bedingung['status'] =>
  wert == null ? 'offen' : wert + EPS >= mindest ? 'erfuellt' : 'nicht_erfuellt'

/**
 * Prüft alle Fallnoten: jede Komponente mit `mindestnote` (rekursiv) plus die
 * Gesamtnote. Die Regeln kommen aus den Daten (notenkomponente/notenregel).
 */
export function pruefeBestehen(
  wurzeln: Notenkomponente[],
  blattwerte: Blattwerte,
  gesamt: number | null,
  mindestGesamt: number | null,
): Bedingung[] {
  const out: Bedingung[] = []
  const besuche = (k: Notenkomponente) => {
    if (k.mindestnote != null) {
      const wert = berechneKomponente(k, blattwerte)
      out.push({ label: k.name, wert, mindest: k.mindestnote, status: bedingungStatus(wert, k.mindestnote) })
    }
    k.kinder?.forEach(besuche)
  }
  wurzeln.forEach(besuche)
  if (mindestGesamt != null) {
    out.push({ label: 'Gesamtnote', wert: gesamt, mindest: mindestGesamt, status: bedingungStatus(gesamt, mindestGesamt) })
  }
  return out
}

// --- Zielnote: "Welche Note brauche ich?" ----------------------------------------

export type Bedarf =
  | { status: 'erreicht' }
  | { status: 'moeglich'; note: number }
  | { status: 'unerreichbar'; maximal: number | null }

/**
 * Kleinste Note x im Raster (Standard 1.0–6.0 in Zehntelschritten), mit der
 * `ergebnis(x)` das Ziel erreicht. Funktioniert mit jeder Formel und Rundungsregel,
 * weil nur das Endergebnis verglichen wird (monoton steigend vorausgesetzt).
 * - 'erreicht':     schon mit der schlechtesten Note (1.0) erreicht
 * - 'unerreichbar': selbst mit 6.0 nicht erreicht (maximal = bestmögliches Ergebnis)
 */
export function benoetigteNote(
  ergebnis: (x: number) => number | null,
  ziel: number,
  raster: { min?: number; max?: number; schritt?: number } = {},
): Bedarf {
  const { min = 1, max = 6, schritt = 0.1 } = raster
  const erreicht = (x: number) => {
    const e = ergebnis(x)
    return e != null && e + EPS >= ziel
  }
  if (erreicht(min)) return { status: 'erreicht' }
  if (!erreicht(max)) return { status: 'unerreichbar', maximal: ergebnis(max) }
  // Binärsuche über ganzzahlige Rasterindizes (kein Gleitkomma-Drift).
  let lo = 0
  let hi = Math.round((max - min) / schritt)
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (erreicht(min + mid * schritt)) hi = mid
    else lo = mid
  }
  return { status: 'moeglich', note: Math.round((min + hi * schritt) * 1000) / 1000 }
}

// --- Berufsmaturität ---------------------------------------------------------------
// BMV: Semesternote = Schnitt der Leistungen im Semester; Erfahrungsnote = Schnitt
// der Semesternoten; Fachnote = Anteil Prüfung × Prüfung + Rest × Erfahrungsnote
// (Fächer mit Abschlussprüfung), sonst Erfahrungsnote. Gesamtnote = gewichteter
// Schnitt der Fachnoten (fach.gewicht, i.d.R. 1). Rundungen/Anteile/Grenzen kommen
// aus der Tabelle notenregel.

export type BmRegel = {
  rundung_gesamt: Rundung
  mindestnote_gesamt: number | null
  rundung_semesternote: Rundung
  rundung_erfahrungsnote: Rundung
  rundung_pruefungsnote: Rundung
  rundung_fachnote: Rundung
  anteil_pruefung: number | null
  max_ungenuegend: number | null
  max_notendefizit: number | null
}

export type BmFachEingabe = {
  id: string
  gewicht: number
  hatPruefung: boolean
  promotionsrelevant: boolean
  lbs: (LbWert & { semester: number | null })[]
  pruefung: number | null
}

export type BmFachErgebnis = {
  id: string
  /** Semester → Semesternote. LBs ohne Semester landen unter Schlüssel 0. */
  semesternoten: Record<number, number>
  erfahrungsnote: number | null
  /** Definitive Fachnote (bei Prüfungsfächern erst mit Prüfungsnote). */
  fachnote: number | null
  /** Fachnote oder – solange die Prüfung fehlt – die Erfahrungsnote als Prognose. */
  prognose: number | null
}

/** Fachnote aus Erfahrungs- und Prüfungsnote gemäss Regel. */
export function bmFachnote(
  erfahrungsnote: number | null,
  pruefung: number | null,
  hatPruefung: boolean,
  regel: BmRegel,
): number | null {
  if (!hatPruefung) return rundeOpt(erfahrungsnote, regel.rundung_fachnote)
  if (pruefung == null || erfahrungsnote == null) return null
  const a = regel.anteil_pruefung ?? 0.5
  const p = runde(pruefung, regel.rundung_pruefungsnote)
  return runde(a * p + (1 - a) * erfahrungsnote, regel.rundung_fachnote)
}

export function berechneBmFach(f: BmFachEingabe, regel: BmRegel): BmFachErgebnis {
  const proSemester: Record<number, LbWert[]> = {}
  for (const l of f.lbs) (proSemester[l.semester ?? 0] ??= []).push(l)
  const semesternoten: Record<number, number> = {}
  for (const [sem, lbs] of Object.entries(proSemester)) {
    const n = gewichteterMittelwert(lbs)
    if (n != null) semesternoten[Number(sem)] = runde(n, regel.rundung_semesternote)
  }
  const werte = Object.values(semesternoten)
  const erfahrungsnote = werte.length
    ? runde(werte.reduce((a, b) => a + b, 0) / werte.length, regel.rundung_erfahrungsnote)
    : null
  const fachnote = bmFachnote(erfahrungsnote, f.pruefung, f.hatPruefung, regel)
  return { id: f.id, semesternoten, erfahrungsnote, fachnote, prognose: fachnote ?? erfahrungsnote }
}

export type NormPruefung = {
  durchschnitt: number | null
  anzahlUngenuegend: number
  notendefizit: number
  okDurchschnitt: boolean
  okUngenuegend: boolean
  okDefizit: boolean
  erfuellt: boolean
}

/**
 * BM-Promotions- bzw. Bestehensnorm auf einer Liste von Noten: Durchschnitt >=
 * Mindestnote, höchstens N ungenügende Noten, Summe der Abweichungen unter der
 * Mindestnote höchstens X (BMV 2009 Art. 17 Abs. 4 / Art. 25).
 */
export function pruefeBmNorm(noten: number[], regel: BmRegel): NormPruefung {
  const grenze = regel.mindestnote_gesamt ?? 4
  const durchschnitt = noten.length
    ? runde(noten.reduce((a, b) => a + b, 0) / noten.length, regel.rundung_gesamt)
    : null
  const ungenuegend = noten.filter((n) => n + EPS < grenze)
  const notendefizit = Math.round(ungenuegend.reduce((a, n) => a + (grenze - n), 0) * 100) / 100
  const okDurchschnitt = durchschnitt != null && durchschnitt + EPS >= grenze
  const okUngenuegend = regel.max_ungenuegend == null || ungenuegend.length <= regel.max_ungenuegend
  const okDefizit = regel.max_notendefizit == null || notendefizit <= regel.max_notendefizit + EPS
  return {
    durchschnitt,
    anzahlUngenuegend: ungenuegend.length,
    notendefizit,
    okDurchschnitt,
    okUngenuegend,
    okDefizit,
    erfuellt: okDurchschnitt && okUngenuegend && okDefizit,
  }
}

export type BmStand = {
  faecher: BmFachErgebnis[]
  /** Gesamtnote aus den Prognosen (definitive Fachnoten, sonst Erfahrungsnoten). */
  gesamt: number | null
  /** true, solange nicht alle Fächer eine definitive Fachnote haben. */
  vorlaeufig: boolean
  bestehen: NormPruefung
  /** Semester-Promotion über die promotionsrelevanten Fächer (nur Semester 1–8). */
  promotion: { semester: number; norm: NormPruefung }[]
}

/**
 * Baut die BM-Eingaben aus DB-Zeilen (Fächer im Kontext BM, LBs mit Semester,
 * neueste Prüfungsnote je Fach). Gemeinsamer Pfad für Notenrechner und
 * Bildungsbericht-Snapshot.
 */
export function bmEingaben(
  komponenten: { id: string; kontext: string; promotionsrelevant?: boolean }[],
  faecher: (FachZeile & { hat_abschlusspruefung?: boolean })[],
  lbsByFach: Record<string, (LbWert & { semester?: number | null })[]>,
  pruefungByFach: Record<string, number | null | undefined>,
): BmFachEingabe[] {
  const bmKomp = new Map(komponenten.filter((k) => k.kontext === 'BM').map((k) => [k.id, k]))
  return faecher
    .filter((f) => f.kontext === 'BM' && f.notenkomponente_id != null && bmKomp.has(f.notenkomponente_id))
    .map((f) => ({
      id: f.id,
      gewicht: f.gewicht,
      hatPruefung: !!f.hat_abschlusspruefung,
      promotionsrelevant: bmKomp.get(f.notenkomponente_id!)?.promotionsrelevant !== false,
      lbs: (lbsByFach[f.id] ?? []).map((l) => ({ wert: l.wert, gewicht: l.gewicht, semester: l.semester ?? null })),
      pruefung: pruefungByFach[f.id] ?? null,
    }))
}

export function berechneBm(faecher: BmFachEingabe[], regel: BmRegel): BmStand {
  const erg = faecher.map((f) => berechneBmFach(f, regel))
  const gesamt = rundeOpt(
    gewichteterMittelwert(erg.map((e, i) => ({ wert: e.prognose, gewicht: faecher[i].gewicht }))),
    regel.rundung_gesamt,
  )
  const semester = new Set<number>()
  erg.forEach((e, i) => {
    if (!faecher[i].promotionsrelevant) return
    for (const s of Object.keys(e.semesternoten)) if (Number(s) > 0) semester.add(Number(s))
  })
  const promotion = [...semester]
    .sort((a, b) => a - b)
    .map((s) => ({
      semester: s,
      norm: pruefeBmNorm(
        erg.flatMap((e, i) =>
          faecher[i].promotionsrelevant && e.semesternoten[s] != null ? [e.semesternoten[s]] : [],
        ),
        regel,
      ),
    }))
  return {
    faecher: erg,
    gesamt,
    vorlaeufig: erg.some((e) => e.fachnote == null),
    bestehen: pruefeBmNorm(
      erg.map((e) => e.prognose).filter((n): n is number => n != null),
      regel,
    ),
    promotion,
  }
}
