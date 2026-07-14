import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.ts'
import { useAuth } from '../auth/AuthContext.tsx'
import { useLernende } from '../lib/LernendenContext.tsx'
import type { Bereich, EinschaetzungStufe, Handlungskompetenz, Leistungsziel, Selbsteinschaetzung } from '../lib/types.ts'
import { Card, EmptyState, PageHeader, Select, Spinner } from '../ui/index.ts'
import { LernendeAuswahl } from '../components/LernendeAuswahl.tsx'
import s from './Selbsteinschaetzung.module.css'

const STUFEN: { key: EinschaetzungStufe; label: string; ord: number }[] = [
  { key: 'erklaert', label: 'Erklärt', ord: 1 },
  { key: 'geuebt', label: 'Geübt', ord: 2 },
  { key: 'selbststaendig', label: 'Selbstständig', ord: 3 },
]

/** lzId -> stufe -> frühestes erreicht_am */
type StufenMap = Record<string, Partial<Record<EinschaetzungStufe, string>>>

export function SelbsteinschaetzungPage() {
  const { profil } = useAuth()
  const { aktiv, aktivId } = useLernende()
  const [bereiche, setBereiche] = useState<Bereich[]>([])
  const [hks, setHks] = useState<Handlungskompetenz[]>([])
  const [lzs, setLzs] = useState<Leistungsziel[]>([])
  const [karte, setKarte] = useState<StufenMap>({})
  const [hkId, setHkId] = useState<string>('')
  const [ladt, setLadt] = useState(true)

  const istEigen = !!aktiv && !!profil && aktiv.id === profil.id

  useEffect(() => {
    void (async () => {
      const [b, h, l] = await Promise.all([
        supabase.from('bereich').select('*').order('sortierung'),
        supabase.from('handlungskompetenz').select('*').order('sortierung'),
        supabase.from('leistungsziel').select('*').order('sortierung'),
      ])
      const hkListe = (h.data as Handlungskompetenz[]) ?? []
      setBereiche((b.data as Bereich[]) ?? [])
      setHks(hkListe)
      setLzs((l.data as Leistungsziel[]) ?? [])
      setHkId((cur) => cur || hkListe[0]?.id || '')
      setLadt(false)
    })()
  }, [])

  async function ladeEinschaetzung() {
    if (!aktivId) return setKarte({})
    const { data } = await supabase
      .from('selbsteinschaetzung')
      .select('leistungsziel_id, stufe, erreicht_am')
      .eq('benutzer_id', aktivId)
    const map: StufenMap = {}
    for (const r of (data as Pick<Selbsteinschaetzung, 'leistungsziel_id' | 'stufe' | 'erreicht_am'>[]) ?? []) {
      const eintrag = (map[r.leistungsziel_id] ??= {})
      if (!eintrag[r.stufe] || r.erreicht_am < eintrag[r.stufe]!) eintrag[r.stufe] = r.erreicht_am
    }
    setKarte(map)
  }
  useEffect(() => {
    void ladeEinschaetzung()
  }, [aktivId])

  const lzByHk = useMemo(() => {
    const m: Record<string, Leistungsziel[]> = {}
    for (const lz of lzs) (m[lz.handlungskompetenz_id] ??= []).push(lz)
    return m
  }, [lzs])

  async function erfasse(lzId: string, stufe: EinschaetzungStufe) {
    if (!istEigen || !aktivId) return
    if (karte[lzId]?.[stufe]) return // schon erreicht
    const heute = new Date().toISOString().slice(0, 10)
    setKarte((cur) => ({ ...cur, [lzId]: { ...cur[lzId], [stufe]: heute } })) // optimistisch
    await supabase.from('selbsteinschaetzung').insert({
      benutzer_id: aktivId,
      leistungsziel_id: lzId,
      stufe,
      erreicht_am: heute,
    })
  }

  if (ladt) return <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}><Spinner /></div>

  const hk = hks.find((h) => h.id === hkId)
  const lzList = hk ? lzByHk[hk.id] ?? [] : []

  const hkOptions = hks.map((h) => {
    const ber = bereiche.find((b) => b.code === h.bereich_code)
    const prefix = h.quelle === 'kanton' && ber ? `${h.code} · ` : h.quelle === 'betrieblich' ? 'Betrieblich · ' : ''
    return { value: h.id, label: `${prefix}${h.titel}` }
  })

  return (
    <div>
      <PageHeader
        eyebrow="Kompetenzraster"
        title="Selbsteinschätzung"
        description="Pro Leistungsziel: Erklärt → Geübt → Selbstständig. Jede erreichte Stufe wird mit Datum festgehalten und bleibt im Verlauf."
        actions={<LernendeAuswahl />}
      />

      {!aktivId ? (
        <EmptyState title="Kein Lernender ausgewählt" text="Bitte oben eine lernende Person wählen." />
      ) : (
        <>
          <div className={s.toolbar}>
            <div style={{ minWidth: 320 }}>
              <Select label="Handlungskompetenz" value={hkId} onChange={(e) => setHkId(e.target.value)} options={hkOptions} />
            </div>
          </div>

          {!istEigen && (
            <p className={s.hint}>
              Ansicht der Selbsteinschätzung von <strong>{aktiv?.name}</strong> (schreibgeschützt – nur die
              lernende Person selbst schätzt ein).
            </p>
          )}

          {hk && (
            <Card>
              <h2 className={s.hkTitel}>{hk.titel}</h2>
              {lzList.length === 0 && <p className="muted">Keine Leistungsziele.</p>}
              {lzList.map((lz) => {
                const erreicht = karte[lz.id] ?? {}
                return (
                  <div key={lz.id} className={s.lzRow}>
                    <div className={s.lzTop}>
                      <span className={s.lzCode}>{lz.code}</span>
                      <span className={s.lzText}>{lz.text}</span>
                    </div>
                    <div className={s.stepper}>
                      {STUFEN.map((stu) => {
                        const datum = erreicht[stu.key]
                        const achievedClass = datum ? s[`achieved${stu.ord}` as 'achieved1' | 'achieved2' | 'achieved3'] : ''
                        const clickable = istEigen && !datum
                        return (
                          <button
                            key={stu.key}
                            className={`${s.step} ${achievedClass} ${clickable ? s.clickable : ''}`}
                            onClick={() => erfasse(lz.id, stu.key)}
                            disabled={!clickable && !datum}
                            title={clickable ? `Als „${stu.label}" erfassen (heute)` : undefined}
                          >
                            {stu.label}
                            {datum && <span className={s.stepDate}>seit {datum}</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </Card>
          )}
        </>
      )}
    </div>
  )
}
