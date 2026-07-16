import { useEffect, useMemo, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.ts'
import { useLernende } from '../lib/LernendenContext.tsx'
import type {
  Benutzer,
  Bildungsbericht,
  Fach,
  Handlungskompetenz,
  Leistungsziel,
  Team,
  TeamLeistungsziel,
  TeamZuteilung,
} from '../lib/types.ts'
import {
  ausbildungsEnde,
  isoWoche,
  positionAnteil,
  semesterBloecke,
  semesterVon,
  snapAufWoche,
  toIsoDatum,
  wochenZwischen,
} from '../lib/zeitstrahl.ts'
import { Badge, Button, EmptyState, Modal, PageHeader, Select, Spinner, TextField } from '../ui/index.ts'
import { LernendeAuswahl } from '../components/LernendeAuswahl.tsx'
import s from './Team.module.css'

const PX_PRO_WOCHE = 13
const TEAM_FARBEN = ['#6b5cd6', '#2f8f6b', '#b0863a', '#a34d7d', '#3a7ca8', '#8a6db0', '#4f9d8f']
function teamFarbe(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return TEAM_FARBEN[h % TEAM_FARBEN.length]
}
const D = (iso: string) => new Date(iso + 'T00:00:00')
const fmtVoll = (iso: string) => D(iso).toLocaleDateString('de-CH')

export function TeamRotationPage() {
  const navigate = useNavigate()
  const { aktiv, aktivId, istBB } = useLernende()
  const [teams, setTeams] = useState<Team[]>([])
  const [benutzer, setBenutzer] = useState<Benutzer[]>([])
  const [tlz, setTlz] = useState<TeamLeistungsziel[]>([])
  const [lzList, setLzList] = useState<Leistungsziel[]>([])
  const [hks, setHks] = useState<Handlungskompetenz[]>([])
  const [module, setModule] = useState<Fach[]>([])
  const [zuteilungen, setZuteilungen] = useState<TeamZuteilung[]>([])
  const [berichte, setBerichte] = useState<Bildungsbericht[]>([])
  const [ladt, setLadt] = useState(true)

  const [teamModal, setTeamModal] = useState<{ team: Team | null } | null>(null)
  const [zieleTeam, setZieleTeam] = useState<Team | null>(null)
  const [zModal, setZModal] = useState<{ zuteilung: TeamZuteilung | null } | null>(null)
  const [modulModal, setModulModal] = useState(false)
  const [detail, setDetail] = useState<TeamZuteilung | null>(null)

  async function ladeBasis() {
    const [t, b, tk, lz, h, f] = await Promise.all([
      supabase.from('team').select('*').order('name'),
      supabase.from('benutzer').select('*').order('name'),
      supabase.from('team_leistungsziel').select('*'),
      supabase.from('leistungsziel').select('*').order('sortierung'),
      supabase.from('handlungskompetenz').select('*').order('sortierung'),
      supabase.from('fach').select('*').not('modul_nr', 'is', null).order('modul_nr'),
    ])
    setTeams((t.data as Team[]) ?? [])
    setBenutzer((b.data as Benutzer[]) ?? [])
    setTlz((tk.data as TeamLeistungsziel[]) ?? [])
    setLzList((lz.data as Leistungsziel[]) ?? [])
    setHks((h.data as Handlungskompetenz[]) ?? [])
    setModule((f.data as Fach[]) ?? [])
  }
  async function ladeLernendenDaten() {
    if (!aktivId) {
      setZuteilungen([])
      setBerichte([])
      return
    }
    const [z, b] = await Promise.all([
      supabase.from('team_zuteilung').select('*').eq('benutzer_id', aktivId).order('von_datum'),
      supabase
        .from('bildungsbericht')
        .select('id, typ, semester, datum, status')
        .eq('benutzer_id', aktivId)
        .order('datum'),
    ])
    setZuteilungen((z.data as TeamZuteilung[]) ?? [])
    setBerichte((b.data as Bildungsbericht[]) ?? [])
  }

  useEffect(() => {
    void (async () => {
      await ladeBasis()
      setLadt(false)
    })()
  }, [])
  useEffect(() => {
    void ladeLernendenDaten()
  }, [aktivId])

  // Zeitraum einer Zuteilung per Drag ändern (optimistisch, dann persistieren).
  async function updateZuteilungZeit(id: string, patch: { von_datum: string; bis_datum: string | null }) {
    setZuteilungen((c) => c.map((z) => (z.id === id ? { ...z, ...patch } : z)))
    await supabase.from('team_zuteilung').update(patch).eq('id', id)
  }

  const teamById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams])
  const benutzerName = (id: string | null) => (id ? benutzer.find((b) => b.id === id)?.name ?? null : null)
  const zieleCount = (teamId: string) => tlz.filter((x) => x.team_id === teamId).length

  if (ladt) return <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}><Spinner /></div>

  const start = aktiv?.ausbildungsstart ? D(aktiv.ausbildungsstart) : null

  return (
    <div>
      <PageHeader
        eyebrow="Betriebliche Rotation"
        title="Team-Rotation"
        description="Zeitstrahl über die ganze Lehre: welches Team in welcher Kalenderwoche, welche Module in welchem Semester und welche Ziele wo geplant sind."
        actions={
          <>
            <LernendeAuswahl />
            <Button variant="secondary" onClick={() => setModulModal(true)}>Module planen</Button>
            {istBB && (
              <>
                <Button variant="secondary" onClick={() => setTeamModal({ team: null })}>+ Team</Button>
                {aktivId && <Button variant="primary" onClick={() => setZModal({ zuteilung: null })}>+ Zuteilung</Button>}
              </>
            )}
          </>
        }
      />

      {/* Teams-Leiste: alle Teams (auch ohne Zuteilung) */}
      {teams.length > 0 && (
        <div className={s.teamsLeiste}>
          {teams.map((t) => (
            <button
              key={t.id}
              className={s.teamChip}
              style={{ ['--tc' as string]: teamFarbe(t.id) }}
              onClick={() => istBB && setTeamModal({ team: t })}
              disabled={!istBB}
              title={istBB ? 'Team bearbeiten' : undefined}
            >
              <span className={s.teamChipDot} />
              <span className={s.teamChipName}>{t.name}{!t.aktiv && ' (inaktiv)'}</span>
              <span className={s.teamChipMeta}>
                {benutzerName(t.verantwortlich_benutzer_id) ?? 'keine Leitung'} · {zieleCount(t.id)} Ziele
              </span>
              {istBB && (
                <span
                  className={s.teamChipZiele}
                  onClick={(e) => { e.stopPropagation(); setZieleTeam(t) }}
                >
                  Ziele
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {!aktivId ? (
        <EmptyState title="Kein Lernender ausgewählt" text="Bitte oben eine lernende Person wählen." />
      ) : !start ? (
        <EmptyState title="Ausbildungsstart fehlt" text="Für den Zeitstrahl wird das Ausbildungsstart-Datum benötigt." />
      ) : (
        <Zeitstrahl
          start={start}
          istBB={istBB}
          zuteilungen={zuteilungen}
          berichte={berichte}
          teamById={teamById}
          module={module}
          benutzerName={benutzerName}
          zieleCount={zieleCount}
          onBar={(z) => setDetail(z)}
          onFlag={() => navigate('/bildungsbericht')}
          onZuteilungZeit={updateZuteilungZeit}
        />
      )}

      {/* Modals */}
      {istBB && teamModal && (
        <TeamModal
          team={teamModal.team}
          benutzer={benutzer}
          onClose={() => setTeamModal(null)}
          onGespeichert={() => { setTeamModal(null); void ladeBasis() }}
        />
      )}
      {istBB && zieleTeam && (
        <ZieleModal
          team={zieleTeam}
          lzList={lzList}
          hks={hks}
          aktuelle={tlz.filter((x) => x.team_id === zieleTeam.id).map((x) => x.leistungsziel_id)}
          onClose={() => setZieleTeam(null)}
          onGespeichert={() => { setZieleTeam(null); void ladeBasis() }}
        />
      )}
      {istBB && zModal && (
        <ZuteilungModal
          zuteilung={zModal.zuteilung}
          teams={teams.filter((t) => t.aktiv || t.id === zModal.zuteilung?.team_id)}
          benutzerId={aktivId}
          onClose={() => setZModal(null)}
          onGespeichert={() => { setZModal(null); void ladeLernendenDaten() }}
        />
      )}
      {modulModal && (
        <ModulPlanModal
          module={module}
          onClose={() => setModulModal(false)}
          onGespeichert={() => { setModulModal(false); void ladeBasis() }}
        />
      )}
      {detail && (
        <ZuteilungDetail
          zuteilung={detail}
          team={teamById[detail.team_id] ?? null}
          benutzerName={benutzerName}
          tlz={tlz}
          lzList={lzList}
          hks={hks}
          istBB={istBB}
          onClose={() => setDetail(null)}
          onEditZeit={() => { setZModal({ zuteilung: detail }); setDetail(null) }}
          onEditZiele={(t) => { setZieleTeam(t); setDetail(null) }}
        />
      )}
    </div>
  )
}

type DragMode = 'move' | 'top' | 'bottom'
type DragState = { id: string; mode: DragMode; von: number; bis: number; offen: boolean; moved: boolean }

// ------------------------------------------------------------------ Zeitstrahl
function Zeitstrahl({
  start, istBB, zuteilungen, berichte, teamById, module, benutzerName, zieleCount, onBar, onFlag, onZuteilungZeit,
}: {
  start: Date
  istBB: boolean
  zuteilungen: TeamZuteilung[]
  berichte: Bildungsbericht[]
  teamById: Record<string, Team>
  module: Fach[]
  benutzerName: (id: string | null) => string | null
  zieleCount: (teamId: string) => number
  onBar: (z: TeamZuteilung) => void
  onFlag: (b: Bildungsbericht) => void
  onZuteilungZeit: (id: string, patch: { von_datum: string; bis_datum: string | null }) => void
}) {
  const ende = ausbildungsEnde(start)
  const H = Math.round(wochenZwischen(start, ende) * PX_PRO_WOCHE)
  const bloecke = semesterBloecke(start)
  const top = (d: Date) => positionAnteil(d, start, ende) * H

  const startMs = start.getTime()
  const endeMs = ende.getTime()
  const msPerPx = (endeMs - startMs) / H
  const MIN_MS = 7 * 86400000

  const [drag, setDrag] = useState<DragState | null>(null)

  function beginDrag(e: ReactPointerEvent, z: TeamZuteilung, mode: DragMode) {
    if (!istBB) return
    e.preventDefault()
    e.stopPropagation()
    const startY = e.clientY
    const von0 = D(z.von_datum).getTime()
    const offen = !z.bis_datum
    const bis0 = z.bis_datum ? D(z.bis_datum).getTime() : endeMs
    const dur = bis0 - von0
    let latest: DragState = { id: z.id, mode, von: von0, bis: bis0, offen, moved: false }

    const onMove = (ev: PointerEvent) => {
      const deltaMs = (ev.clientY - startY) * msPerPx
      let von = von0
      let bis = bis0
      if (mode === 'move') {
        von = snapAufWoche(new Date(von0 + deltaMs)).getTime()
        bis = von + dur
        if (von < startMs) { von = startMs; bis = von + dur }
        if (bis > endeMs) { bis = endeMs; von = bis - dur }
      } else if (mode === 'top') {
        von = snapAufWoche(new Date(von0 + deltaMs)).getTime()
        von = Math.max(startMs, Math.min(von, bis0 - MIN_MS))
        bis = bis0
      } else {
        bis = snapAufWoche(new Date(bis0 + deltaMs)).getTime()
        bis = Math.min(endeMs, Math.max(bis, von0 + MIN_MS))
        von = von0
      }
      const moved = latest.moved || Math.abs(ev.clientY - startY) > 3
      latest = { id: z.id, mode, von, bis, offen, moved }
      setDrag(latest)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDrag(null)
      if (latest.moved) {
        const bis_datum = offen && mode !== 'bottom' ? null : toIsoDatum(new Date(latest.bis))
        onZuteilungZeit(z.id, { von_datum: toIsoDatum(new Date(latest.von)), bis_datum })
      } else if (mode === 'move') {
        onBar(z)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const heute = new Date()
  const nowInRange = heute >= start && heute <= ende
  const nowTop = top(heute)
  const nowSem = semesterVon(heute, start)

  // KW-Gitter alle 4 Wochen.
  const ticks: { d: Date; kw: number }[] = []
  for (let w = 0; w * 4 * 7 * 86400000 < ende.getTime() - start.getTime(); w++) {
    const d = new Date(start)
    d.setDate(d.getDate() + w * 28)
    ticks.push({ d, kw: isoWoche(d) })
  }

  const moduleBySem: Record<number, Fach[]> = {}
  for (const m of module) if (m.semester) (moduleBySem[m.semester] ??= []).push(m)

  return (
    <div className={s.strahlWrap}>
      <div className={s.strahlHeader}>
        <div className={s.spHeadAchse}>Zeit</div>
        <div className={s.spHead}>Schule · Module</div>
        <div className={s.spHead}>Betrieb · Teams</div>
        <div className={s.spHead}>Berichte</div>
      </div>
      <div className={s.strahl} style={{ height: H }}>
          {/* Semester-Bänder (Hintergrund) */}
          {bloecke.map((b) => (
            <div
              key={`band-${b.nr}`}
              className={`${s.band} ${b.nr % 2 === 0 ? s.bandAlt : ''}`}
              style={{ top: top(b.von), height: top(b.bis) - top(b.von) }}
            />
          ))}
          {/* KW-Gitterlinien */}
          {ticks.map((t, i) => (
            <div key={`tick-${i}`} className={s.kwLinie} style={{ top: top(t.d) }} />
          ))}

          {/* Achse */}
          <div className={s.spalteAchse}>
            {bloecke.map((b) => (
              <div key={`sem-${b.nr}`} className={s.achseSem} style={{ top: top(b.von), height: top(b.bis) - top(b.von) }}>
                <div className={s.achseSemNr}>Semester {b.nr}</div>
                <div className={s.achseSemSub}>{b.lehrjahr}. Lehrjahr</div>
                <div className={s.achseSemDat}>
                  {b.von.toLocaleDateString('de-CH', { month: 'short', year: '2-digit' })} –{' '}
                  {b.bis.toLocaleDateString('de-CH', { month: 'short', year: '2-digit' })}
                </div>
              </div>
            ))}
            {ticks.map((t, i) => (
              <div key={`kw-${i}`} className={s.kwLabel} style={{ top: top(t.d) }}>KW {t.kw}</div>
            ))}
          </div>

          {/* Schule: Module pro Semester */}
          <div className={s.spalteSchule}>
            {bloecke.map((b) => {
              const mods = moduleBySem[b.nr] ?? []
              return (
                <div key={`schule-${b.nr}`} className={s.schuleBlock} style={{ top: top(b.von), height: top(b.bis) - top(b.von) }}>
                  {mods.length === 0 ? (
                    <span className={s.schuleLeer}>keine Module geplant</span>
                  ) : (
                    <div className={s.modChips}>
                      {mods.map((m) => (
                        <span key={m.id} className={s.modChip} title={m.name}>
                          <b>{m.modul_nr}</b> {m.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Betrieb: Team-Zuteilungen als Bänder */}
          <div className={s.spalteBetrieb}>
            {zuteilungen.length === 0 && (
              <div className={s.betriebLeer}>Noch keine Team-Zuteilung geplant.</div>
            )}
            {zuteilungen.map((z) => {
              const team = teamById[z.team_id]
              const istDrag = drag?.id === z.id
              const vonMs = istDrag ? drag!.von : D(z.von_datum).getTime()
              const bisMs = istDrag ? drag!.bis : z.bis_datum ? D(z.bis_datum).getTime() : ende.getTime()
              const von = new Date(vonMs)
              const bis = new Date(bisMs)
              const offen = istDrag ? drag!.offen && drag!.mode !== 'bottom' : !z.bis_datum
              const farbe = team ? teamFarbe(team.id) : 'var(--accent)'
              return (
                <div
                  key={z.id}
                  className={`${s.teamBar} ${istBB ? s.teamBarDrag : ''} ${istDrag ? s.teamBarAktiv : ''}`}
                  style={{ top: top(von), height: Math.max(30, top(bis) - top(von)), ['--tc' as string]: farbe }}
                  onPointerDown={istBB ? (e) => beginDrag(e, z, 'move') : undefined}
                  onClick={istBB ? undefined : () => onBar(z)}
                  role="button"
                  tabIndex={0}
                  title={istBB ? 'Ziehen zum Verschieben · Kanten ziehen für Dauer · Klick für Details' : undefined}
                >
                  {istBB && <div className={s.griffTop} onPointerDown={(e) => beginDrag(e, z, 'top')} />}
                  <div className={s.teamBarName}>{team?.name ?? 'Team?'}</div>
                  <div className={s.teamBarMeta}>
                    KW {isoWoche(von)} – {offen ? 'offen' : isoWoche(bis)} · {team ? zieleCount(team.id) : 0} Ziele
                  </div>
                  {istDrag ? (
                    <div className={s.teamBarPerson}>{von.toLocaleDateString('de-CH')} – {offen ? 'offen' : bis.toLocaleDateString('de-CH')}</div>
                  ) : (
                    team && benutzerName(team.verantwortlich_benutzer_id) && (
                      <div className={s.teamBarPerson}>{benutzerName(team.verantwortlich_benutzer_id)}</div>
                    )
                  )}
                  {istBB && <div className={s.griffBottom} onPointerDown={(e) => beginDrag(e, z, 'bottom')} />}
                </div>
              )
            })}
          </div>

          {/* Berichte: verlinkte Flags am jeweiligen Datum */}
          <div className={s.spalteBerichte}>
            {berichte.map((b) => {
              const abgeschlossen = b.status === 'abgeschlossen'
              const label = b.typ === 'sonderbericht' ? 'Sonderbericht' : `Sem ${b.semester ?? '?'}`
              return (
                <button
                  key={b.id}
                  className={`${s.flag} ${b.typ === 'sonderbericht' ? s.flagSonder : s.flagSem}`}
                  style={{ top: top(D(b.datum)) }}
                  onClick={() => onFlag(b)}
                  title={`${label} · ${fmtVoll(b.datum)} · ${abgeschlossen ? 'abgeschlossen' : 'Entwurf'} — öffnen`}
                >
                  <svg className={s.flagIcon} width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M5 3v18M5 4h11l-2 4 2 4H5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  </svg>
                  <span className={s.flagText}>{label}</span>
                  <span className={`${s.flagDot} ${abgeschlossen ? s.flagDotDone : ''}`} />
                </button>
              )
            })}
          </div>

          {/* Jetzt-Marker (oben) */}
          {nowInRange && (
            <div className={s.nowLine} style={{ top: nowTop }}>
              <span className={s.nowLabel}>Heute{nowSem ? ` · Sem ${nowSem}` : ''}</span>
            </div>
          )}
        </div>
      </div>
  )
}

// ------------------------------------------------------------------ Team anlegen/bearbeiten
function TeamModal({
  team, benutzer, onClose, onGespeichert,
}: { team: Team | null; benutzer: Benutzer[]; onClose: () => void; onGespeichert: () => void }) {
  const [name, setName] = useState(team?.name ?? '')
  const [verantwortlich, setVerantwortlich] = useState(team?.verantwortlich_benutzer_id ?? '')
  const [upn, setUpn] = useState(team?.upn ?? '')
  const [aktiv, setAktiv] = useState(team?.aktiv ?? true)
  const [speichert, setSpeichert] = useState(false)

  async function speichern() {
    if (!name.trim()) return
    setSpeichert(true)
    const zeile = {
      name: name.trim(),
      verantwortlich_benutzer_id: verantwortlich || null,
      upn: upn.trim() || null,
      aktiv,
    }
    if (team) await supabase.from('team').update(zeile).eq('id', team.id)
    else await supabase.from('team').insert(zeile)
    setSpeichert(false)
    onGespeichert()
  }

  return (
    <Modal open onClose={onClose} title={team ? 'Team bearbeiten' : 'Neues Team'} footer={
      <>
        <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
        <Button variant="primary" loading={speichert} onClick={() => void speichern()}>Speichern</Button>
      </>
    }>
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Infrastruktur / Netzwerk" />
      <Select
        label="Verantwortliche Person"
        value={verantwortlich}
        onChange={(e) => setVerantwortlich(e.target.value)}
        options={[{ value: '', label: '— keine —' }, ...benutzer.map((b) => ({ value: b.id, label: b.name }))]}
      />
      <TextField label="Entra-UPN (optional)" value={upn} onChange={(e) => setUpn(e.target.value)} hint="Identifier für späteren Entra-ID-Gruppen-Sync." />
      {team && (
        <label className={s.aktivRow}>
          <input type="checkbox" checked={aktiv} onChange={(e) => setAktiv(e.target.checked)} />
          Team aktiv
        </label>
      )}
    </Modal>
  )
}

// ------------------------------------------------------------------ Ziele (Leistungsziele) zuweisen
function ZieleModal({
  team, lzList, hks, aktuelle, onClose, onGespeichert,
}: {
  team: Team
  lzList: Leistungsziel[]
  hks: Handlungskompetenz[]
  aktuelle: string[]
  onClose: () => void
  onGespeichert: () => void
}) {
  const [sel, setSel] = useState<Set<string>>(new Set(aktuelle))
  const [speichert, setSpeichert] = useState(false)
  const [suche, setSuche] = useState('')

  const lzByHk = useMemo(() => {
    const m: Record<string, Leistungsziel[]> = {}
    for (const lz of lzList) (m[lz.handlungskompetenz_id] ??= []).push(lz)
    return m
  }, [lzList])

  const q = suche.trim().toLowerCase()
  const gruppen = hks
    .map((h) => ({ hk: h, lz: (lzByHk[h.id] ?? []).filter((l) => !q || l.text.toLowerCase().includes(q) || (l.code ?? '').toLowerCase().includes(q) || h.titel.toLowerCase().includes(q)) }))
    .filter((g) => g.lz.length > 0)

  function toggle(id: string) {
    setSel((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleHk(ids: string[], alle: boolean) {
    setSel((c) => { const n = new Set(c); ids.forEach((id) => (alle ? n.delete(id) : n.add(id))); return n })
  }
  async function speichern() {
    setSpeichert(true)
    await supabase.from('team_leistungsziel').delete().eq('team_id', team.id)
    const rows = [...sel].map((lzId) => ({ team_id: team.id, leistungsziel_id: lzId }))
    if (rows.length > 0) await supabase.from('team_leistungsziel').insert(rows)
    setSpeichert(false)
    onGespeichert()
  }

  return (
    <Modal open onClose={onClose} title={`Ziele · ${team.name}`} footer={
      <>
        <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
        <Button variant="primary" loading={speichert} onClick={() => void speichern()}>Speichern ({sel.size})</Button>
      </>
    }>
      <TextField label="" placeholder="Ziele suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
      <div className={s.zieleListe}>
        {gruppen.map((g) => {
          const ids = g.lz.map((l) => l.id)
          const alle = ids.every((id) => sel.has(id))
          return (
            <div key={g.hk.id} className={s.zieleGruppe}>
              <label className={s.zieleHk}>
                <input type="checkbox" checked={alle} onChange={() => toggleHk(ids, alle)} />
                <span>{g.hk.code && <span className={s.zieleHkCode}>{g.hk.code} · </span>}{g.hk.titel}</span>
              </label>
              {g.lz.map((l) => (
                <label key={l.id} className={s.zieleLz}>
                  <input type="checkbox" checked={sel.has(l.id)} onChange={() => toggle(l.id)} />
                  <span>{l.code && <span className={s.zieleLzCode}>{l.code}</span>} {l.text}</span>
                </label>
              ))}
            </div>
          )
        })}
        {gruppen.length === 0 && <p className="muted" style={{ padding: 'var(--sp-3)' }}>Keine Ziele gefunden.</p>}
      </div>
    </Modal>
  )
}

// ------------------------------------------------------------------ Zuteilung anlegen/bearbeiten
function ZuteilungModal({
  zuteilung, teams, benutzerId, onClose, onGespeichert,
}: {
  zuteilung: TeamZuteilung | null
  teams: Team[]
  benutzerId: string | null
  onClose: () => void
  onGespeichert: () => void
}) {
  const [teamId, setTeamId] = useState(zuteilung?.team_id ?? '')
  const [von, setVon] = useState(zuteilung?.von_datum ?? '')
  const [bis, setBis] = useState(zuteilung?.bis_datum ?? '')
  const [notiz, setNotiz] = useState(zuteilung?.notiz ?? '')
  const [speichert, setSpeichert] = useState(false)

  async function speichern() {
    if (!benutzerId || !teamId || !von) return
    setSpeichert(true)
    const zeile = { benutzer_id: benutzerId, team_id: teamId, von_datum: von, bis_datum: bis || null, notiz: notiz.trim() || null }
    if (zuteilung) await supabase.from('team_zuteilung').update(zeile).eq('id', zuteilung.id)
    else await supabase.from('team_zuteilung').insert(zeile)
    setSpeichert(false)
    onGespeichert()
  }
  async function loeschen() {
    if (!zuteilung) return
    setSpeichert(true)
    await supabase.from('team_zuteilung').delete().eq('id', zuteilung.id)
    setSpeichert(false)
    onGespeichert()
  }

  return (
    <Modal open onClose={onClose} title={zuteilung ? 'Zuteilung bearbeiten' : 'Team-Zuteilung'} footer={
      <>
        {zuteilung && <Button variant="ghost" onClick={() => void loeschen()}>Löschen</Button>}
        <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
        <Button variant="primary" loading={speichert} onClick={() => void speichern()}>Speichern</Button>
      </>
    }>
      <Select
        label="Team"
        value={teamId}
        onChange={(e) => setTeamId(e.target.value)}
        options={[{ value: '', label: '— wählen —' }, ...teams.map((t) => ({ value: t.id, label: t.name }))]}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)' }}>
        <TextField label="Von" type="date" value={von} onChange={(e) => setVon(e.target.value)} />
        <TextField label="Bis (optional)" type="date" value={bis} onChange={(e) => setBis(e.target.value)} />
      </div>
      <TextField label="Notiz (optional)" value={notiz} onChange={(e) => setNotiz(e.target.value)} />
    </Modal>
  )
}

// ------------------------------------------------------------------ Module → Semester planen
function ModulPlanModal({
  module, onClose, onGespeichert,
}: { module: Fach[]; onClose: () => void; onGespeichert: () => void }) {
  const [lokal, setLokal] = useState<Record<string, number | null>>(
    Object.fromEntries(module.map((m) => [m.id, m.semester])),
  )
  const [suche, setSuche] = useState('')
  const [speichert, setSpeichert] = useState(false)

  const q = suche.trim().toLowerCase()
  const gefiltert = module.filter((m) => !q || (m.modul_nr ?? '').toLowerCase().includes(q) || m.name.toLowerCase().includes(q))

  async function setSem(id: string, sem: number | null) {
    setLokal((c) => ({ ...c, [id]: sem }))
    // Über RPC, damit auch Lernende NUR die Semester-Spalte pflegen können
    // (SECURITY DEFINER, kapselt die Spalten-Einschränkung – siehe Migration 0008).
    await supabase.rpc('modul_semester_setzen', { p_fach_id: id, p_semester: sem })
  }

  return (
    <Modal open onClose={onClose} title="Module → Semester planen" footer={
      <Button variant="primary" loading={speichert} onClick={() => { setSpeichert(true); onGespeichert() }}>Fertig</Button>
    }>
      <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
        Gilt für alle Lernenden gleich. Änderungen werden sofort gespeichert.
      </p>
      <TextField label="" placeholder="Modul suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
      <div className={s.modPlanListe}>
        {gefiltert.map((m) => (
          <div key={m.id} className={s.modPlanRow}>
            <span className={s.modPlanNr}>{m.modul_nr}</span>
            <span className={s.modPlanName}>{m.name}</span>
            <select
              className={s.modPlanSel}
              value={lokal[m.id] ?? ''}
              onChange={(e) => void setSem(m.id, e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">–</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>Sem {n}</option>)}
            </select>
          </div>
        ))}
      </div>
    </Modal>
  )
}

// ------------------------------------------------------------------ Zuteilungs-Detail
function ZuteilungDetail({
  zuteilung, team, benutzerName, tlz, lzList, hks, istBB, onClose, onEditZeit, onEditZiele,
}: {
  zuteilung: TeamZuteilung
  team: Team | null
  benutzerName: (id: string | null) => string | null
  tlz: TeamLeistungsziel[]
  lzList: Leistungsziel[]
  hks: Handlungskompetenz[]
  istBB: boolean
  onClose: () => void
  onEditZeit: () => void
  onEditZiele: (t: Team) => void
}) {
  const zielIds = new Set(team ? tlz.filter((x) => x.team_id === team.id).map((x) => x.leistungsziel_id) : [])
  const ziele = lzList.filter((l) => zielIds.has(l.id))
  const hkById = Object.fromEntries(hks.map((h) => [h.id, h]))
  const proHk: Record<string, Leistungsziel[]> = {}
  for (const l of ziele) (proHk[l.handlungskompetenz_id] ??= []).push(l)

  return (
    <Modal open onClose={onClose} title={team?.name ?? 'Zuteilung'} footer={
      <>
        {istBB && <Button variant="ghost" onClick={onEditZeit}>Zeitraum</Button>}
        {istBB && team && <Button variant="ghost" onClick={() => onEditZiele(team)}>Ziele</Button>}
        <Button variant="secondary" onClick={onClose}>Schliessen</Button>
      </>
    }>
      <div className={s.detailMeta}>
        <div><span className={s.detailLabel}>Zeitraum</span> {fmtVoll(zuteilung.von_datum)} – {zuteilung.bis_datum ? fmtVoll(zuteilung.bis_datum) : 'offen'}</div>
        <div><span className={s.detailLabel}>Verantwortlich</span> {benutzerName(team?.verantwortlich_benutzer_id ?? null) ?? '—'}</div>
        {zuteilung.notiz && <div><span className={s.detailLabel}>Notiz</span> {zuteilung.notiz}</div>}
      </div>

      <div className={s.detailZieleTitel}>Zu erreichende Ziele ({ziele.length})</div>
      {ziele.length === 0 ? (
        <p className="muted" style={{ fontSize: '0.85rem' }}>Diesem Team sind noch keine Ziele zugewiesen.</p>
      ) : (
        <div className={s.detailZiele}>
          {Object.entries(proHk).map(([hkId, lz]) => (
            <div key={hkId} className={s.detailHk}>
              <div className={s.detailHkTitel}>
                {hkById[hkId]?.code && <span className={s.zieleHkCode}>{hkById[hkId].code} · </span>}
                {hkById[hkId]?.titel ?? 'Kompetenz'}
              </div>
              {lz.map((l) => (
                <div key={l.id} className={s.detailLz}>
                  {l.code && <span className={s.zieleLzCode}>{l.code}</span>} {l.text}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {!istBB && <Badge tone="neutral">Nur Ansicht</Badge>}
    </Modal>
  )
}
