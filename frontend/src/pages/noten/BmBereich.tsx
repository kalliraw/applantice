import { useState } from 'react'
import type { BmRegel, BmStand, NormPruefung } from '../../lib/noten.ts'
import { benoetigteNote, bmFachnote } from '../../lib/noten.ts'
import type { Fach, Notenregel } from '../../lib/types.ts'
import { Badge, Card } from '../../ui/index.ts'
import { ZIEL_OPTIONEN, bedarfText, fmt, parseNote } from './format.ts'
import { NormListe, type NormEintrag } from './NormListe.tsx'
import s from '../Noten.module.css'

type Props = {
  faecher: Fach[]
  stand: BmStand
  regel: Notenregel
  /** Definitive Prüfungsnoten (DB, neueste je Fach). */
  pruefungReal: Record<string, number>
  simPruefung: Record<string, number>
  istEigen: boolean
  onSavePruefung: (fachId: string, wert: number) => void
  onSimPruefung: (fachId: string, wert: number | null) => void
  onOpen: (fachId: string) => void
}

function normEintraege(norm: NormPruefung, regel: Notenregel, offen: boolean): NormEintrag[] {
  const st = (ok: boolean): NormEintrag['status'] => (offen ? 'offen' : ok ? 'erfuellt' : 'nicht_erfuellt')
  const out: NormEintrag[] = [
    {
      label: 'Durchschnitt',
      wert: fmt(norm.durchschnitt),
      regel: `≥ ${(regel.mindestnote_gesamt ?? 4).toFixed(1)}`,
      status: st(norm.okDurchschnitt),
    },
  ]
  if (regel.max_ungenuegend != null) {
    out.push({
      label: 'Ungenügende Noten',
      wert: String(norm.anzahlUngenuegend),
      regel: `≤ ${regel.max_ungenuegend}`,
      status: st(norm.okUngenuegend),
    })
  }
  if (regel.max_notendefizit != null) {
    out.push({
      label: 'Notendefizit',
      wert: norm.notendefizit.toFixed(1),
      regel: `≤ ${regel.max_notendefizit.toFixed(1)}`,
      status: st(norm.okDefizit),
    })
  }
  return out
}

export function BmBereich({
  faecher,
  stand,
  regel,
  pruefungReal,
  simPruefung,
  istEigen,
  onSavePruefung,
  onSimPruefung,
  onOpen,
}: Props) {
  const [zielFach, setZielFach] = useState('5')
  const zielWert = Number(zielFach)
  const bmRegel = regel as BmRegel
  const semesterSpalten = [1, 2, 3, 4, 5, 6, 7, 8].filter((sem) =>
    stand.faecher.some((f) => f.semesternoten[sem] != null),
  )
  const ohneSemester = stand.faecher.some((f) => f.semesternoten[0] != null)

  return (
    <>
      <Card
        title="BM-Fächer"
        subtitle={`Regeln: ${regel.bezeichnung}. Fachnote = ${Math.round((regel.anteil_pruefung ?? 0.5) * 100)}% Prüfung + Rest Erfahrungsnote (Schnitt der Semesternoten).`}
        actions={
          <label className={s.zielInline}>
            Ziel Fachnote
            <select className={s.lbSmall} value={zielFach} onChange={(e) => setZielFach(e.target.value)}>
              {ZIEL_OPTIONEN.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        }
        style={{ marginBottom: 'var(--sp-4)' }}
      >
        <div className={s.tableWrap}>
          <table className={s.bmTable}>
            <thead>
              <tr>
                <th>Fach</th>
                {semesterSpalten.map((sem) => (
                  <th key={sem} className={s.num}>S{sem}</th>
                ))}
                {ohneSemester && <th className={s.num} title="LBs ohne Semesterangabe">o.S.</th>}
                <th className={s.num}>Erfahrung</th>
                <th className={s.num}>Prüfung</th>
                <th className={s.num}>Simulation</th>
                <th className={s.num}>Fachnote</th>
                <th>Prüfung für Ziel</th>
              </tr>
            </thead>
            <tbody>
              {faecher.map((f) => {
                const e = stand.faecher.find((x) => x.id === f.id)
                if (!e) return null
                const real = pruefungReal[f.id]
                const bedarf =
                  f.hat_abschlusspruefung && real == null && e.erfahrungsnote != null
                    ? benoetigteNote((p) => bmFachnote(e.erfahrungsnote, p, true, bmRegel), zielWert)
                    : null
                return (
                  <tr key={f.id}>
                    <td>
                      <button className={s.bmFachLink} onClick={() => onOpen(f.id)}>
                        {f.name}
                      </button>
                      {f.typ && <div className={s.fachKomp}>{f.typ.replace('BM-', '')}</div>}
                    </td>
                    {semesterSpalten.map((sem) => (
                      <td key={sem} className={s.num}>{fmt(e.semesternoten[sem])}</td>
                    ))}
                    {ohneSemester && <td className={s.num}>{fmt(e.semesternoten[0])}</td>}
                    <td className={s.num}>{fmt(e.erfahrungsnote)}</td>
                    <td className={s.num}>
                      {!f.hat_abschlusspruefung ? (
                        <span className="muted">keine</span>
                      ) : istEigen ? (
                        <input
                          className={s.lbSmall}
                          inputMode="decimal"
                          defaultValue={real != null ? String(real) : ''}
                          onBlur={(ev) => {
                            const w = parseNote(ev.target.value)
                            if (w != null && w !== real) onSavePruefung(f.id, w)
                          }}
                          placeholder="–"
                        />
                      ) : (
                        fmt(real)
                      )}
                    </td>
                    <td className={s.num}>
                      {f.hat_abschlusspruefung && real == null ? (
                        <input
                          key={String(simPruefung[f.id] ?? '')}
                          className={`${s.lbSmall} ${s.simInput}`}
                          inputMode="decimal"
                          defaultValue={simPruefung[f.id] != null ? String(simPruefung[f.id]) : ''}
                          onBlur={(ev) => onSimPruefung(f.id, parseNote(ev.target.value))}
                          placeholder="–"
                        />
                      ) : null}
                    </td>
                    <td className={s.num}>
                      <b>{fmt(e.prognose)}</b>
                      {e.fachnote == null && e.prognose != null && <div className={s.fachKomp}>Prognose</div>}
                    </td>
                    <td>
                      {bedarf ? (
                        <span className={bedarf.status === 'unerreichbar' ? s.zielUnerreichbar : ''}>{bedarfText(bedarf)}</span>
                      ) : (
                        <span className="muted">–</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className={s.zielHinweis}>
          Klick auf ein Fach öffnet die Leistungsbeurteilungen (mit Semester). Ohne Prüfungsnote gilt die
          Erfahrungsnote als Prognose. Simulierte Prüfungsnoten werden nur in diesem Browser gespeichert.
        </div>
      </Card>

      <div className={s.karteGrid}>
        <Card
          title="Bestehen der BM"
          subtitle={stand.vorlaeufig ? 'Vorläufig – noch nicht alle Fachnoten definitiv' : 'Alle Fachnoten definitiv'}
        >
          <NormListe eintraege={normEintraege(stand.bestehen, regel, stand.bestehen.durchschnitt == null)} />
        </Card>
        <Card title="Promotion pro Semester" subtitle="Semesternoten der promotionsrelevanten Fächer (ohne IDAF)">
          {stand.promotion.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>Noch keine Semesternoten mit Semesterangabe.</p>
          ) : (
            <table className={s.bmTable}>
              <thead>
                <tr>
                  <th>Semester</th>
                  <th className={s.num}>Schnitt</th>
                  <th className={s.num}>Ungenügend</th>
                  <th className={s.num}>Defizit</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stand.promotion.map(({ semester, norm }) => (
                  <tr key={semester}>
                    <td>S{semester}</td>
                    <td className={s.num}>{fmt(norm.durchschnitt)}</td>
                    <td className={s.num}>{norm.anzahlUngenuegend}</td>
                    <td className={s.num}>{norm.notendefizit.toFixed(1)}</td>
                    <td>
                      <Badge tone={norm.erfuellt ? 'erledigt' : 'warn'}>{norm.erfuellt ? 'promoviert' : 'gefährdet'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  )
}
