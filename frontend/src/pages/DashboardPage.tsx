import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.ts'
import { useLernende } from '../lib/LernendenContext.tsx'
import type { EinschaetzungStufe } from '../lib/types.ts'
import { Card, EmptyState, PageHeader, ProgressBar, Spinner } from '../ui/index.ts'
import { LernendeAuswahl } from '../components/LernendeAuswahl.tsx'
import s from './Dashboard.module.css'

type Kennzahlen = {
  hkTotal: number
  hkErledigt: number
  lzTotal: number
  lzEingeschaetzt: number
  offeneBerichte: number
}

function ausbildungszeit(start: string) {
  const startD = new Date(start + 'T00:00:00')
  const endD = new Date(startD)
  endD.setFullYear(endD.getFullYear() + 4)
  const now = new Date()
  const spanne = endD.getTime() - startD.getTime()
  const elapsed = now.getTime() - startD.getTime()
  const pct = Math.max(0, Math.min(100, (elapsed / spanne) * 100))
  const monate = (now.getFullYear() - startD.getFullYear()) * 12 + (now.getMonth() - startD.getMonth())
  const semester = Math.max(1, Math.min(8, Math.floor(monate / 6) + 1))
  const fmt = (d: Date) => d.toLocaleDateString('de-CH')
  return { pct, semester, start: fmt(startD), ende: fmt(endD) }
}

export function DashboardPage() {
  const { aktiv, aktivId } = useLernende()
  const [kz, setKz] = useState<Kennzahlen | null>(null)
  const [ladt, setLadt] = useState(true)

  useEffect(() => {
    if (!aktivId) {
      setKz(null)
      setLadt(false)
      return
    }
    setLadt(true)
    void (async () => {
      const [hk, lzRows, einsch, berichte] = await Promise.all([
        supabase.from('handlungskompetenz').select('id', { count: 'exact', head: true }),
        supabase.from('leistungsziel').select('id, handlungskompetenz_id'),
        supabase.from('selbsteinschaetzung').select('leistungsziel_id, stufe').eq('benutzer_id', aktivId),
        supabase.from('bildungsbericht').select('semester, typ').eq('benutzer_id', aktivId).eq('typ', 'semester'),
      ])

      // Höchste erreichte Stufe je Leistungsziel.
      const ord: Record<EinschaetzungStufe, number> = { erklaert: 1, geuebt: 2, selbststaendig: 3 }
      const stufe: Record<string, EinschaetzungStufe> = {}
      for (const r of (einsch.data as { leistungsziel_id: string; stufe: EinschaetzungStufe }[]) ?? []) {
        const cur = stufe[r.leistungsziel_id]
        if (!cur || ord[r.stufe] > ord[cur]) stufe[r.leistungsziel_id] = r.stufe
      }

      // Erledigt = alle Leistungsziele einer Handlungskompetenz sind 'selbstständig'.
      const lzArr = (lzRows.data as { id: string; handlungskompetenz_id: string }[]) ?? []
      const proHk: Record<string, string[]> = {}
      for (const lz of lzArr) (proHk[lz.handlungskompetenz_id] ??= []).push(lz.id)
      let hkErledigt = 0
      for (const ids of Object.values(proHk)) {
        if (ids.length > 0 && ids.every((id) => stufe[id] === 'selbststaendig')) hkErledigt++
      }

      const semesterMitBericht = new Set<number>()
      for (const r of (berichte.data as { semester: number }[]) ?? []) semesterMitBericht.add(r.semester)

      const start = aktiv?.ausbildungsstart
      const aktSem = start ? ausbildungszeit(start).semester : 0
      let offen = 0
      for (let sem = 1; sem <= aktSem; sem++) if (!semesterMitBericht.has(sem)) offen++

      setKz({
        hkTotal: hk.count ?? 0,
        hkErledigt,
        lzTotal: lzArr.length,
        lzEingeschaetzt: Object.keys(stufe).length,
        offeneBerichte: offen,
      })
      setLadt(false)
    })()
  }, [aktivId, aktiv?.ausbildungsstart])

  const zeit = aktiv?.ausbildungsstart ? ausbildungszeit(aktiv.ausbildungsstart) : null

  return (
    <div>
      <PageHeader
        eyebrow="Aktueller Stand"
        title="Dashboard"
        description="Ausbildungszeit und Kompetenzfortschritt auf einen Blick."
        actions={<LernendeAuswahl />}
      />

      {!aktivId ? (
        <EmptyState title="Kein Lernender ausgewählt" text="Bitte oben eine lernende Person wählen." />
      ) : ladt || !kz ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}><Spinner /></div>
      ) : (
        <>
          <Card className={s.bars}>
            {zeit ? (
              <ProgressBar
                label="Ausbildungszeit"
                value={zeit.pct}
                valueLabel={`Semester ${zeit.semester} von 8`}
                caption={`${zeit.start} – ${zeit.ende}`}
              />
            ) : (
              <ProgressBar
                label="Ausbildungszeit"
                value={0}
                tone="gelb"
                caption="Ausbildungsstart noch nicht erfasst"
              />
            )}
            <ProgressBar
              label="Handlungskompetenzen erledigt"
              value={kz.hkTotal ? (kz.hkErledigt / kz.hkTotal) * 100 : 0}
              valueLabel={`${kz.hkErledigt} / ${kz.hkTotal}`}
            />
          </Card>

          <div className={s.statsGrid}>
            <Card className={s.stat}>
              <div className={s.statLabel}>Aktuelles Semester</div>
              <div className={s.statValue}>{zeit ? zeit.semester : '–'}</div>
              <div className={s.statSub}>von 8</div>
            </Card>
            <Card className={s.stat}>
              <div className={s.statLabel}>Kompetenzen erledigt</div>
              <div className={s.statValue}>{kz.hkErledigt}</div>
              <div className={s.statSub}>von {kz.hkTotal} Handlungskompetenzen</div>
            </Card>
            <Card className={s.stat}>
              <div className={s.statLabel}>Ziele eingeschätzt</div>
              <div className={s.statValue}>{kz.lzEingeschaetzt}</div>
              <div className={s.statSub}>von {kz.lzTotal} Leistungszielen</div>
            </Card>
            <Card className={s.stat}>
              <div className={s.statLabel}>Offene Berichte</div>
              <div className={s.statValue}>{kz.offeneBerichte}</div>
              <div className={s.statSub}>fällige Bildungsberichte</div>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
