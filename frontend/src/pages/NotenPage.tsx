import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.ts'
import { useAuth } from '../auth/AuthContext.tsx'
import { useLernende } from '../lib/LernendenContext.tsx'
import type { Fach, Leistungsbeurteilung, Note, Notenkomponente, NotenKontext, Notenregel } from '../lib/types.ts'
import {
  berechneBm,
  berechneKomponente,
  berechneNotenstand,
  bmEingaben,
  gewichtSumme,
  modulnote,
  modulStatus,
  pruefeBestehen,
} from '../lib/noten.ts'
import { semesterVon } from '../lib/zeitstrahl.ts'
import { Badge, Button, Card, EmptyState, PageHeader, Spinner, Tabs } from '../ui/index.ts'
import { LernendeAuswahl } from '../components/LernendeAuswahl.tsx'
import { LbEditor } from './noten/LbEditor.tsx'
import { EfzZielKarte } from './noten/EfzZielKarte.tsx'
import { BmBereich } from './noten/BmBereich.tsx'
import { useSimulation } from './noten/simulation.ts'
import { fmt, fmtGerundet, parseNote } from './noten/format.ts'
import s from './Noten.module.css'

const lbWerte = (lbs: { wert: number; gewicht: number }[]) => lbs.map((l) => ({ wert: l.wert, gewicht: l.gewicht }))

// Kurze Labels für die Ergebnis-Leiste (kompakt, kein Umbruch/Scrollen).
const KURZ: Record<string, string> = {
  IPA: 'IPA',
  INFORMATIK: 'Informatik',
  ABU: 'ABU',
  EGK: 'EGK',
}
const kurzName = (code: string, name: string) => KURZ[code] ?? name

export function NotenPage() {
  const { profil } = useAuth()
  const { aktiv, aktivId, istBB, patchLernende } = useLernende()
  const istEigen = !!aktiv && !!profil && aktiv.id === profil.id
  const machtBM = !!aktiv?.macht_bm
  const aktuellesSemester = aktiv?.ausbildungsstart ? semesterVon(new Date(), new Date(aktiv.ausbildungsstart)) : null

  async function toggleBM(v: boolean) {
    if (!aktiv) return
    patchLernende(aktiv.id, { macht_bm: v })
    await supabase.from('benutzer').update({ macht_bm: v }).eq('id', aktiv.id)
  }

  const [faecher, setFaecher] = useState<Fach[]>([])
  const [komponenten, setKomponenten] = useState<Notenkomponente[]>([])
  const [regeln, setRegeln] = useState<Notenregel[]>([])
  const [lbsByFach, setLbsByFach] = useState<Record<string, Leistungsbeurteilung[]>>({})
  const [noten, setNoten] = useState<Note[]>([])
  const [ipaWert, setIpaWert] = useState<string>('')
  const [kontext, setKontext] = useState<NotenKontext>('EFZ')
  const [detailFachId, setDetailFachId] = useState<string | null>(null)
  const [suche, setSuche] = useState('')
  const [ladt, setLadt] = useState(true)
  const simulation = useSimulation(aktivId)
  const { sim } = simulation

  const ipaKomp = komponenten.find((k) => k.code === 'IPA')
  const regelEfz = regeln.find((r) => r.kontext === 'EFZ') ?? null
  const regelBm = regeln.find((r) => r.kontext === 'BM') ?? null

  useEffect(() => {
    void (async () => {
      const [f, k, r] = await Promise.all([
        supabase.from('fach').select('*').eq('aktiv', true).order('sortierung'),
        supabase.from('notenkomponente').select('*').order('sortierung'),
        supabase.from('notenregel').select('*'),
      ])
      setFaecher((f.data as Fach[]) ?? [])
      setKomponenten((k.data as Notenkomponente[]) ?? [])
      setRegeln((r.data as Notenregel[]) ?? [])
      setLadt(false)
    })()
  }, [])

  useEffect(() => {
    if (!aktivId) {
      setLbsByFach({})
      setNoten([])
      setIpaWert('')
      return
    }
    void (async () => {
      const [lb, note] = await Promise.all([
        supabase.from('leistungsbeurteilung').select('*').eq('benutzer_id', aktivId).order('datum'),
        supabase.from('note').select('*').eq('benutzer_id', aktivId).order('erfasst_am'),
      ])
      const byFach: Record<string, Leistungsbeurteilung[]> = {}
      for (const l of (lb.data as Leistungsbeurteilung[]) ?? []) (byFach[l.fach_id] ??= []).push(l)
      setLbsByFach(byFach)
      const alle = (note.data as Note[]) ?? []
      setNoten(alle)
      let ipa = ''
      for (const n of alle) if (n.notenkomponente_id === ipaKomp?.id) ipa = String(n.wert)
      setIpaWert(ipa)
    })()
    // ipaKomp?.id stabil nach Laden der Komponenten
  }, [aktivId, ipaKomp?.id])

  // Neueste Prüfungsnote je Fach (note ist append-only, sortiert nach erfasst_am).
  const pruefungReal = useMemo(() => {
    const m: Record<string, number> = {}
    for (const n of noten) if (n.fach_id && n.art === 'pruefung') m[n.fach_id] = n.wert
    return m
  }, [noten])

  // Erfasste + geplante LBs (Simulation) je Fach.
  const lbsMitSim = useMemo(() => {
    const m: Record<string, { wert: number; gewicht: number; semester: number | null }[]> = {}
    for (const f of faecher) {
      const real = lbsByFach[f.id] ?? []
      const geplant = sim.lbs[f.id] ?? []
      if (real.length || geplant.length) m[f.id] = [...real, ...geplant]
    }
    return m
  }, [faecher, lbsByFach, sim.lbs])

  const ipaReal = parseNote(ipaWert)
  const ipaEffektiv = ipaReal ?? sim.ipa

  // ---- Berechnung (live) ----
  const efz = useMemo(() => {
    const rund = regelEfz?.rundung_gesamt ?? null
    const mitSim = berechneNotenstand(komponenten, faecher, lbsMitSim, ipaEffektiv, 'EFZ', machtBM, rund)
    const ohneSim = berechneNotenstand(komponenten, faecher, lbsByFach, ipaReal, 'EFZ', machtBM, rund)
    return {
      ...mitSim,
      totalOhneSim: ohneSim.total,
      dispensiert: new Set(mitSim.dispensiertIds),
      bedingungen: pruefeBestehen(mitSim.roots, mitSim.blatt, mitSim.total, regelEfz?.mindestnote_gesamt ?? null),
      gesamtMitIpa: (ipa: number) =>
        berechneNotenstand(komponenten, faecher, lbsMitSim, ipa, 'EFZ', machtBM, rund).total,
    }
  }, [komponenten, faecher, lbsMitSim, lbsByFach, ipaEffektiv, ipaReal, machtBM, regelEfz])

  const bm = useMemo(() => {
    if (!regelBm) return null
    const pruefung = { ...sim.pruefung, ...pruefungReal }
    const mitSim = berechneBm(bmEingaben(komponenten, faecher, lbsMitSim, pruefung), regelBm)
    const ohneSim = berechneBm(bmEingaben(komponenten, faecher, lbsByFach, pruefungReal), regelBm)
    return { ...mitSim, gesamtOhneSim: ohneSim.gesamt }
  }, [regelBm, komponenten, faecher, lbsMitSim, lbsByFach, sim.pruefung, pruefungReal])

  // ---- LB-Mutationen ----
  type LbFelder = { titel: string; gewicht: number; wert: number; semester: number | null }
  async function addLb(fachId: string, felder: LbFelder) {
    if (!istEigen || !aktivId) return
    const { data } = await supabase
      .from('leistungsbeurteilung')
      .insert({ benutzer_id: aktivId, fach_id: fachId, ...felder })
      .select()
      .single()
    if (data) setLbsByFach((c) => ({ ...c, [fachId]: [...(c[fachId] ?? []), data as Leistungsbeurteilung] }))
  }
  async function updateLb(id: string, fachId: string, patch: Partial<LbFelder>) {
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
  async function savePruefung(fachId: string, wert: number) {
    if (!istEigen || !aktivId) return
    // Append-only: neue Zeile statt Update – die neueste gilt.
    const { data } = await supabase
      .from('note')
      .insert({ benutzer_id: aktivId, fach_id: fachId, wert, art: 'pruefung' })
      .select()
      .single()
    if (data) {
      setNoten((c) => [...c, data as Note])
      simulation.setPruefung(fachId, null)
    }
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
  const bmFaecher = faecher.filter((f) => f.kontext === 'BM' && trifft(f))

  const detailFach = detailFachId ? faecher.find((f) => f.id === detailFachId) ?? null : null
  const detailKomp = detailFach ? komponenten.find((k) => k.id === detailFach.notenkomponente_id) : undefined
  const detailRundung = detailFach?.kontext === 'BM' ? regelBm?.rundung_semesternote ?? null : detailKomp?.rundung_einzelnote ?? null

  const total = kontext === 'EFZ' ? efz.total : bm?.gesamt ?? null
  const totalOhneSim = kontext === 'EFZ' ? efz.totalOhneSim : bm?.gesamtOhneSim ?? null

  return (
    <div>
      <PageHeader
        eyebrow="Qualifikationsverfahren"
        title="Notenrechner"
        description="Pro Modul mehrere Leistungsbeurteilungen mit eigener Gewichtung. Klick auf ein Modul öffnet die Detailerfassung mit Zielnote und Simulation. Gewichte, Rundung und Bestehensregeln kommen aus den Daten."
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
          {simulation.aktiv && (
            <div className={s.simBanner}>
              <span>
                <Badge tone="warn">Simulation aktiv</Badge> Geplante Noten fliessen in die Anzeige ein – gespeichert
                nur in diesem Browser.
              </span>
              <Button size="sm" variant="ghost" onClick={simulation.reset}>Simulation zurücksetzen</Button>
            </div>
          )}

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

          {kontext === 'EFZ' && !q && (
            <>
              {ipaKomp && (
                <Card style={{ marginBottom: 'var(--sp-4)' }}>
                  <div className={s.compRow}>
                    <div>
                      <div className={s.fachNameRow}>Individuelle praktische Arbeit (IPA)</div>
                      <div className={s.fachKomp}>Einzelnote · {Math.round(ipaKomp.gewicht * 100)}% der EFZ-Note</div>
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
              <EfzZielKarte
                bedingungen={efz.bedingungen}
                ipaReal={ipaReal}
                ipaMindest={ipaKomp?.mindestnote ?? null}
                simIpa={sim.ipa}
                onSimIpa={simulation.setIpa}
                gesamtMitIpa={efz.gesamtMitIpa}
                quelle={regelEfz?.bezeichnung ?? null}
              />
            </>
          )}

          {kontext === 'EFZ' &&
            gruppen.map((g) => {
              const disp = efz.dispensiert.has(g.komp.id)
              return (
                <div key={g.komp.id} className={s.kompGruppe}>
                  <div className={s.kompGruppeTitel}>
                    {g.komp.name} {disp && <Badge tone="warn">dispensiert (BM)</Badge>}
                  </div>
                  <div className={s.fachList}>
                    {g.faecher.map((f) => {
                      const lbs = lbsByFach[f.id] ?? []
                      const geplant = sim.lbs[f.id] ?? []
                      const note = modulnote(lbWerte(lbsMitSim[f.id] ?? []))
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
                            {geplant.length > 0 && <Badge tone="warn">+{geplant.length} geplant</Badge>}
                            {fehler && <span className={s.sumBadge}>Σ {gewichtSumme(lbs)}%</span>}
                            <span className={s.lbCount}>{lbs.length} LB</span>
                            <span className={`${s.gradeBig} ${note == null ? s.gradeEmpty : ''}`}>
                              {fmtGerundet(note, g.komp.rundung_einzelnote)}
                            </span>
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

          {kontext === 'EFZ' && gruppen.length === 0 && (
            <p className="muted" style={{ padding: 'var(--sp-4)' }}>
              {q ? `Keine Module gefunden für „${suche}".` : 'Keine Fächer in diesem Kontext.'}
            </p>
          )}

          {kontext === 'BM' &&
            (bm && regelBm ? (
              <BmBereich
                faecher={bmFaecher}
                stand={bm}
                regel={regelBm}
                pruefungReal={pruefungReal}
                simPruefung={sim.pruefung}
                istEigen={istEigen}
                onSavePruefung={(fachId, wert) => void savePruefung(fachId, wert)}
                onSimPruefung={simulation.setPruefung}
                onOpen={setDetailFachId}
              />
            ) : (
              <EmptyState
                title="BM-Regeln fehlen"
                text="Die Tabelle notenregel enthält keine BM-Regeln. Bitte Migration 20260720120009 einspielen."
              />
            ))}
          <div className={s.listeSpacer} />

          {/* Schwebende Ergebnis-Leiste (unten) */}
          <div className={s.resultBar}>
            <div className={s.gesamt}>
              <div className={s.gesamtLabel}>
                {kontext === 'EFZ' ? 'EFZ-Gesamtnote' : 'BM-Gesamtnote'}
                {simulation.aktiv && ' · simuliert'}
              </div>
              <div className={`${s.gesamtWert} ${total == null ? s.gesamtWertLeer : ''}`}>{fmt(total)}</div>
              {simulation.aktiv && totalOhneSim !== total && (
                <div className={s.gesamtOhneSim}>ohne Simulation {fmt(totalOhneSim)}</div>
              )}
            </div>
            <div className={s.teilnoten}>
              {kontext === 'EFZ' &&
                efz.roots.map((r) => {
                  const komp = komponenten.find((k) => k.code === r.code)
                  return (
                    <div key={r.code} className={s.teil}>
                      <span className={s.teilName}>{kurzName(r.code, r.name)}</span>
                      <span className={s.teilLine}>
                        <span className={s.teilWert}>{fmt(berechneKomponente(r, efz.blatt))}</span>
                        <span className={s.teilGewicht}>{Math.round((komp?.gewicht ?? 0) * 100)}%</span>
                      </span>
                    </div>
                  )
                })}
              {kontext === 'BM' && bm && (
                <>
                  <div className={s.teil}>
                    <span className={s.teilName}>Ungenügend</span>
                    <span className={s.teilLine}>
                      <span className={s.teilWert}>{bm.bestehen.anzahlUngenuegend}</span>
                    </span>
                  </div>
                  <div className={s.teil}>
                    <span className={s.teilName}>Defizit</span>
                    <span className={s.teilLine}>
                      <span className={s.teilWert}>{bm.bestehen.notendefizit.toFixed(1)}</span>
                    </span>
                  </div>
                  {bm.vorlaeufig && <span className={s.teilBM}>vorläufig</span>}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {detailFach && (
        <LbEditor
          fach={detailFach}
          kontext={detailFach.kontext}
          lbs={lbsByFach[detailFach.id] ?? []}
          simLbs={sim.lbs[detailFach.id] ?? []}
          rundung={detailRundung}
          aktuellesSemester={aktuellesSemester}
          istEigen={istEigen}
          onClose={() => setDetailFachId(null)}
          onAdd={(felder) => addLb(detailFach.id, felder)}
          onUpdate={(id, patch) => updateLb(id, detailFach.id, patch)}
          onDelete={(id) => deleteLb(id, detailFach.id)}
          onSimAdd={(lb) => simulation.addLb(detailFach.id, lb)}
          onSimRemove={(id) => simulation.removeLb(detailFach.id, id)}
        />
      )}
    </div>
  )
}
