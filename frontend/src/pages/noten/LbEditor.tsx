import { useState } from 'react'
import type { Fach, Leistungsbeurteilung, NotenKontext } from '../../lib/types.ts'
import type { Rundung } from '../../lib/noten.ts'
import { benoetigteNote, gewichtSumme, modulnote, runde } from '../../lib/noten.ts'
import { Badge, Button, Modal } from '../../ui/index.ts'
import type { SimLb } from './simulation.ts'
import { SEMESTER_OPTIONEN, ZIEL_OPTIONEN, bedarfText, fmt, fmtGerundet, parseNote } from './format.ts'
import s from '../Noten.module.css'

type LbFelder = { titel: string; gewicht: number; wert: number; semester: number | null }

type Props = {
  fach: Fach
  kontext: NotenKontext
  lbs: Leistungsbeurteilung[]
  simLbs: SimLb[]
  /** Rundung der Modulnote (EFZ) bzw. Semesternote (BM) aus den Daten. */
  rundung: Rundung
  /** Vorschlag für das Semester neuer LBs (aus dem Ausbildungsstart). */
  aktuellesSemester: number | null
  istEigen: boolean
  onClose: () => void
  onAdd: (felder: LbFelder) => void | Promise<void>
  onUpdate: (id: string, patch: Partial<LbFelder>) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
  onSimAdd: (lb: Omit<SimLb, 'id'>) => void
  onSimRemove: (id: string) => void
}

const parseGewicht = (str: string) => {
  const g = Number(str.replace(',', '.'))
  return Number.isFinite(g) && g > 0 ? g : null
}

export function LbEditor({
  fach,
  kontext,
  lbs,
  simLbs,
  rundung,
  aktuellesSemester,
  istEigen,
  onClose,
  onAdd,
  onUpdate,
  onDelete,
  onSimAdd,
  onSimRemove,
}: Props) {
  const istBm = kontext === 'BM'
  const [titel, setTitel] = useState('')
  const [gewicht, setGewicht] = useState('')
  const [note, setNote] = useState('')
  const [semester, setSemester] = useState(aktuellesSemester != null ? String(aktuellesSemester) : '')

  // Zielnote: EFZ = Modulnote, BM = Semesternote des gewählten Semesters.
  const [ziel, setZiel] = useState('5')
  const [zielSemester, setZielSemester] = useState(aktuellesSemester != null ? String(aktuellesSemester) : '')

  const alle = [...lbs, ...simLbs]
  const summe = gewichtSumme(lbs)
  const summeMitSim = gewichtSumme(alle)
  const vollstaendig = lbs.length === 0 || Math.abs(summe - 100) < 0.01
  const modn = modulnote(lbs)
  const modnSim = modulnote(alle)

  const basis = istBm ? alle.filter((l) => String(l.semester ?? '') === zielSemester) : alle
  const restGewicht = 100 - gewichtSumme(basis)
  const [naechstesGewicht, setNaechstesGewicht] = useState('')
  const wNaechste =
    parseGewicht(naechstesGewicht) ?? (istBm ? 1 : restGewicht > 0 ? Math.round(restGewicht * 100) / 100 : 20)
  const zielWert = Number(ziel)
  const bedarf = benoetigteNote(
    (x) => {
      const n = modulnote([...basis, { wert: x, gewicht: wNaechste }])
      return n == null ? null : runde(n, rundung)
    },
    zielWert,
  )

  function hinzufuegen(simuliert: boolean) {
    const w = parseNote(note)
    const g = parseGewicht(gewicht)
    if (w == null || g == null) return
    const felder = {
      titel: titel.trim() || (simuliert ? 'Geplante LB' : `LB ${lbs.length + 1}`),
      gewicht: g,
      wert: w,
      semester: semester ? Number(semester) : null,
    }
    if (simuliert) onSimAdd(felder)
    else void onAdd(felder)
    setTitel('')
    setGewicht('')
    setNote('')
  }

  return (
    <Modal open onClose={onClose} title={fach.name} footer={<Button variant="secondary" onClick={onClose}>Schliessen</Button>}>
      <div className={s.lbHeadChip}>
        <span className={`${s.modulChip} ${fach.modul_nr ? '' : s.modulChipLeer}`}>
          {fach.modul_nr ? `Modul ${fach.modul_nr}` : istBm ? 'BM-Fach' : 'kein Modul'}
        </span>
      </div>

      <table className={s.lbTable}>
        <thead>
          <tr>
            <th>Leistungsbeurteilung</th>
            <th style={{ width: 64 }}>Sem.</th>
            <th style={{ width: 80 }}>Gewicht{istBm ? '' : ' %'}</th>
            <th style={{ width: 80 }}>Note</th>
            <th style={{ width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {lbs.map((l) => (
            <tr key={l.id}>
              <td>
                {istEigen ? (
                  <input className={s.lbTitel} defaultValue={l.titel} onBlur={(e) => void onUpdate(l.id, { titel: e.target.value.trim() || l.titel })} />
                ) : (
                  l.titel
                )}
              </td>
              <td>
                {istEigen ? (
                  <select
                    className={s.lbSmall}
                    defaultValue={l.semester != null ? String(l.semester) : ''}
                    onChange={(e) => void onUpdate(l.id, { semester: e.target.value ? Number(e.target.value) : null })}
                  >
                    {SEMESTER_OPTIONEN.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : l.semester != null ? (
                  `S${l.semester}`
                ) : (
                  '–'
                )}
              </td>
              <td>
                {istEigen ? (
                  <input className={s.lbSmall} inputMode="decimal" defaultValue={String(l.gewicht)}
                    onBlur={(e) => { const g = parseGewicht(e.target.value); if (g != null) void onUpdate(l.id, { gewicht: g }) }} />
                ) : (
                  l.gewicht
                )}
              </td>
              <td>
                {istEigen ? (
                  <input className={s.lbSmall} inputMode="decimal" defaultValue={String(l.wert)}
                    onBlur={(e) => { const w = parseNote(e.target.value); if (w != null) void onUpdate(l.id, { wert: w }) }} />
                ) : (
                  l.wert.toFixed(1)
                )}
              </td>
              <td>
                {istEigen && (
                  <button className={s.lbDel} onClick={() => void onDelete(l.id)} aria-label="Löschen">
                    <XIcon />
                  </button>
                )}
              </td>
            </tr>
          ))}
          {simLbs.map((l) => (
            <tr key={l.id} className={s.simZeile}>
              <td>
                {l.titel} <Badge tone="warn">geplant</Badge>
              </td>
              <td>{l.semester != null ? `S${l.semester}` : '–'}</td>
              <td>{l.gewicht}</td>
              <td>{l.wert.toFixed(1)}</td>
              <td>
                <button className={s.lbDel} onClick={() => onSimRemove(l.id)} aria-label="Geplante LB entfernen">
                  <XIcon />
                </button>
              </td>
            </tr>
          ))}
          {lbs.length === 0 && simLbs.length === 0 && (
            <tr>
              <td colSpan={5} className="muted" style={{ padding: 'var(--sp-3) var(--sp-2)' }}>
                Noch keine Leistungsbeurteilungen erfasst.
              </td>
            </tr>
          )}
          <tr>
            <td><input className={s.lbTitel} placeholder="z.B. Prüfung 1 / VA" value={titel} onChange={(e) => setTitel(e.target.value)} /></td>
            <td>
              <select className={s.lbSmall} value={semester} onChange={(e) => setSemester(e.target.value)}>
                {SEMESTER_OPTIONEN.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </td>
            <td><input className={s.lbSmall} inputMode="decimal" value={gewicht} onChange={(e) => setGewicht(e.target.value)} placeholder={istBm ? '1' : '%'} /></td>
            <td><input className={s.lbSmall} inputMode="decimal" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" /></td>
            <td />
          </tr>
        </tbody>
      </table>
      <div className={s.lbAktionen}>
        {istEigen && (
          <Button size="sm" variant="secondary" onClick={() => hinzufuegen(false)}>+ Note erfassen</Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => hinzufuegen(true)}>+ Als geplante LB simulieren</Button>
      </div>

      <div className={s.lbFoot}>
        <span className={`${s.lbSumme} ${!vollstaendig ? s.lbSummeFehler : ''}`}>
          Summe Gewichte: {summe}
          {istBm ? '' : '%'}
          {simLbs.length > 0 && ` (mit geplanten ${summeMitSim}${istBm ? '' : '%'})`}
        </span>
        <span className={s.lbModulnote}>
          {istBm ? 'Schnitt' : 'Modulnote'}:<b>{fmtGerundet(modn, rundung)}</b>
          {modn != null && rundung && <span className={s.exakt}>({fmt(modn)})</span>}
          {simLbs.length > 0 && (
            <>
              <span className={s.pfeil}>→</span>
              <b className={s.simWert}>{fmtGerundet(modnSim, rundung)}</b>
            </>
          )}
        </span>
      </div>
      {!istBm && lbs.length > 0 && !vollstaendig && (
        <div className={s.lbWarn}>
          Die Gewichte ergeben {summe}% statt 100 % – das Modul gilt als begonnen, aber nicht abgeschlossen.
        </div>
      )}

      <div className={s.zielBox}>
        <div className={s.zielTitel}>Welche Note brauche ich?</div>
        <div className={s.zielZeile}>
          <label>
            Ziel {istBm ? 'Semesternote' : 'Modulnote'}
            <select className={s.lbSmall} value={ziel} onChange={(e) => setZiel(e.target.value)}>
              {ZIEL_OPTIONEN.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          {istBm && (
            <label>
              im Semester
              <select className={s.lbSmall} value={zielSemester} onChange={(e) => setZielSemester(e.target.value)}>
                {SEMESTER_OPTIONEN.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            Gewicht nächste LB
            <input
              className={s.lbSmall}
              inputMode="decimal"
              value={naechstesGewicht}
              onChange={(e) => setNaechstesGewicht(e.target.value)}
              placeholder={String(wNaechste)}
            />
          </label>
        </div>
        <div className={`${s.zielErgebnis} ${bedarf.status === 'unerreichbar' ? s.zielUnerreichbar : ''}`}>
          {bedarf.status === 'moeglich' && (
            <>Nächste LB: <b>{bedarfText(bedarf)}</b> für eine {istBm ? 'Semesternote' : 'Modulnote'} von {zielWert.toFixed(1)}</>
          )}
          {bedarf.status === 'erreicht' && <>Ziel {zielWert.toFixed(1)} ist schon sicher – auch mit einer 1.0 in der nächsten LB.</>}
          {bedarf.status === 'unerreichbar' && (
            <>Mit einer LB dieses Gewichts {bedarfText(bedarf)} – mehr Gewicht oder weitere LBs nötig.</>
          )}
        </div>
        <div className={s.zielHinweis}>
          Berücksichtigt erfasste und geplante LBs{rundung === 'halbe' ? ' sowie die Rundung auf halbe Noten' : ''}.
          Geplante LBs sind eine Simulation und werden nur in diesem Browser gespeichert.
        </div>
      </div>
    </Modal>
  )
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
