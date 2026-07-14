import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.ts'
import { useAuth } from '../auth/AuthContext.tsx'
import { useLernende } from '../lib/LernendenContext.tsx'
import type { Fach, Leistungsbeurteilung, Note, Notenkomponente, NotenKontext } from '../lib/types.ts'
import {
  berechneKomponente,
  berechneNotenstand,
  gewichtSumme,
  modulnote,
  modulStatus,
  rundeAufZehntel,
} from '../lib/noten.ts'
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Spinner, Tabs } from '../ui/index.ts'
import { LernendeAuswahl } from '../components/LernendeAuswahl.tsx'
import s from './Noten.module.css'

function parseNote(str: string | undefined | null): number | null {
  if (str == null || str === '') return null
  const n = Number(String(str).replace(',', '.'))
  return Number.isFinite(n) && n >= 1 && n <= 6 ? n : null
}
const fmt = (v: number | null) => (v == null ? '—' : rundeAufZehntel(v).toFixed(1))
const lbWerte = (lbs: Leistungsbeurteilung[]) => lbs.map((l) => ({ wert: l.wert, gewicht: l.gewicht }))

// Kurze Labels für die Ergebnis-Leiste (kompakt, kein Umbruch/Scrollen).
const KURZ: Record<string, string> = {
  IPA: 'IPA',
  INFORMATIK: 'Informatik',
  ABU: 'ABU',
  EGK: 'EGK',
  BM_FACHNOTE: 'BM-Fächer',
  BM_IDPA: 'IDPA',
}
const kurzName = (code: string, name: string) => KURZ[code] ?? name

export function NotenPage() {
  const { profil } = useAuth()
  const { aktiv, aktivId, istBB, patchLernende } = useLernende()
  const istEigen = !!aktiv && !!profil && aktiv.id === profil.id
  const machtBM = !!aktiv?.macht_bm

  async function toggleBM(v: boolean) {
    if (!aktiv) return
    patchLernende(aktiv.id, { macht_bm: v })
    await supabase.from('benutzer').update({ macht_bm: v }).eq('id', aktiv.id)
  }

  const [faecher, setFaecher] = useState<Fach[]>([])
  const [komponenten, setKomponenten] = useState<Notenkomponente[]>([])
  const [lbsByFach, setLbsByFach] = useState<Record<string, Leistungsbeurteilung[]>>({})
  const [ipaWert, setIpaWert] = useState<string>('')
  const [kontext, setKontext] = useState<NotenKontext>('EFZ')
  const [detailFachId, setDetailFachId] = useState<string | null>(null)
  const [suche, setSuche] = useState('')
  const [ladt, setLadt] = useState(true)

  const ipaKomp = komponenten.find((k) => k.code === 'IPA')

  useEffect(() => {
    void (async () => {
      const [f, k] = await Promise.all([
        supabase.from('fach').select('*').eq('aktiv', true).order('sortierung'),
        supabase.from('notenkomponente').select('*').order('sortierung'),
      ])
      setFaecher((f.data as Fach[]) ?? [])
      setKomponenten((k.data as Notenkomponente[]) ?? [])
      setLadt(false)
    })()
  }, [])

  useEffect(() => {
    if (!aktivId) {
      setLbsByFach({})
      setIpaWert('')
      return
    }
    void (async () => {
      const [lb, note] = await Promise.all([
        supabase.from('leistungsbeurteilung').select('*').eq('benutzer_id', aktivId).order('datum'),
        supabase.from('note').select('*').eq('benutzer_id', aktivId).not('notenkomponente_id', 'is', null).order('erfasst_am'),
      ])
      const byFach: Record<string, Leistungsbeurteilung[]> = {}
      for (const l of (lb.data as Leistungsbeurteilung[]) ?? []) (byFach[l.fach_id] ??= []).push(l)
      setLbsByFach(byFach)
      let ipa = ''
      for (const n of (note.data as Note[]) ?? []) if (n.notenkomponente_id === ipaKomp?.id) ipa = String(n.wert)
      setIpaWert(ipa)
    })()
    // ipaKomp?.id stabil nach Laden der Komponenten
  }, [aktivId, ipaKomp?.id])

  // ---- Berechnung (live) ----
  const { roots, blatt, total, dispensiert } = useMemo(() => {
    const r = berechneNotenstand(komponenten, faecher, lbsByFach, parseNote(ipaWert), kontext, machtBM)
    return { roots: r.roots, blatt: r.blatt, total: r.total, dispensiert: new Set(r.dispensiertIds) }
  }, [komponenten, faecher, lbsByFach, ipaWert, kontext, machtBM])

  // ---- LB-Mutationen ----
  async function addLb(fachId: string, felder: { titel: string; gewicht: number; wert: number }) {
    if (!istEigen || !aktivId) return
    const { data } = await supabase
      .from('leistungsbeurteilung')
      .insert({ benutzer_id: aktivId, fach_id: fachId, ...felder })
      .select()
      .single()
    if (data) setLbsByFach((c) => ({ ...c, [fachId]: [...(c[fachId] ?? []), data as Leistungsbeurteilung] }))
  }
  async function updateLb(id: string, fachId: string, patch: Partial<Pick<Leistungsbeurteilung, 'titel' | 'gewicht' | 'wert'>>) {
    if (!istEigen) return
    setLbsByFach((c) => ({ ...c, [fachId]: (c[fachId] ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)) }))
    await supabase.from('leistungsbeurteilung').update(patch).eq('id', id)
  }
  async function deleteLb(id: string, fachId: string) {
    if (!istEigen) return
    setLbsByFach((c) => ({ ...c, [fachId]: (c[fachId] ?? []).filter((l) => l.id !== id) }))
    await supabase.from('leistungsbeurteilung').delete().eq('id', id)
  }
  async function saveIpa(str: string) {
    const wert = parseNote(str)
    if (!istEigen || !aktivId || !ipaKomp || wert == null) return
    await supabase.from('note').insert({ benutzer_id: aktivId, notenkomponente_id: ipaKomp.id, wert, art: 'ipa' })
  }

  if (ladt) return <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}><Spinner /></div>

  const alleKontext = komponenten.filter((k) => k.kontext === kontext)
  const hatKinder = new Set(alleKontext.filter((k) => k.parent_id).map((k) => k.parent_id))
  const q = suche.trim().toLowerCase()
  const trifft = (f: Fach) =>
    !q ||
    (f.modul_nr ?? '').toLowerCase().includes(q) ||
    f.name.toLowerCase().includes(q) ||
    (f.typ ?? '').toLowerCase().includes(q)
  const gruppen = alleKontext
    .filter((k) => !hatKinder.has(k.id) && k.code !== 'IPA')
    .map((k) => ({ komp: k, faecher: faecher.filter((f) => f.kontext === kontext && f.notenkomponente_id === k.id && trifft(f)) }))
    .filter((g) => g.faecher.length > 0)

  const detailFach = detailFachId ? faecher.find((f) => f.id === detailFachId) ?? null : null

  return (
    <div>
      <PageHeader
        eyebrow="Qualifikationsverfahren"
        title="Notenrechner"
        description="Pro Modul mehrere Leistungsbeurteilungen mit eigener Gewichtung. Klick auf ein Modul öffnet die Detailerfassung. Gewichte kommen aus den Daten, die EFZ-Note wird live nach BiVo berechnet."
        actions={<LernendeAuswahl />}
      />

      {aktivId && istBB ? (
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--sp-2)',
            marginBottom: 'var(--sp-4)',
            fontSize: '0.9rem',
            color: 'var(--text-2)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={machtBM}
            onChange={(e) => void toggleBM(e.target.checked)}
            style={{ accentColor: 'var(--accent-solid-1)', width: 16, height: 16 }}
          />
          Macht Berufsmaturität (BM) – allgemeinbildende Fächer in der EFZ-Note dispensieren
        </label>
      ) : (
        machtBM && (
          <p style={{ marginBottom: 'var(--sp-4)' }}>
            <Badge tone="accent">Berufsmaturität</Badge>{' '}
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              allgemeinbildende Fächer sind in der EFZ-Note dispensiert.
            </span>
          </p>
        )
      )}

      <div style={{ marginBottom: 'var(--sp-5)' }}>
        <Tabs
          tabs={[{ id: 'EFZ', label: 'EFZ' }, { id: 'BM', label: 'Berufsmaturität' }]}
          active={kontext}
          onChange={(id) => setKontext(id as NotenKontext)}
        />
      </div>

      {!aktivId ? (
        <EmptyState title="Kein Lernender ausgewählt" text="Bitte oben eine lernende Person wählen." />
      ) : (
        <>
          <div className={s.suche}>
            <svg className={s.sucheIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              className={s.sucheInput}
              placeholder="Suche nach Modulnummer oder Stichwort …"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
            />
          </div>

            {kontext === 'EFZ' && ipaKomp && !q && (
              <Card style={{ marginBottom: 'var(--sp-4)' }}>
                <div className={s.compRow}>
                  <div>
                    <div className={s.fachNameRow}>Individuelle praktische Arbeit (IPA)</div>
                    <div className={s.fachKomp}>Einzelnote · 40% der EFZ-Note</div>
                  </div>
                  <input
                    className={s.noteInput}
                    inputMode="decimal"
                    disabled={!istEigen}
                    defaultValue={ipaWert}
                    onChange={(e) => setIpaWert(e.target.value)}
                    onBlur={(e) => void saveIpa(e.target.value)}
                    placeholder="–"
                  />
                </div>
              </Card>
            )}

            {gruppen.map((g) => {
              const disp = dispensiert.has(g.komp.id)
              return (
                <div key={g.komp.id} className={s.kompGruppe}>
                  <div className={s.kompGruppeTitel}>
                    {g.komp.name} {disp && <Badge tone="warn">dispensiert (BM)</Badge>}
                  </div>
                  <div className={s.fachList}>
                    {g.faecher.map((f) => {
                      const lbs = lbsByFach[f.id] ?? []
                      const note = modulnote(lbWerte(lbs))
                      const status = modulStatus(lbs)
                      const fehler = !disp && status === 'begonnen'
                      return (
                        <button
                          key={f.id}
                          className={`${s.fachRow} ${disp ? s.fachRowDisabled : ''} ${fehler ? s.fachRowFehler : ''}`}
                          disabled={disp}
                          onClick={() => !disp && setDetailFachId(f.id)}
                          title={fehler ? `Gewichte ergeben ${gewichtSumme(lbs)}% statt 100% – begonnen, nicht abgeschlossen` : undefined}
                        >
                          <span className={`${s.modulChip} ${f.modul_nr ? '' : s.modulChipLeer}`}>
                            {f.modul_nr ? `Modul ${f.modul_nr}` : 'kein Modul'}
                          </span>
                          <span className={s.fachMain}>
                            <span className={s.fachNameRow}>{f.name}</span>
                            {f.typ && <span className={s.fachKomp}>{f.typ}</span>}
                          </span>
                          <span className={s.fachRight}>
                            {fehler && <span className={s.sumBadge}>Σ {gewichtSumme(lbs)}%</span>}
                            <span className={s.lbCount}>{lbs.length} LB</span>
                            <span className={`${s.gradeBig} ${note == null ? s.gradeEmpty : ''}`}>{fmt(note)}</span>
                            <svg className={s.chevR} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {gruppen.length === 0 && (
              <p className="muted" style={{ padding: 'var(--sp-4)' }}>
                {q ? `Keine Module gefunden für „${suche}".` : 'Keine Fächer in diesem Kontext.'}
              </p>
            )}
          <div className={s.listeSpacer} />

          {/* Schwebende Ergebnis-Leiste (unten) */}
          <div className={s.resultBar}>
            <div className={s.gesamt}>
              <div className={s.gesamtLabel}>{kontext === 'EFZ' ? 'EFZ-Gesamtnote' : 'BM-Gesamtnote'}</div>
              <div className={`${s.gesamtWert} ${total == null ? s.gesamtWertLeer : ''}`}>{fmt(total)}</div>
            </div>
            <div className={s.teilnoten}>
              {roots.map((r) => {
                const komp = komponenten.find((k) => k.code === r.code)
                return (
                  <div key={r.code} className={s.teil}>
                    <span className={s.teilName}>{kurzName(r.code, r.name)}</span>
                    <span className={s.teilLine}>
                      <span className={s.teilWert}>{fmt(berechneKomponente(r, blatt))}</span>
                      <span className={s.teilGewicht}>{Math.round((komp?.gewicht ?? 0) * 100)}%</span>
                    </span>
                  </div>
                )
              })}
              {kontext === 'BM' && total == null && (
                <span className={s.teilBM}>BM-Gewichte noch nicht erfasst</span>
              )}
            </div>
          </div>
        </>
      )}

      {detailFach && (
        <LbEditor
          fach={detailFach}
          lbs={lbsByFach[detailFach.id] ?? []}
          istEigen={istEigen}
          onClose={() => setDetailFachId(null)}
          onAdd={(felder) => addLb(detailFach.id, felder)}
          onUpdate={(id, patch) => updateLb(id, detailFach.id, patch)}
          onDelete={(id) => deleteLb(id, detailFach.id)}
        />
      )}
    </div>
  )
}

function LbEditor({
  fach,
  lbs,
  istEigen,
  onClose,
  onAdd,
  onUpdate,
  onDelete,
}: {
  fach: Fach
  lbs: Leistungsbeurteilung[]
  istEigen: boolean
  onClose: () => void
  onAdd: (felder: { titel: string; gewicht: number; wert: number }) => void | Promise<void>
  onUpdate: (id: string, patch: Partial<Pick<Leistungsbeurteilung, 'titel' | 'gewicht' | 'wert'>>) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
}) {
  const [titel, setTitel] = useState('')
  const [gewicht, setGewicht] = useState('')
  const [note, setNote] = useState('')

  const modn = modulnote(lbs.map((l) => ({ wert: l.wert, gewicht: l.gewicht })))
  const summe = gewichtSumme(lbs)
  const vollstaendig = lbs.length === 0 || Math.abs(summe - 100) < 0.01

  function hinzufuegen() {
    const w = parseNote(note)
    const g = Number(gewicht.replace(',', '.'))
    if (w == null || !Number.isFinite(g) || g <= 0) return
    void onAdd({ titel: titel.trim() || `LB ${lbs.length + 1}`, gewicht: g, wert: w })
    setTitel('')
    setGewicht('1')
    setNote('')
  }

  return (
    <Modal open onClose={onClose} title={fach.name} footer={<Button variant="secondary" onClick={onClose}>Schliessen</Button>}>
      <div className={s.lbHeadChip}>
        <span className={`${s.modulChip} ${fach.modul_nr ? '' : s.modulChipLeer}`}>
          {fach.modul_nr ? `Modul ${fach.modul_nr}` : 'kein Modul'}
        </span>
      </div>

      <table className={s.lbTable}>
        <thead>
          <tr>
            <th>Leistungsbeurteilung</th>
            <th style={{ width: 80 }}>Gewicht %</th>
            <th style={{ width: 80 }}>Note</th>
            {istEigen && <th style={{ width: 40 }}></th>}
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
                  <input className={s.lbSmall} inputMode="decimal" defaultValue={String(l.gewicht)}
                    onBlur={(e) => { const g = Number(e.target.value.replace(',', '.')); if (Number.isFinite(g) && g > 0) void onUpdate(l.id, { gewicht: g }) }} />
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
              {istEigen && (
                <td>
                  <button className={s.lbDel} onClick={() => void onDelete(l.id)} aria-label="Löschen">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </td>
              )}
            </tr>
          ))}
          {lbs.length === 0 && (
            <tr>
              <td colSpan={istEigen ? 4 : 3} className="muted" style={{ padding: 'var(--sp-3) var(--sp-2)' }}>
                Noch keine Leistungsbeurteilungen erfasst.
              </td>
            </tr>
          )}
          {istEigen && (
            <tr>
              <td><input className={s.lbTitel} placeholder="z.B. Prüfung 1 / VA" value={titel} onChange={(e) => setTitel(e.target.value)} /></td>
              <td><input className={s.lbSmall} inputMode="decimal" value={gewicht} onChange={(e) => setGewicht(e.target.value)} placeholder="%" /></td>
              <td><input className={s.lbSmall} inputMode="decimal" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" /></td>
              <td>
                <Button size="sm" variant="secondary" onClick={hinzufuegen}>+</Button>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className={s.lbFoot}>
        <span className={`${s.lbSumme} ${!vollstaendig ? s.lbSummeFehler : ''}`}>Summe Gewichte: {summe}%</span>
        <span className={s.lbModulnote}>Modulnote:<b>{fmt(modn)}</b></span>
      </div>
      {lbs.length > 0 && !vollstaendig && (
        <div className={s.lbWarn}>
          Die Gewichte ergeben {summe}% statt 100 % – das Modul gilt als begonnen, aber nicht
          abgeschlossen.
        </div>
      )}
    </Modal>
  )
}
