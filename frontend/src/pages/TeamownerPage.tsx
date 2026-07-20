import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.ts'
import { useAuth } from '../auth/AuthContext.tsx'
import type {
  Benutzer,
  Handlungskompetenz,
  Leistungsziel,
  Team,
  TeamKompetenz,
  TeamLeistungsziel,
  TeamZuteilung,
} from '../lib/types.ts'
import { isoWoche, positionAnteil, wochenZwischen } from '../lib/zeitstrahl.ts'
import { Badge, Card, EmptyState, PageHeader, Spinner } from '../ui/index.ts'
import s from './Team.module.css'

const PX_PRO_WOCHE_PLAN = 9
const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
const D = (iso: string) => new Date(iso + 'T00:00:00')
const fmtVoll = (iso: string) => D(iso).toLocaleDateString('de-CH')

/**
 * Team-Dashboard für Teamowner (roles.md): NUR die dem Team zugewiesenen
 * Handlungskompetenzen/Leistungsziele und eine Timeline, wer wann im Team ist.
 * Keine Noten, Berichte, Selbsteinschätzungen oder individueller Fortschritt.
 */
export function TeamownerPage() {
  const { profil } = useAuth()
  const [teams, setTeams] = useState<Team[]>([])
  const [tlz, setTlz] = useState<TeamLeistungsziel[]>([])
  const [tk, setTk] = useState<TeamKompetenz[]>([])
  const [lzList, setLzList] = useState<Leistungsziel[]>([])
  const [hks, setHks] = useState<Handlungskompetenz[]>([])
  const [zuteilungen, setZuteilungen] = useState<TeamZuteilung[]>([])
  const [benutzer, setBenutzer] = useState<Benutzer[]>([])
  const [ladt, setLadt] = useState(true)

  useEffect(() => {
    if (!profil) return
    void (async () => {
      const [t, tlzR, tkR, lz, h, tz, b] = await Promise.all([
        supabase.from('team').select('*').order('name'),
        supabase.from('team_leistungsziel').select('*'),
        supabase.from('team_kompetenz').select('*'),
        supabase.from('leistungsziel').select('*').order('sortierung'),
        supabase.from('handlungskompetenz').select('*').order('sortierung'),
        // RLS liefert dem Teamowner nur die Zuteilungen seiner Teams.
        supabase.from('team_zuteilung').select('*').order('von_datum'),
        // RLS liefert nur die Mitglieder der eigenen Teams (+ eigenes Konto).
        supabase.from('benutzer').select('*'),
      ])
      setTeams((t.data as Team[]) ?? [])
      setTlz((tlzR.data as TeamLeistungsziel[]) ?? [])
      setTk((tkR.data as TeamKompetenz[]) ?? [])
      setLzList((lz.data as Leistungsziel[]) ?? [])
      setHks((h.data as Handlungskompetenz[]) ?? [])
      setZuteilungen((tz.data as TeamZuteilung[]) ?? [])
      setBenutzer((b.data as Benutzer[]) ?? [])
      setLadt(false)
    })()
  }, [profil])

  // Nur Teams, für die ich verantwortlich bin.
  const meineTeams = useMemo(
    () => teams.filter((t) => t.verantwortlich_benutzer_id === profil?.id),
    [teams, profil],
  )
  const benutzerName = (id: string) => benutzer.find((b) => b.id === id)?.name ?? 'Lernende(r)'
  const lzById = useMemo(() => Object.fromEntries(lzList.map((l) => [l.id, l])), [lzList])
  const hkById = useMemo(() => Object.fromEntries(hks.map((h) => [h.id, h])), [hks])

  if (ladt) return <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}><Spinner /></div>

  return (
    <div>
      <PageHeader
        eyebrow="Mein Team"
        title="Team-Übersicht"
        description="Die deinem Team zugewiesenen Handlungskompetenzen und Ziele sowie die Timeline, wann welche lernende Person bei dir im Team ist."
      />

      {meineTeams.length === 0 ? (
        <EmptyState
          title="Kein Team zugewiesen"
          text="Dir ist aktuell kein Team als verantwortliche Person zugeordnet. Die ausbildungsverantwortliche Person kann das in der Ausbildungsplanung setzen."
        />
      ) : (
        meineTeams.map((team) => (
          <TeamBlock
            key={team.id}
            team={team}
            ziele={zieleFuerTeam(team.id, tlz, tk, lzById, hkById)}
            zuteilungen={zuteilungen.filter((z) => z.team_id === team.id)}
            benutzerName={benutzerName}
          />
        ))
      )}
    </div>
  )
}

// ------------------------------------------------------------- Ziele je Team
type ZielGruppe = { hk: Handlungskompetenz | null; hkId: string; ziele: Leistungsziel[]; ganzeHk: boolean }

function zieleFuerTeam(
  teamId: string,
  tlz: TeamLeistungsziel[],
  tk: TeamKompetenz[],
  lzById: Record<string, Leistungsziel>,
  hkById: Record<string, Handlungskompetenz>,
): ZielGruppe[] {
  const proHk: Record<string, Leistungsziel[]> = {}
  for (const x of tlz.filter((r) => r.team_id === teamId)) {
    const lz = lzById[x.leistungsziel_id]
    if (lz) (proHk[lz.handlungskompetenz_id] ??= []).push(lz)
  }
  // Direkt zugewiesene ganze Handlungskompetenzen (ohne einzelne Ziele).
  const ganzeHkIds = new Set(tk.filter((r) => r.team_id === teamId).map((r) => r.handlungskompetenz_id))
  const alleHkIds = new Set<string>([...Object.keys(proHk), ...ganzeHkIds])

  return [...alleHkIds]
    .map((hkId) => ({
      hkId,
      hk: hkById[hkId] ?? null,
      ziele: (proHk[hkId] ?? []).sort((a, b) => a.sortierung - b.sortierung),
      ganzeHk: ganzeHkIds.has(hkId) && !(proHk[hkId]?.length),
    }))
    .sort((a, b) => (a.hk?.sortierung ?? 0) - (b.hk?.sortierung ?? 0))
}

function TeamBlock({
  team, ziele, zuteilungen, benutzerName,
}: {
  team: Team
  ziele: ZielGruppe[]
  zuteilungen: TeamZuteilung[]
  benutzerName: (id: string) => string
}) {
  const zielAnzahl = ziele.reduce((n, g) => n + (g.ganzeHk ? 1 : g.ziele.length), 0)
  return (
    <Card title={team.name} className={s.ownerBlock}>
      {/* Ziele */}
      <div className={s.ownerAbschnitt}>
        <div className={s.ownerAbschnittKopf}>
          Zugewiesene Ziele <Badge tone="neutral">{zielAnzahl}</Badge>
        </div>
        {ziele.length === 0 ? (
          <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
            Diesem Team sind noch keine Handlungskompetenzen oder Ziele zugewiesen.
          </p>
        ) : (
          <div className={s.detailZiele}>
            {ziele.map((g) => (
              <div key={g.hkId} className={s.detailHk}>
                <div className={s.detailHkTitel}>
                  {g.hk?.code && <span className={s.zieleHkCode}>{g.hk.code} · </span>}
                  {g.hk?.titel ?? 'Handlungskompetenz'}
                </div>
                {g.ganzeHk ? (
                  <div className={s.detailLz}>
                    <Badge tone="neutral">ganze Handlungskompetenz</Badge>
                  </div>
                ) : (
                  g.ziele.map((l) => (
                    <div key={l.id} className={s.detailLz}>
                      {l.code && <span className={s.zieleLzCode}>{l.code}</span>} {l.text}
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className={s.ownerAbschnitt}>
        <div className={s.ownerAbschnittKopf}>Timeline · wer wann im Team ist</div>
        <TeamTimeline zuteilungen={zuteilungen} benutzerName={benutzerName} />
      </div>
    </Card>
  )
}

// -------------------------------------------------------- Timeline (read-only)
function TeamTimeline({
  zuteilungen, benutzerName,
}: {
  zuteilungen: TeamZuteilung[]
  benutzerName: (id: string) => string
}) {
  if (zuteilungen.length === 0) {
    return <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>Noch keine Zuteilungen für dieses Team.</p>
  }

  // Lernende (Lanes) in Reihenfolge des frühesten Einsatzes.
  const proLern = new Map<string, TeamZuteilung[]>()
  for (const z of zuteilungen) {
    const arr = proLern.get(z.benutzer_id) ?? []
    arr.push(z)
    proLern.set(z.benutzer_id, arr)
  }
  const lernende = [...proLern.keys()].sort((a, b) => {
    const va = Math.min(...proLern.get(a)!.map((z) => D(z.von_datum).getTime()))
    const vb = Math.min(...proLern.get(b)!.map((z) => D(z.von_datum).getTime()))
    return va - vb
  })

  // Gemeinsame Zeitachse: frühester Beginn … spätestes Ende (offen -> heute).
  const heute = new Date()
  const alleVon = zuteilungen.map((z) => D(z.von_datum).getTime())
  const alleBis = zuteilungen.map((z) => (z.bis_datum ? D(z.bis_datum).getTime() : heute.getTime()))
  const globalStart = new Date(Math.min(...alleVon))
  const globalEnd = new Date(Math.max(...alleBis, ...alleVon, heute.getTime()))
  const H = Math.max(120, Math.round(wochenZwischen(globalStart, globalEnd) * PX_PRO_WOCHE_PLAN))
  const top = (d: Date) => positionAnteil(d, globalStart, globalEnd) * H

  const monate: Date[] = []
  const cur = new Date(globalStart.getFullYear(), globalStart.getMonth(), 1)
  while (cur <= globalEnd) {
    monate.push(new Date(cur))
    cur.setMonth(cur.getMonth() + 1)
  }
  const nowInRange = heute >= globalStart && heute <= globalEnd

  const cols = `96px repeat(${lernende.length}, minmax(150px, 1fr))`
  const minW = 96 + lernende.length * 150

  return (
    <div className={s.planWrap}>
      <div className={s.planHeader} style={{ gridTemplateColumns: cols, minWidth: minW }}>
        <div className={s.planHeadZeit}>Zeit</div>
        {lernende.map((id) => (
          <div key={id} className={s.planHeadLane}>
            <span className={s.planHeadName}>{benutzerName(id)}</span>
          </div>
        ))}
      </div>

      <div className={s.planGrid} style={{ gridTemplateColumns: cols, minWidth: minW, height: H }}>
        {monate.map((m, i) => (
          <div key={`ml-${i}`} className={s.planMonthLine} style={{ top: top(m) }} />
        ))}

        <div className={s.planAchse}>
          {monate.map((m, i) => (
            <div key={`lab-${i}`} className={s.planMonthLabel} style={{ top: top(m) }}>
              {MONATE[m.getMonth()]} {m.getMonth() === 0 ? m.getFullYear() : String(m.getFullYear()).slice(2)}
            </div>
          ))}
        </div>

        {lernende.map((id) => {
          const zs = proLern.get(id)!
          return (
            <div key={id} className={s.planLane}>
              {zs.map((z) => {
                const von = D(z.von_datum)
                const bis = z.bis_datum ? D(z.bis_datum) : globalEnd
                const offen = !z.bis_datum
                return (
                  <div
                    key={z.id}
                    className={s.planBar}
                    style={{ top: top(von), height: Math.max(26, top(bis) - top(von)), ['--tc' as string]: 'var(--accent)' }}
                    title={`${fmtVoll(z.von_datum)} – ${offen ? 'offen' : fmtVoll(z.bis_datum!)}`}
                  >
                    <span className={s.planBarName}>KW {isoWoche(von)}</span>
                    <span className={s.planBarKw}>{isoWoche(von)}–{offen ? 'offen' : isoWoche(bis)}</span>
                  </div>
                )
              })}
            </div>
          )
        })}

        {nowInRange && (
          <div className={s.nowLine} style={{ top: top(heute) }}>
            <span className={s.nowLabel}>Heute</span>
          </div>
        )}
      </div>
    </div>
  )
}
