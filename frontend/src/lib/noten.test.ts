import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Notenkomponente } from './noten.ts'
import type { FachZeile, NotenkomponenteZeile } from './noten.ts'
import {
  baueBaum,
  berechneGesamt,
  berechneKomponente,
  berechneNotenstand,
  gewichteterMittelwert,
  modulnote,
  modulStatus,
  rundeAufHalbe,
  rundeAufZehntel,
} from './noten.ts'

// EFZ-Komponentenbaum wie er aus der DB (notenkomponente) käme.
// Gewichte = Daten (BiVo-Formel), hier nur zum Testen als Literal nachgebaut.
const efz: Notenkomponente[] = [
  { code: 'IPA', name: 'Praktische Arbeit (IPA)', gewicht: 0.4 },
  {
    code: 'INFORMATIK',
    name: 'Informatikkompetenzen',
    gewicht: 0.3,
    kinder: [
      { code: 'INFORMATIK_BFS', name: 'Berufsfachschule', gewicht: 0.8 },
      { code: 'INFORMATIK_UEK', name: 'überbetriebliche Kurse', gewicht: 0.2 },
    ],
  },
  { code: 'ABU', name: 'Allgemeinbildung', gewicht: 0.2 },
  { code: 'EGK', name: 'Erweiterte Grundkompetenzen', gewicht: 0.1 },
]

test('gewichteter Mittelwert ignoriert fehlende Werte', () => {
  assert.equal(
    gewichteterMittelwert([
      { wert: 5, gewicht: 0.8 },
      { wert: null, gewicht: 0.2 },
    ]),
    5,
  )
  assert.equal(gewichteterMittelwert([]), null)
  assert.equal(gewichteterMittelwert([{ wert: null, gewicht: 1 }]), null)
})

test('Informatikkompetenzen = BFS 80% + ÜK 20%', () => {
  const wert = berechneKomponente(efz[1], {
    INFORMATIK_BFS: 5.0,
    INFORMATIK_UEK: 5.5,
  })
  assert.equal(wert, 5.1) // 5.0*0.8 + 5.5*0.2
})

test('EFZ-Gesamtnote nach BiVo-Formel', () => {
  const werte = {
    IPA: 5.0,
    INFORMATIK_BFS: 5.0,
    INFORMATIK_UEK: 5.5,
    ABU: 4.5,
    EGK: 5.0,
  }
  const gesamt = berechneGesamt(efz, werte)
  assert.ok(gesamt !== null)
  // 5.0*.4 + 5.1*.3 + 4.5*.2 + 5.0*.1 = 4.93
  assert.ok(Math.abs(gesamt! - 4.93) < 1e-9)
  assert.equal(rundeAufZehntel(gesamt!), 4.9)
})

test('Zwischenstand: fehlende Komponenten werden ausgelassen', () => {
  // Nur ABU vorhanden -> Gesamt entspricht ABU (einzige gewichtete Komponente).
  const gesamt = berechneGesamt(efz, { ABU: 4.0 })
  assert.equal(gesamt, 4.0)
})

test('Rundungen', () => {
  assert.equal(rundeAufZehntel(4.93), 4.9)
  assert.equal(rundeAufZehntel(4.95), 5.0)
  assert.equal(rundeAufHalbe(5.24), 5.0)
  assert.equal(rundeAufHalbe(5.25), 5.5)
})

test('modulnote gewichtet LBs (VA zählt mehr)', () => {
  // Zwei Prüfungen (Gewicht 1) + Vertiefungsarbeit (Gewicht 2).
  const n = modulnote([
    { wert: 5.0, gewicht: 1 },
    { wert: 4.0, gewicht: 1 },
    { wert: 5.5, gewicht: 2 },
  ])
  assert.ok(n !== null)
  // (5*1 + 4*1 + 5.5*2) / 4 = 5.0
  assert.equal(rundeAufZehntel(n!), 5.0)
  assert.equal(modulnote([]), null)
})

test('modulStatus prüft Gewichtssumme = 100%', () => {
  assert.equal(modulStatus([]), 'leer')
  assert.equal(modulStatus([{ gewicht: 20 }, { gewicht: 20 }, { gewicht: 60 }]), 'abgeschlossen')
  assert.equal(modulStatus([{ gewicht: 20 }, { gewicht: 20 }]), 'begonnen')
  assert.equal(modulStatus([{ gewicht: 100 }]), 'abgeschlossen')
})

// notenkomponente-Zeilen wie aus der DB (flach, mit parent_id + Dispensations-Flag).
const kompZeilen: NotenkomponenteZeile[] = [
  { id: 'ipa', code: 'IPA', name: 'IPA', kontext: 'EFZ', parent_id: null, gewicht: 0.4, entfaellt_bei_bm: false },
  { id: 'inf', code: 'INFORMATIK', name: 'Informatik', kontext: 'EFZ', parent_id: null, gewicht: 0.3, entfaellt_bei_bm: false },
  { id: 'bfs', code: 'INFORMATIK_BFS', name: 'BFS', kontext: 'EFZ', parent_id: 'inf', gewicht: 0.8, entfaellt_bei_bm: false },
  { id: 'uek', code: 'INFORMATIK_UEK', name: 'ÜK', kontext: 'EFZ', parent_id: 'inf', gewicht: 0.2, entfaellt_bei_bm: false },
  { id: 'abu', code: 'ABU', name: 'ABU', kontext: 'EFZ', parent_id: null, gewicht: 0.2, entfaellt_bei_bm: true },
  { id: 'egk', code: 'EGK', name: 'EGK', kontext: 'EFZ', parent_id: null, gewicht: 0.1, entfaellt_bei_bm: true },
]
const fachZeilen: FachZeile[] = [
  { id: 'm1', kontext: 'EFZ', notenkomponente_id: 'bfs', gewicht: 1 },
  { id: 'abu1', kontext: 'EFZ', notenkomponente_id: 'abu', gewicht: 1 },
]

test('berechneNotenstand: IPA (Einzelnote) + Modul-Aggregation', () => {
  const { total } = berechneNotenstand(
    kompZeilen,
    fachZeilen,
    { m1: [{ wert: 5.0, gewicht: 100 }], abu1: [{ wert: 4.0, gewicht: 100 }] },
    5.0, // IPA
    'EFZ',
    false,
  )
  assert.ok(total !== null)
  // IPA=5.0, Informatik=5.0 (nur BFS erfasst, ÜK fehlt), ABU=4.0, EGK fehlt.
  // (5*.4 + 5*.3 + 4*.2) / (.4+.3+.2) = 4.3 / .9 = 4.777… -> 4.8
  assert.equal(rundeAufZehntel(total!), 4.8)
})

test('berechneNotenstand: machtBM dispensiert ABU/EGK aus der EFZ-Note', () => {
  const r = berechneNotenstand(kompZeilen, fachZeilen, { m1: [{ wert: 5.0, gewicht: 100 }] }, 5.0, 'EFZ', true)
  assert.deepEqual(r.dispensiertIds.sort(), ['abu', 'egk'])
  // Nur IPA + Informatik(BFS) bleiben; ABU-Fach ist dispensiert.
  assert.equal(rundeAufZehntel(r.total!), 5.0)
})

test('baueBaum verschachtelt Informatik-Unterkomponenten korrekt', () => {
  const roots = baueBaum([
    { id: '1', code: 'IPA', name: 'IPA', gewicht: 0.4, parent_id: null },
    { id: '2', code: 'INFORMATIK', name: 'Info', gewicht: 0.3, parent_id: null },
    { id: '3', code: 'INFORMATIK_BFS', name: 'BFS', gewicht: 0.8, parent_id: '2' },
    { id: '4', code: 'INFORMATIK_UEK', name: 'ÜK', gewicht: 0.2, parent_id: '2' },
  ])
  assert.equal(roots.length, 2)
  const info = roots.find((r) => r.code === 'INFORMATIK')!
  assert.equal(info.kinder?.length, 2)
  const ipa = roots.find((r) => r.code === 'IPA')!
  assert.equal(ipa.kinder, undefined) // Blatt
  // Ergebnis über den gebauten Baum entspricht der BiVo-Rechnung.
  const gesamt = berechneGesamt(roots, {
    IPA: 5.0,
    INFORMATIK_BFS: 5.0,
    INFORMATIK_UEK: 5.5,
  })
  assert.ok(gesamt !== null)
})
