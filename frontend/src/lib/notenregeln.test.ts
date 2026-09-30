import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { BmFachEingabe, BmRegel, FachZeile, NotenkomponenteZeile } from './noten.ts'
import {
  benoetigteNote,
  berechneBm,
  berechneNotenstand,
  bmFachnote,
  modulnote,
  pruefeBestehen,
  pruefeBmNorm,
  runde,
} from './noten.ts'

// EFZ-Komponenten mit Rundung/Fallnoten wie im Seed (BiVo 2021 Art. 19).
const komp: NotenkomponenteZeile[] = [
  { id: 'ipa', code: 'IPA', name: 'IPA', kontext: 'EFZ', parent_id: null, gewicht: 0.4, entfaellt_bei_bm: false, rundung: 'zehntel', mindestnote: 4 },
  { id: 'inf', code: 'INFORMATIK', name: 'Informatikkompetenzen', kontext: 'EFZ', parent_id: null, gewicht: 0.3, entfaellt_bei_bm: false, rundung: 'zehntel', mindestnote: 4 },
  { id: 'bfs', code: 'INFORMATIK_BFS', name: 'BFS', kontext: 'EFZ', parent_id: 'inf', gewicht: 0.8, entfaellt_bei_bm: false, rundung_einzelnote: 'halbe', rundung: 'halbe' },
  { id: 'uek', code: 'INFORMATIK_UEK', name: 'ÜK', kontext: 'EFZ', parent_id: 'inf', gewicht: 0.2, entfaellt_bei_bm: false, rundung_einzelnote: 'halbe', rundung: 'halbe' },
  { id: 'abu', code: 'ABU', name: 'ABU', kontext: 'EFZ', parent_id: null, gewicht: 0.2, entfaellt_bei_bm: true, rundung: 'zehntel' },
  { id: 'egk', code: 'EGK', name: 'EGK', kontext: 'EFZ', parent_id: null, gewicht: 0.1, entfaellt_bei_bm: true, rundung_einzelnote: 'halbe', rundung: 'halbe' },
]
const faecher: FachZeile[] = [
  { id: 'm1', kontext: 'EFZ', notenkomponente_id: 'bfs', gewicht: 1 },
  { id: 'm2', kontext: 'EFZ', notenkomponente_id: 'bfs', gewicht: 1 },
  { id: 'u1', kontext: 'EFZ', notenkomponente_id: 'uek', gewicht: 1 },
  { id: 'abu1', kontext: 'EFZ', notenkomponente_id: 'abu', gewicht: 1 },
  { id: 'egk1', kontext: 'EFZ', notenkomponente_id: 'egk', gewicht: 1 },
]
const lb = (wert: number) => [{ wert, gewicht: 100 }]

test('runde: halbe/zehntel ohne Gleitkomma-Fehler', () => {
  assert.equal(runde(4.75, 'halbe'), 5)
  assert.equal(runde(4.74, 'halbe'), 4.5)
  assert.equal(runde(4.25, 'halbe'), 4.5)
  assert.equal(runde(4.45, 'zehntel'), 4.5)
  assert.equal(runde(1.05, 'zehntel'), 1.1)
  assert.equal(runde(4.444, null), 4.444)
})

test('EFZ nach BiVo: Modulnoten auf halbe, Schnitt auf halbe, IK/Gesamt auf Zehntel', () => {
  const { total, blatt, roots } = berechneNotenstand(
    komp,
    faecher,
    // m1 = 4.8 -> 5.0, m2 = 4.2 -> 4.0 -> BFS-Schnitt 4.5; ÜK 5.3 -> 5.5
    { m1: lb(4.8), m2: lb(4.2), u1: lb(5.3), abu1: lb(4.6), egk1: lb(5.2) },
    4.84, // IPA -> 4.8
    'EFZ',
    false,
    'zehntel',
  )
  assert.equal(blatt.INFORMATIK_BFS, 4.5)
  assert.equal(blatt.INFORMATIK_UEK, 5.5)
  // IK = 0.8*4.5 + 0.2*5.5 = 4.7; EGK 5.2 -> 5.0; ABU 4.6
  // Gesamt = .4*4.8 + .3*4.7 + .2*4.6 + .1*5.0 = 4.75 -> 4.8
  assert.equal(total, 4.8)
  const bed = pruefeBestehen(roots, blatt, total, 4)
  assert.deepEqual(
    bed.map((b) => [b.label, b.wert, b.status]),
    [
      ['IPA', 4.8, 'erfuellt'],
      ['Informatikkompetenzen', 4.7, 'erfuellt'],
      ['Gesamtnote', 4.8, 'erfuellt'],
    ],
  )
})

test('Bestehen: IK unter 4 scheitert trotz genügender Gesamtnote', () => {
  const r = berechneNotenstand(komp, faecher, { m1: lb(3.5), m2: lb(3.5), u1: lb(4.0), abu1: lb(6), egk1: lb(6) }, 6, 'EFZ', false, 'zehntel')
  const bed = pruefeBestehen(r.roots, r.blatt, r.total, 4)
  assert.ok(r.total! >= 4)
  assert.equal(bed.find((b) => b.label === 'Informatikkompetenzen')?.status, 'nicht_erfuellt')
})

test('Bestehen: fehlende Noten sind offen, nicht durchgefallen', () => {
  const r = berechneNotenstand(komp, faecher, { m1: lb(5) }, null, 'EFZ', false, 'zehntel')
  const bed = pruefeBestehen(r.roots, r.blatt, r.total, 4)
  assert.equal(bed.find((b) => b.label === 'IPA')?.status, 'offen')
})

test('benoetigteNote: berücksichtigt die Rundung der Modulnote', () => {
  // Bisher 4.5 (Gewicht 50). Ziel Modulnote 5.0 (auf halbe) -> Schnitt >= 4.75 -> nächste LB >= 5.0
  const f = (x: number) => runde(modulnote([{ wert: 4.5, gewicht: 50 }, { wert: x, gewicht: 50 }])!, 'halbe')
  assert.deepEqual(benoetigteNote(f, 5), { status: 'moeglich', note: 5 })
  // Ziel 4.0 -> Schnitt >= 3.75 -> nächste LB >= 3.0
  assert.deepEqual(benoetigteNote(f, 4), { status: 'moeglich', note: 3 })
  // Ziel 3.0 -> Schnitt >= 2.75 -> schon mit 1.0 erreicht
  assert.deepEqual(benoetigteNote(f, 3), { status: 'erreicht' })
  const g = (x: number) => runde(modulnote([{ wert: 3, gewicht: 80 }, { wert: x, gewicht: 20 }])!, 'halbe')
  const r = benoetigteNote(g, 5)
  assert.equal(r.status, 'unerreichbar')
  assert.equal(r.status === 'unerreichbar' && r.maximal, 3.5)
})

test('benoetigteNote: IPA für Gesamtziel inkl. Rundung auf Zehntel', () => {
  const lbs = { m1: lb(5), m2: lb(5), u1: lb(5), abu1: lb(5), egk1: lb(5) }
  const f = (ipa: number) => berechneNotenstand(komp, faecher, lbs, ipa, 'EFZ', false, 'zehntel').total
  // Gesamt = .4*IPA + .6*5 >= 5.25 (rundet auf 5.3) -> IPA >= 5.625 -> 5.7 (IPA auf Zehntel: 5.6 -> 5.24 -> 5.2)
  assert.deepEqual(benoetigteNote(f, 5.3), { status: 'moeglich', note: 5.7 })
})

const bmRegel: BmRegel = {
  rundung_gesamt: 'zehntel',
  mindestnote_gesamt: 4,
  rundung_semesternote: 'halbe',
  rundung_erfahrungsnote: 'halbe',
  rundung_pruefungsnote: 'halbe',
  rundung_fachnote: 'halbe',
  anteil_pruefung: 0.5,
  max_ungenuegend: 2,
  max_notendefizit: 2,
}

test('BM-Fachnote = ½ Erfahrung + ½ Prüfung, auf halbe gerundet', () => {
  assert.equal(bmFachnote(4.5, 5.0, true, bmRegel), 5) // 4.75 -> 5.0
  assert.equal(bmFachnote(4.5, null, true, bmRegel), null) // Prüfung fehlt
  assert.equal(bmFachnote(4.5, null, false, bmRegel), 4.5) // Ergänzungsfach
})

test('BM-Norm: Durchschnitt, max. 2 ungenügend, Defizit <= 2', () => {
  assert.equal(pruefeBmNorm([5, 5, 5, 3.5, 3.5], bmRegel).erfuellt, true)
  const drei = pruefeBmNorm([6, 6, 6, 6, 3.5, 3.5, 3.5], bmRegel)
  assert.equal(drei.okUngenuegend, false)
  const defizit = pruefeBmNorm([6, 6, 6, 6, 6, 2.5, 3], bmRegel)
  assert.equal(defizit.notendefizit, 2.5)
  assert.equal(defizit.okDefizit, false)
  assert.equal(pruefeBmNorm([3.5, 4], bmRegel).okDurchschnitt, false)
})

test('berechneBm: Semesternoten, Erfahrungsnote, Promotion ohne IDAF', () => {
  const fach = (id: string, sem: [number, number][], opts: Partial<BmFachEingabe> = {}): BmFachEingabe => ({
    id,
    gewicht: 1,
    hatPruefung: true,
    promotionsrelevant: true,
    pruefung: null,
    lbs: sem.map(([semester, wert]) => ({ semester, wert, gewicht: 1 })),
    ...opts,
  })
  const stand = berechneBm(
    [
      fach('de', [[1, 4.4], [1, 4.6], [2, 5.2]], { pruefung: 5 }), // S1 4.5, S2 5.0 -> Erf 4.75 -> 5.0; Fach (5+5)/2 = 5
      fach('ma', [[1, 3.0], [2, 3.5]]), // S1 3.0, S2 3.5 -> Erf 3.25 -> 3.5
      fach('gp', [[1, 5.5], [2, 5.5]], { hatPruefung: false }),
      fach('idpa', [[1, 2.0]], { promotionsrelevant: false }),
    ],
    bmRegel,
  )
  assert.equal(stand.faecher[0].erfahrungsnote, 5)
  assert.equal(stand.faecher[0].fachnote, 5)
  assert.equal(stand.faecher[1].prognose, 3.5)
  assert.equal(stand.vorlaeufig, true)
  // Promotion S1: de 4.5, ma 3.0, gp 5.5 (IDPA zählt nicht) -> Schnitt 4.3, 1 ungenügend, Defizit 1.0
  const s1 = stand.promotion.find((p) => p.semester === 1)!.norm
  assert.equal(s1.durchschnitt, 4.3)
  assert.equal(s1.anzahlUngenuegend, 1)
  assert.equal(s1.erfuellt, true)
})
