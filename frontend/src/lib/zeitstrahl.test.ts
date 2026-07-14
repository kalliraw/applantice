import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ausbildungsEnde,
  addMonate,
  isoWoche,
  isoWochenJahr,
  positionAnteil,
  semesterBloecke,
  semesterVon,
  snapAufWoche,
  toIsoDatum,
} from './zeitstrahl.ts'

const start = new Date('2024-08-01T00:00:00')

test('semesterBloecke: 8 Blöcke, Lehrjahr-Zuordnung, Start passt', () => {
  const b = semesterBloecke(start)
  assert.equal(b.length, 8)
  assert.equal(b[0].nr, 1)
  assert.equal(b[0].lehrjahr, 1)
  assert.equal(b[1].lehrjahr, 1)
  assert.equal(b[2].lehrjahr, 2)
  assert.equal(b[7].lehrjahr, 4)
  assert.equal(b[0].von.getTime(), start.getTime())
  // Semester 2 beginnt 6 Monate nach Start (Feb 2025).
  assert.equal(b[1].von.getMonth(), 1) // Februar
})

test('ausbildungsEnde = Start + 4 Jahre', () => {
  const ende = ausbildungsEnde(start)
  assert.equal(ende.getFullYear(), 2028)
  assert.equal(ende.getMonth(), 7) // August
})

test('semesterVon ordnet Datum dem richtigen Semester zu', () => {
  assert.equal(semesterVon(new Date('2024-08-01'), start), 1)
  assert.equal(semesterVon(new Date('2025-01-31'), start), 1)
  assert.equal(semesterVon(new Date('2025-02-01'), start), 2)
  assert.equal(semesterVon(new Date('2026-07-14'), start), 4)
  assert.equal(semesterVon(new Date('2023-01-01'), start), null) // vor Start
  assert.equal(semesterVon(new Date('2030-01-01'), start), null) // nach Ende
})

test('positionAnteil ist 0 am Start, 1 am Ende, ~mitte dazwischen', () => {
  const ende = ausbildungsEnde(start)
  assert.equal(positionAnteil(start, start, ende), 0)
  assert.equal(positionAnteil(ende, start, ende), 1)
  const mitte = addMonate(start, 24)
  assert.ok(Math.abs(positionAnteil(mitte, start, ende) - 0.5) < 0.02)
  // Ausserhalb wird geklemmt.
  assert.equal(positionAnteil(new Date('2020-01-01'), start, ende), 0)
})

test('snapAufWoche rundet auf nächsten Montag', () => {
  // 2024-08-01 ist Donnerstag -> Montag dieser Woche (2024-07-29).
  assert.equal(toIsoDatum(snapAufWoche(new Date('2024-08-01T00:00:00'))), '2024-07-29')
  // 2024-08-02 ist Freitag -> nächster Montag (2024-08-05).
  assert.equal(toIsoDatum(snapAufWoche(new Date('2024-08-02T00:00:00'))), '2024-08-05')
  // Ein Montag bleibt unverändert.
  assert.equal(toIsoDatum(snapAufWoche(new Date('2024-07-29T00:00:00'))), '2024-07-29')
})

test('isoWoche / isoWochenJahr nach ISO-8601', () => {
  assert.equal(isoWoche(new Date('2024-01-01')), 1) // Montag -> KW1
  assert.equal(isoWoche(new Date('2026-01-01')), 1) // Donnerstag -> KW1
  assert.equal(isoWoche(new Date('2024-08-01')), 31)
  // 2021-01-01 ist Freitag -> gehört noch zu KW53/2020.
  assert.equal(isoWoche(new Date('2021-01-01')), 53)
  assert.equal(isoWochenJahr(new Date('2021-01-01')), 2020)
})
