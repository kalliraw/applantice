import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.ts'
import { useLernende } from '../lib/LernendenContext.tsx'
import type { Bereich, EinschaetzungStufe, Handlungskompetenz, Leistungsziel } from '../lib/types.ts'
import { Badge, Button, EmptyState, Highlight, Modal, PageHeader, Select, Spinner, TextField, Textarea } from '../ui/index.ts'
import { LernendeAuswahl } from '../components/LernendeAuswahl.tsx'
import { TAXONOMIE_INFO, TAXONOMIE_STUFEN, taxonomieTooltip } from '../lib/taxonomie.ts'
import s from './Handlungskompetenzen.module.css'

const STUFE_ORD: Record<EinschaetzungStufe, number> = { erklaert: 1, geuebt: 2, selbststaendig: 3 }

// Status einer Handlungskompetenz wird aus der Selbsteinschätzung abgeleitet:
// erledigt = ALLE Leistungsziele 'selbstständig'; angefangen = teilweiser Fortschritt.
type DStatus = 'offen' | 'angefangen' | 'erledigt'
const DSTATUS_LABEL: Record<DStatus, string> = {
  offen: 'Offen',
  angefangen: 'Angefangen',
  erledigt: 'Erledigt',
}
const DSTATUS_TONE: Record<DStatus, 'neutral' | 'warn' | 'erledigt'> = {
  offen: 'neutral',
  angefangen: 'warn',
  erledigt: 'erledigt',
}
function hkStatusAbgeleitet(
  lzList: Leistungsziel[],
  stufen: Record<string, EinschaetzungStufe>,
): DStatus {
  const total = lzList.length
  if (total === 0) return 'offen'
  const sel = lzList.filter((lz) => stufen[lz.id] === 'selbststaendig').length
  if (sel === total) return 'erledigt'
  return lzList.some((lz) => stufen[lz.id]) ? 'angefangen' : 'offen'
}

export function HandlungskompetenzenPage() {
  const { aktivId, istBB } = useLernende()
  const [bereiche, setBereiche] = useState<Bereich[]>([])
  const [hks, setHks] = useState<Handlungskompetenz[]>([])
  const [lzs, setLzs] = useState<Leistungsziel[]>([])
  const [stufen, setStufen] = useState<Record<string, EinschaetzungStufe>>({})
  const [offen, setOffen] = useState<Set<string>>(new Set())
  const [ladt, setLadt] = useState(true)
  const [modalHk, setModalHk] = useState<Handlungskompetenz | 'neu' | null>(null)
  const [loeschHk, setLoeschHk] = useState<Handlungskompetenz | null>(null)
  const [suche, setSuche] = useState('')
  const [statusFilter, setStatusFilter] = useState<'alle' | DStatus>('alle')

  async function ladeKatalog() {
    const [b, h, l] = await Promise.all([
      supabase.from('bereich').select('*').order('sortierung'),
      supabase.from('handlungskompetenz').select('*').order('sortierung'),
      supabase.from('leistungsziel').select('*').order('sortierung'),
    ])
    setBereiche((b.data as Bereich[]) ?? [])
    setHks((h.data as Handlungskompetenz[]) ?? [])
    setLzs((l.data as Leistungsziel[]) ?? [])
    setLadt(false)
  }

  useEffect(() => {
    void ladeKatalog()
  }, [])

  useEffect(() => {
    if (!aktivId) {
      setStufen({})
      return
    }
    void (async () => {
      const { data } = await supabase
        .from('selbsteinschaetzung')
        .select('leistungsziel_id, stufe')
        .eq('benutzer_id', aktivId)
      const stufeMap: Record<string, EinschaetzungStufe> = {}
      for (const row of (data as { leistungsziel_id: string; stufe: EinschaetzungStufe }[]) ?? []) {
        const cur = stufeMap[row.leistungsziel_id]
        if (!cur || STUFE_ORD[row.stufe] > STUFE_ORD[cur]) stufeMap[row.leistungsziel_id] = row.stufe
      }
      setStufen(stufeMap)
    })()
  }, [aktivId])

  const lzByHk = useMemo(() => {
    const m: Record<string, Leistungsziel[]> = {}
    for (const lz of lzs) (m[lz.handlungskompetenz_id] ??= []).push(lz)
    return m
  }, [lzs])

  function toggle(id: string) {
    setOffen((cur) => {
      const next = new Set(cur)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function loeschen(hk: Handlungskompetenz) {
    await supabase.from('handlungskompetenz').delete().eq('id', hk.id)
    setLoeschHk(null)
    void ladeKatalog()
  }

  if (ladt) return <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}><Spinner /></div>

  const kantonBereiche = bereiche
  const betrieblich = hks.filter((h) => h.quelle === 'betrieblich')

  const gruppen: { key: string; titel: string; code: string; hks: Handlungskompetenz[] }[] = [
    ...kantonBereiche.map((b) => ({
      key: b.code,
      code: b.code,
      titel: b.titel,
      hks: hks.filter((h) => h.quelle === 'kanton' && h.bereich_code === b.code),
    })),
    ...(betrieblich.length > 0 ? [{ key: 'betrieblich', code: '+', titel: 'Betriebliche Kompetenzen', hks: betrieblich }] : []),
  ]

  // Suche (inkl. Beschreibung + Leistungsziel-Texte) und Statusfilter.
  const q = suche.trim().toLowerCase()
  const hkTrifft = (hk: Handlungskompetenz, lzList: Leistungsziel[]) => {
    if (!q) return true
    if ([hk.code, hk.titel, hk.beschreibung].some((v) => (v ?? '').toLowerCase().includes(q))) return true
    return lzList.some((lz) =>
      [lz.text, lz.code, lz.taxonomiestufe, lz.modulverweise_rohtext].some((v) => (v ?? '').toLowerCase().includes(q)),
    )
  }
  const statusTrifft = (hk: Handlungskompetenz) =>
    statusFilter === 'alle' || hkStatusAbgeleitet(lzByHk[hk.id] ?? [], stufen) === statusFilter

  const gruppenGefiltert = gruppen
    .map((g) => ({ ...g, hks: g.hks.filter((hk) => hkTrifft(hk, lzByHk[hk.id] ?? []) && statusTrifft(hk)) }))
    .filter((g) => g.hks.length > 0)

  return (
    <div>
      <PageHeader
        eyebrow="Bildungsplan BiVo 21"
        title="Handlungskompetenzen"
        description="Offizieller kantonaler Bildungsplan mit Leistungszielen, plus betriebliche Kompetenzen."
        actions={
          <>
            <LernendeAuswahl />
            {istBB && (
              <Button variant="secondary" onClick={() => setModalHk('neu')}>
                + Betrieblich
              </Button>
            )}
          </>
        }
      />

      <div className={s.werkzeuge}>
        <div className={s.werkzeugeSuche}>
          <TextField
            aria-label="Suche"
            placeholder="Suche nach Stichwort, Beschreibung oder Leistungsziel …"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
          />
        </div>
        <div className={s.werkzeugeFilter}>
          <Select
            aria-label="Statusfilter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'alle' | DStatus)}
            options={[
              { value: 'alle', label: 'Alle Status' },
              { value: 'offen', label: 'Offen' },
              { value: 'angefangen', label: 'Angefangen' },
              { value: 'erledigt', label: 'Erledigt' },
            ]}
          />
        </div>
      </div>

      <details className={s.legende}>
        <summary>Was bedeuten die Taxonomiestufen K1–K6?</summary>
        <div className={s.legendeGrid}>
          {TAXONOMIE_STUFEN.map((t) => (
            <div key={t.stufe}>
              <b>{t.stufe}</b>
              {t.name} — <span className="muted">{t.beschreibung}</span>
            </div>
          ))}
        </div>
      </details>

      {gruppenGefiltert.map((g) => (
        <section key={g.key} className={s.bereich}>
          <div className={s.bereichHead}>
            <span className={s.bereichCode}>{g.code}</span>
            <span className={s.bereichTitel}>{g.titel}</span>
            <span className={s.bereichMeta}>{g.hks.length} Kompetenzen</span>
          </div>

          {g.hks.map((hk) => {
            const lzList = lzByHk[hk.id] ?? []
            const done = lzList.filter((lz) => stufen[lz.id] === 'selbststaendig').length
            const dstatus = aktivId ? hkStatusAbgeleitet(lzList, stufen) : 'offen'
            const auf = offen.has(hk.id) || q.length > 0
            return (
              <div
                key={hk.id}
                className={`${s.hk} ${dstatus === 'erledigt' ? s.hkErledigt : dstatus === 'angefangen' ? s.hkAngefangen : ''}`}
              >
                <button className={s.hkHead} onClick={() => toggle(hk.id)}>
                  <svg className={`${s.chev} ${auf ? s.chevOpen : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {hk.code && <span className={s.code}>{hk.code}</span>}
                  <span className={s.hkTitel}>
                    <Highlight text={hk.titel} query={suche} />
                  </span>
                  <span className={s.hkRight}>
                    {aktivId && lzList.length > 0 && (
                      <span className="muted" style={{ fontSize: '0.78rem' }}>
                        {done}/{lzList.length} selbstständig
                      </span>
                    )}
                    <Badge tone={hk.quelle === 'kanton' ? 'kanton' : 'betrieblich'}>
                      {hk.quelle === 'kanton' ? 'Kanton' : 'Betrieblich'}
                    </Badge>
                    {aktivId && dstatus !== 'offen' && (
                      <Badge tone={DSTATUS_TONE[dstatus]}>{DSTATUS_LABEL[dstatus]}</Badge>
                    )}
                  </span>
                </button>

                {auf && (
                  <div className={s.hkBody}>
                    {hk.beschreibung && (
                      <p className={s.hkBeschr}>
                        <Highlight text={hk.beschreibung} query={suche} />
                      </p>
                    )}

                    {istBB && hk.quelle === 'betrieblich' && (
                      <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
                        <Button size="sm" variant="secondary" onClick={() => setModalHk(hk)}>
                          Bearbeiten
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setLoeschHk(hk)}>
                          Löschen
                        </Button>
                      </div>
                    )}

                    {istBB && hk.quelle === 'betrieblich' ? (
                      <LeistungszielEditor hkId={hk.id} lzList={lzList} onChange={() => void ladeKatalog()} />
                    ) : (
                      lzList.map((lz, i) => (
                        <div key={lz.id} className={s.lz}>
                          <span className={s.lzCode}>{lz.code ?? i + 1}</span>
                          <div className={s.lzText}>
                            <Highlight text={lz.text} query={suche} />
                            <div className={s.lzMeta}>
                              {lz.taxonomiestufe && (
                                <span title={taxonomieTooltip(lz.taxonomiestufe)}>
                                  <Badge tone="neutral">{lz.taxonomiestufe}</Badge>
                                </span>
                              )}
                              {stufen[lz.id] && <Badge tone="accent">{stufen[lz.id]}</Badge>}
                              {lz.modulverweise_rohtext && (
                                <span className={s.modul}>Module: {lz.modulverweise_rohtext}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </section>
      ))}

      {gruppenGefiltert.length === 0 && (
        <EmptyState
          title="Keine Treffer"
          text={q ? `Nichts gefunden für „${suche}".` : 'Kein Eintrag für diesen Filter.'}
        />
      )}

      {istBB && modalHk !== null && (
        <BetrieblichModal
          key={modalHk === 'neu' ? 'neu' : modalHk.id}
          hk={modalHk}
          onClose={() => setModalHk(null)}
          onGespeichert={() => {
            setModalHk(null)
            void ladeKatalog()
          }}
        />
      )}

      {istBB && loeschHk && (
        <Modal
          open
          onClose={() => setLoeschHk(null)}
          title="Kompetenz löschen"
          footer={
            <>
              <Button variant="ghost" onClick={() => setLoeschHk(null)}>Abbrechen</Button>
              <Button variant="danger" onClick={() => void loeschen(loeschHk)}>Löschen</Button>
            </>
          }
        >
          <p className="muted" style={{ margin: 0 }}>
            „{loeschHk.titel}" wirklich löschen? Zugehörige Status-Einträge werden mitentfernt. Das
            kann nicht rückgängig gemacht werden.
          </p>
        </Modal>
      )}
    </div>
  )
}

function BetrieblichModal({
  hk,
  onClose,
  onGespeichert,
}: {
  hk: Handlungskompetenz | 'neu'
  onClose: () => void
  onGespeichert: () => void
}) {
  const bestehend = hk === 'neu' ? null : hk
  const [titel, setTitel] = useState(bestehend?.titel ?? '')
  const [beschreibung, setBeschreibung] = useState(bestehend?.beschreibung ?? '')
  const [speichert, setSpeichert] = useState(false)

  async function speichern() {
    if (!titel.trim()) return
    setSpeichert(true)
    if (bestehend) {
      await supabase
        .from('handlungskompetenz')
        .update({ titel: titel.trim(), beschreibung: beschreibung.trim() || null })
        .eq('id', bestehend.id)
    } else {
      await supabase.from('handlungskompetenz').insert({
        titel: titel.trim(),
        beschreibung: beschreibung.trim() || null,
        bereich_code: null,
        quelle: 'betrieblich',
      })
    }
    setSpeichert(false)
    onGespeichert()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={bestehend ? 'Betriebliche Kompetenz bearbeiten' : 'Neue betriebliche Kompetenz'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" loading={speichert} onClick={() => void speichern()}>Speichern</Button>
        </>
      }
    >
      <TextField
        label="Titel"
        value={titel}
        onChange={(e) => setTitel(e.target.value)}
        placeholder="z.B. Internes Ticketsystem betreiben"
      />
      <Textarea
        label="Beschreibung (optional)"
        value={beschreibung}
        onChange={(e) => setBeschreibung(e.target.value)}
      />
      <p className="muted" style={{ fontSize: '0.8rem', margin: 0 }}>
        Betriebliche Kompetenzen sind für alle Lernenden sichtbar und komplett getrennt von den
        kantonalen Bereichen.
      </p>
    </Modal>
  )
}

const TAXONOMIE = ['', 'K1', 'K2', 'K3', 'K4', 'K5', 'K6']

/** Leistungsziele einer betrieblichen Kompetenz pflegen (nur Berufsbildner). */
function LeistungszielEditor({
  hkId,
  lzList,
  onChange,
}: {
  hkId: string
  lzList: Leistungsziel[]
  onChange: () => void
}) {
  const [text, setText] = useState('')
  const [tax, setTax] = useState('')
  const [speichert, setSpeichert] = useState(false)

  async function add() {
    if (!text.trim()) return
    setSpeichert(true)
    await supabase.from('leistungsziel').insert({
      handlungskompetenz_id: hkId,
      text: text.trim(),
      taxonomiestufe: tax || null,
      sortierung: lzList.length + 1,
    })
    setSpeichert(false)
    setText('')
    setTax('')
    onChange()
  }
  async function updateText(id: string, val: string) {
    if (!val.trim()) return
    await supabase.from('leistungsziel').update({ text: val.trim() }).eq('id', id)
    onChange()
  }
  async function updateTax(id: string, val: string) {
    await supabase.from('leistungsziel').update({ taxonomiestufe: val || null }).eq('id', id)
    onChange()
  }
  async function del(id: string) {
    await supabase.from('leistungsziel').delete().eq('id', id)
    onChange()
  }

  return (
    <div>
      <div className={s.lzEditorTitel}>Leistungsziele ({lzList.length})</div>
      {lzList.map((lz) => (
        <div key={lz.id} className={s.lzEditRow}>
          <textarea
            className={s.lzEditText}
            rows={2}
            defaultValue={lz.text}
            onBlur={(e) => void updateText(lz.id, e.target.value)}
          />
          <select
            className={s.lzTax}
            defaultValue={lz.taxonomiestufe ?? ''}
            onChange={(e) => void updateTax(lz.id, e.target.value)}
            aria-label="Taxonomiestufe"
          >
            {TAXONOMIE.map((t) => (
              <option key={t} value={t}>
                {t ? `${t} – ${TAXONOMIE_INFO[t]?.name ?? ''}` : '– keine –'}
              </option>
            ))}
          </select>
          <button className={s.lzDel} onClick={() => void del(lz.id)} aria-label="Leistungsziel löschen">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
      <div className={s.lzEditRow}>
        <textarea
          className={s.lzEditText}
          rows={2}
          placeholder="Neues Leistungsziel …"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <select className={s.lzTax} value={tax} onChange={(e) => setTax(e.target.value)} aria-label="Taxonomiestufe">
          {TAXONOMIE.map((t) => (
            <option key={t} value={t}>
              {t || '–'}
            </option>
          ))}
        </select>
        <Button size="sm" variant="secondary" loading={speichert} onClick={() => void add()}>
          +
        </Button>
      </div>
    </div>
  )
}
