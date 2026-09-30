import { useState } from 'react'
import type { Bedingung } from '../../lib/noten.ts'
import { benoetigteNote } from '../../lib/noten.ts'
import { Card } from '../../ui/index.ts'
import { bedarfText, fmt, parseNote } from './format.ts'
import { NormListe } from './NormListe.tsx'
import s from '../Noten.module.css'

const ZIELE_GESAMT = [4, 4.5, 5, 5.3, 5.5, 6].map((z) => ({ value: String(z), label: z.toFixed(1) }))

type Props = {
  bedingungen: Bedingung[]
  /** Definitive IPA-Note (DB) – ist sie da, entfällt der IPA-Bedarf. */
  ipaReal: number | null
  ipaMindest: number | null
  simIpa: number | null
  onSimIpa: (wert: number | null) => void
  /** Gesamtnote für eine angenommene IPA-Note (gleiche Logik wie die Anzeige). */
  gesamtMitIpa: (ipa: number) => number | null
  quelle: string | null
}

export function EfzZielKarte({ bedingungen, ipaReal, ipaMindest, simIpa, onSimIpa, gesamtMitIpa, quelle }: Props) {
  const [ziel, setZiel] = useState('5')
  const zielWert = Number(ziel)
  const bedarf = benoetigteNote(gesamtMitIpa, zielWert)
  // Zum Bestehen muss die IPA selbst die Fallnote erreichen – unabhängig vom Gesamtziel.
  const mitFallnote =
    bedarf.status === 'unerreichbar' || ipaMindest == null
      ? bedarf
      : { status: 'moeglich' as const, note: Math.max(ipaMindest, bedarf.status === 'moeglich' ? bedarf.note : 1) }

  return (
    <Card
      title="Bestehen & Ziel"
      subtitle={quelle ? `Regeln: ${quelle}` : undefined}
      style={{ marginBottom: 'var(--sp-4)' }}
    >
      <NormListe
        eintraege={bedingungen.map((b) => ({
          label: b.label,
          wert: fmt(b.wert),
          regel: `≥ ${b.mindest.toFixed(1)}`,
          status: b.status,
        }))}
      />
      {ipaReal == null && (
        <div className={s.zielBox}>
          <div className={s.zielTitel}>Welche IPA-Note brauche ich?</div>
          <div className={s.zielZeile}>
            <label>
              Ziel Gesamtnote
              <select className={s.lbSmall} value={ziel} onChange={(e) => setZiel(e.target.value)}>
                {ZIELE_GESAMT.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label>
              IPA simulieren
              <input
                key={String(simIpa)}
                className={s.lbSmall}
                inputMode="decimal"
                defaultValue={simIpa != null ? String(simIpa) : ''}
                onBlur={(e) => onSimIpa(parseNote(e.target.value))}
                placeholder="–"
              />
            </label>
          </div>
          <div className={`${s.zielErgebnis} ${mitFallnote.status === 'unerreichbar' ? s.zielUnerreichbar : ''}`}>
            IPA für Gesamtnote {zielWert.toFixed(1)}: <b>{bedarfText(mitFallnote)}</b>
            {ipaMindest != null && mitFallnote.status === 'moeglich' && mitFallnote.note === ipaMindest && (
              <> (Fallnote IPA ≥ {ipaMindest.toFixed(1)})</>
            )}
          </div>
          <div className={s.zielHinweis}>
            Basiert auf dem aktuellen Stand; noch fehlende Teilnoten werden ausgelassen. Die simulierte IPA-Note
            wird nur in diesem Browser gespeichert.
          </div>
        </div>
      )}
    </Card>
  )
}
