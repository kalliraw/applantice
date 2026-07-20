import { jsPDF } from 'jspdf'
import type { BerichtKennzahlen } from './types.ts'

export type BerichtPdfDaten = {
  typLabel: string
  semester: number | null
  datum: string
  lernendeName: string
  felder: { label: string; text: string }[]
  kennzahlen: Partial<BerichtKennzahlen>
}

const note = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(1))

/**
 * Erzeugt aus den Bericht-Daten ein textbasiertes PDF (crisp, ohne DOM-Screenshot)
 * und gibt die reine Base64-Nutzlast zurück (für Graph-Anhang `contentBytes`).
 */
export function berichtPdfBase64(d: BerichtPdfDaten): string {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const M = 48
  const W = doc.internal.pageSize.getWidth()
  const Hgt = doc.internal.pageSize.getHeight()
  const maxW = W - 2 * M
  let y = M

  const seitenumbruch = (brauch: number) => {
    if (y + brauch > Hgt - M) {
      doc.addPage()
      y = M
    }
  }
  const absatz = (text: string, { size = 10, style = 'normal', color = 40, gapNach = 6, lh = 1.35 } = {}) => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    doc.setTextColor(color)
    const zeilen = doc.splitTextToSize(text || '', maxW)
    const zh = size * lh
    for (const z of zeilen) {
      seitenumbruch(zh)
      doc.text(z, M, y)
      y += zh
    }
    y += gapNach
  }
  const linie = () => {
    seitenumbruch(12)
    doc.setDrawColor(220)
    doc.line(M, y, W - M, y)
    y += 14
  }

  // Kopf
  absatz('Bildungsbericht', { size: 18, style: 'bold', color: 30, gapNach: 2 })
  absatz(`${d.typLabel}${d.semester != null ? ` · Semester ${d.semester}` : ''}`, { size: 11, color: 90, gapNach: 10 })
  absatz(`Lernende(r): ${d.lernendeName}`, { size: 10, gapNach: 2 })
  absatz(`Datum: ${d.datum}`, { size: 10, gapNach: 8 })
  linie()

  // Ausbildungsstand (Kennzahlen)
  const k = d.kennzahlen || {}
  absatz('Ausbildungsstand bei Abschluss', { size: 12, style: 'bold', color: 30, gapNach: 6 })
  absatz(`Handlungskompetenzen erledigt: ${k.hkErledigt ?? 0} / ${k.hkTotal ?? 0}`, { size: 10, gapNach: 2 })
  absatz(`Leistungsziele selbstständig: ${k.lzSelbststaendig ?? 0} / ${k.lzTotal ?? 0}`, { size: 10, gapNach: 2 })
  absatz(`Vornote EFZ: ${note(k.vornoteEfz)}${k.machtBm ? `   ·   Vornote BM: ${note(k.vornoteBm)}` : ''}`, { size: 10, gapNach: 10 })
  linie()

  // Inhaltliche Felder
  for (const f of d.felder) {
    absatz(f.label, { size: 11, style: 'bold', color: 40, gapNach: 3 })
    absatz(f.text?.trim() ? f.text : 'keine Angabe', { size: 10, color: f.text?.trim() ? 40 : 150, gapNach: 12 })
  }

  // Unterschrift
  seitenumbruch(70)
  y = Math.max(y, Hgt - M - 60)
  linie()
  absatz('Unterschrift Berufsbildner/in: ______________________________', { size: 10, color: 90, gapNach: 2 })
  absatz('Unterschrift Lernende(r): ______________________________', { size: 10, color: 90, gapNach: 0 })

  // 'datauristring' -> "data:application/pdf;...;base64,XXXX" -> nur die Nutzlast.
  const uri = doc.output('datauristring')
  return uri.slice(uri.indexOf(',') + 1)
}
