import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.ts'
import { useAuth } from '../auth/AuthContext.tsx'
import { useLernende } from '../lib/LernendenContext.tsx'
import type {
  BerichtKennzahlen,
  BerichtStatus,
  BerichtTyp,
  Bildungsbericht,
  EinschaetzungStufe,
} from '../lib/types.ts'
import { berechneNotenstand, rundeAufZehntel } from '../lib/noten.ts'
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Select, Spinner, Textarea } from '../ui/index.ts'
import { LernendeAuswahl } from '../components/LernendeAuswahl.tsx'
import { sendeMailEreignis } from '../lib/mail.ts'
import { berichtPdfBase64 } from '../lib/berichtPdf.ts'
import s from './Bildungsbericht.module.css'

// Feldkatalog je Berichtstyp -------------------------------------------------
type Feld = { key: string; label: string }
const FELDER_SEMESTER: Feld[] = [
  { key: 'fachkompetenz', label: 'Fachkompetenz / fachliche Entwicklung' },
  { key: 'methoden', label: 'Methoden- & Arbeitskompetenz' },
  { key: 'sozial', label: 'Sozial- & Selbstkompetenz' },
  { key: 'massnahmen', label: 'Vereinbarte Massnahmen & Ziele' },
]
const FELDER_SONDER: Feld[] = [
  { key: 'anlass', label: 'Anlass / Grund des Sonderberichts' },
  { key: 'feststellungen', label: 'Feststellungen & Beobachtungen' },
  { key: 'massnahmen', label: 'Vereinbarte Massnahmen' },
  { key: 'frist', label: 'Frist / nächste Überprüfung' },
]
const felderFuer = (typ: BerichtTyp): Feld[] => (typ === 'sonderbericht' ? FELDER_SONDER : FELDER_SEMESTER)

const TYP_LABEL: Record<BerichtTyp, string> = {
  semester: 'Semesterbericht',
  sonderbericht: 'Sonderbericht',
}

const fmtNote = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(1))

// Beim Abschliessen: Bericht als PDF an den abschliessenden Berufsbildner mailen
// (Empfänger-Auflösung macht der mailer via erfasst_von). Best-effort.
async function sendeBerichtAbgeschlossen(args: {
  berichtId: string
  typ: BerichtTyp
  semester: number | null
  datum: string
  lernendeName: string
  inhalt: Record<string, string>
  kennzahlen: Partial<BerichtKennzahlen>
}) {
  try {
    const pdfBase64 = berichtPdfBase64({
      typLabel: TYP_LABEL[args.typ],
      semester: args.semester,
      datum: args.datum,
      lernendeName: args.lernendeName,
      felder: felderFuer(args.typ).map((f) => ({ label: f.label, text: args.inhalt[f.key] ?? '' })),
      kennzahlen: args.kennzahlen,
    })
    await sendeMailEreignis('bericht_abgeschlossen', args.berichtId, { pdfBase64 })
  } catch (e) {
    console.warn('[mail] Bericht-PDF/Versand fehlgeschlagen:', (e as Error).message)
  }
}

// Aktuellen Ausbildungsstand laden (erledigte Kompetenzen, LZ-Fortschritt,
// Vornote) – wird beim Erstellen/Abschliessen in den Bericht eingefroren.
async function ladeKennzahlen(benutzerId: string, machtBm: boolean): Promise<BerichtKennzahlen> {
  const [hkRes, lzRes, einschRes, faecherRes, kompRes, lbRes, noteRes] = await Promise.all([
    supabase.from('handlungskompetenz').select('id', { count: 'exact', head: true }),
    supabase.from('leistungsziel').select('id, handlungskompetenz_id'),
    supabase.from('selbsteinschaetzung').select('leistungsziel_id, stufe').eq('benutzer_id', benutzerId),
    supabase.from('fach').select('*').eq('aktiv', true),
    supabase.from('notenkomponente').select('*'),
    supabase.from('leistungsbeurteilung').select('*').eq('benutzer_id', benutzerId),
    supabase.from('note').select('*').eq('benutzer_id', benutzerId).not('notenkomponente_id', 'is', null),
  ])

  // Höchste erreichte Stufe je Leistungsziel.
  const ord: Record<EinschaetzungStufe, number> = { erklaert: 1, geuebt: 2, selbststaendig: 3 }
  const stufe: Record<string, EinschaetzungStufe> = {}
  for (const r of (einschRes.data as { leistungsziel_id: string; stufe: EinschaetzungStufe }[]) ?? []) {
    const cur = stufe[r.leistungsziel_id]
    if (!cur || ord[r.stufe] > ord[cur]) stufe[r.leistungsziel_id] = r.stufe
  }
  let lzErklaert = 0
  let lzGeuebt = 0
  let lzSelbststaendig = 0
  for (const st of Object.values(stufe)) {
    if (st === 'selbststaendig') lzSelbststaendig++
    else if (st === 'geuebt') lzGeuebt++
    else lzErklaert++
  }

  // Erledigt = alle Leistungsziele einer Handlungskompetenz sind 'selbstständig'.
  const lzArr = (lzRes.data as { id: string; handlungskompetenz_id: string }[]) ?? []
  const proHk: Record<string, string[]> = {}
  for (const lz of lzArr) (proHk[lz.handlungskompetenz_id] ??= []).push(lz.id)
  let hkErledigt = 0
  for (const ids of Object.values(proHk)) {
    if (ids.length > 0 && ids.every((id) => stufe[id] === 'selbststaendig')) hkErledigt++
  }

  // Vornote(n) exakt wie im Notenrechner.
  const komponenten = (kompRes.data as Parameters<typeof berechneNotenstand>[0]) ?? []
  const faecher = (faecherRes.data as Parameters<typeof berechneNotenstand>[1]) ?? []
  const lbsByFach: Record<string, { wert: number; gewicht: number }[]> = {}
  for (const l of (lbRes.data as { fach_id: string; wert: number; gewicht: number }[]) ?? []) {
    (lbsByFach[l.fach_id] ??= []).push({ wert: l.wert, gewicht: l.gewicht })
  }
  const ipaKomp = komponenten.find((k) => k.code === 'IPA')
  let ipaWert: number | null = null
  for (const n of (noteRes.data as { notenkomponente_id: string; wert: number }[]) ?? []) {
    if (n.notenkomponente_id === ipaKomp?.id) ipaWert = n.wert
  }
  const efz = berechneNotenstand(komponenten, faecher, lbsByFach, ipaWert, 'EFZ', machtBm)
  const bm = machtBm ? berechneNotenstand(komponenten, faecher, lbsByFach, ipaWert, 'BM', machtBm) : null

  return {
    hkErledigt,
    hkTotal: hkRes.count ?? 0,
    lzTotal: lzArr.length,
    lzErklaert,
    lzGeuebt,
    lzSelbststaendig,
    vornoteEfz: efz.total != null ? rundeAufZehntel(efz.total) : null,
    vornoteBm: bm && bm.total != null ? rundeAufZehntel(bm.total) : null,
    machtBm,
  }
}

function KennzahlenAnzeige({ k }: { k: Partial<BerichtKennzahlen> }) {
  if (!k || Object.keys(k).length === 0) return null
  return (
    <div className={s.kennzahlen}>
      <div className={s.kzItem}>
        <div className={s.kzWert}>
          {k.hkErledigt ?? 0}
          <span className={s.kzTotal}> / {k.hkTotal ?? 0}</span>
        </div>
        <div className={s.kzLabel}>Kompetenzen erledigt</div>
      </div>
      <div className={s.kzItem}>
        <div className={s.kzWert}>
          {k.lzSelbststaendig ?? 0}
          <span className={s.kzTotal}> / {k.lzTotal ?? 0}</span>
        </div>
        <div className={s.kzLabel}>Ziele selbstständig</div>
      </div>
      <div className={s.kzItem}>
        <div className={`${s.kzWert} ${s.kzNote}`}>{fmtNote(k.vornoteEfz)}</div>
        <div className={s.kzLabel}>Vornote EFZ</div>
      </div>
      {k.machtBm && (
        <div className={s.kzItem}>
          <div className={`${s.kzWert} ${s.kzNote}`}>{fmtNote(k.vornoteBm)}</div>
          <div className={s.kzLabel}>Vornote BM</div>
        </div>
      )}
    </div>
  )
}

const hatKennzahlen = (b: Bildungsbericht) => !!b.kennzahlen && Object.keys(b.kennzahlen).length > 0

// Snapshot des vorangehenden Semesters – Basis für die Entwicklungs-Deltas.
function vorSemesterStand(b: Bildungsbericht, alle: Bildungsbericht[]): Partial<BerichtKennzahlen> | null {
  if (b.typ !== 'semester' || b.semester == null) return null
  const sem = b.semester
  const kandidaten = alle.filter(
    (x) => x.typ === 'semester' && x.semester != null && x.semester < sem && hatKennzahlen(x),
  )
  if (kandidaten.length === 0) return null
  const maxSem = Math.max(...kandidaten.map((x) => x.semester!))
  const gleiche = kandidaten
    .filter((x) => x.semester === maxSem)
    .sort((x, y) => {
      // Bevorzugt abgeschlossen, sonst zuletzt erstellt.
      const ax = x.status === 'abgeschlossen' ? 0 : 1
      const ay = y.status === 'abgeschlossen' ? 0 : 1
      if (ax !== ay) return ax - ay
      return x.erstellt_am < y.erstellt_am ? 1 : -1
    })
  return gleiche[0].kennzahlen
}

function Delta({ d, digits = 0 }: { d: number | null; digits?: number }) {
  if (d == null || Math.abs(d) < (digits ? 0.05 : 0.5)) return null
  const pos = d > 0
  const txt = digits ? Math.abs(d).toFixed(digits) : String(Math.abs(d))
  return (
    <span className={pos ? s.deltaUp : s.deltaDown}>
      {pos ? '▲' : '▼'} {pos ? '+' : '−'}
      {txt}
    </span>
  )
}

// Eingefrorener Stand eines Berichts, rechts in der Karte – mit Veränderung
// gegenüber dem Vorsemester, damit die Entwicklung über die Semester sichtbar wird.
function SnapshotPanel({ k, prev }: { k: Partial<BerichtKennzahlen>; prev: Partial<BerichtKennzahlen> | null }) {
  const leer = !k || Object.keys(k).length === 0
  const d = (a?: number | null, b?: number | null) => (a != null && b != null ? a - b : null)
  return (
    <aside className={s.snapshot}>
      <div className={s.snapTitel}>Stand bei Erstellung</div>
      {leer ? (
        <div className={s.snapLeer}>Für diesen Bericht wurde kein Stand erfasst.</div>
      ) : (
        <>
          <div className={s.snapItem}>
            <div className={s.snapLabel}>Kompetenzen erledigt</div>
            <div className={s.snapValRow}>
              <span className={s.snapZahl}>
                {k.hkErledigt ?? 0}
                <span className={s.snapTotal}>/{k.hkTotal ?? 0}</span>
              </span>
              <Delta d={d(k.hkErledigt, prev?.hkErledigt)} />
            </div>
          </div>
          <div className={s.snapItem}>
            <div className={s.snapLabel}>Ziele selbstständig</div>
            <div className={s.snapValRow}>
              <span className={s.snapZahl}>
                {k.lzSelbststaendig ?? 0}
                <span className={s.snapTotal}>/{k.lzTotal ?? 0}</span>
              </span>
              <Delta d={d(k.lzSelbststaendig, prev?.lzSelbststaendig)} />
            </div>
          </div>
          <div className={s.snapItem}>
            <div className={s.snapLabel}>Vornote EFZ</div>
            <div className={s.snapValRow}>
              <span className={`${s.snapZahl} ${s.snapNote}`}>{fmtNote(k.vornoteEfz)}</span>
              <Delta d={d(k.vornoteEfz, prev?.vornoteEfz)} digits={1} />
            </div>
          </div>
          {k.machtBm && (
            <div className={s.snapItem}>
              <div className={s.snapLabel}>Vornote BM</div>
              <div className={s.snapValRow}>
                <span className={`${s.snapZahl} ${s.snapNote}`}>{fmtNote(k.vornoteBm)}</span>
                <Delta d={d(k.vornoteBm, prev?.vornoteBm)} digits={1} />
              </div>
            </div>
          )}
          {prev && <div className={s.snapVgl}>Δ gegenüber Vorsemester</div>}
        </>
      )}
    </aside>
  )
}

export function BildungsberichtPage() {
  const { profil } = useAuth()
  const { aktiv, aktivId, istBB } = useLernende()
  const darfBearbeiten = istBB // nur Berufsbildner legt an/bearbeitet; Lernende lesen nur

  const [berichte, setBerichte] = useState<Bildungsbericht[]>([])
  const [ladt, setLadt] = useState(true)
  const [modal, setModal] = useState<{ bestehend: Bildungsbericht | null } | null>(null)
  const [abschluss, setAbschluss] = useState<Bildungsbericht | null>(null)
  const [busy, setBusy] = useState(false)

  async function laden() {
    if (!aktivId) {
      setBerichte([])
      setLadt(false)
      return
    }
    const { data } = await supabase
      .from('bildungsbericht')
      .select('*')
      .eq('benutzer_id', aktivId)
      .order('erstellt_am', { ascending: false })
    setBerichte((data as Bildungsbericht[]) ?? [])
    setLadt(false)
  }
  useEffect(() => {
    setLadt(true)
    void laden()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktivId])

  async function abschliessen(b: Bildungsbericht) {
    if (!aktivId) return
    setBusy(true)
    const kennzahlen = await ladeKennzahlen(aktivId, !!aktiv?.macht_bm)
    await supabase
      .from('bildungsbericht')
      .update({ status: 'abgeschlossen', kennzahlen })
      .eq('id', b.id)
    await sendeBerichtAbgeschlossen({
      berichtId: b.id,
      typ: b.typ,
      semester: b.semester,
      datum: b.datum,
      lernendeName: aktiv?.name ?? '',
      inhalt: (b.inhalt ?? {}) as Record<string, string>,
      kennzahlen,
    })
    setBusy(false)
    setAbschluss(null)
    void laden()
  }

  return (
    <div>
      <PageHeader
        eyebrow="Art. 13 BiVo"
        title="Bildungsbericht"
        description="Semesterbericht (Pflicht) und anlassbezogener Sonderbericht. Jeder Bericht hält den Ausbildungsstand automatisch fest. Ein abgeschlossener Bericht ist unveränderlich."
        actions={
          <>
            <LernendeAuswahl />
            {darfBearbeiten && aktivId && (
              <Button variant="primary" onClick={() => setModal({ bestehend: null })}>+ Bericht</Button>
            )}
          </>
        }
      />

      {ladt ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}><Spinner /></div>
      ) : !aktivId ? (
        <EmptyState title="Kein Lernender ausgewählt" text="Bitte oben eine lernende Person wählen." />
      ) : berichte.length === 0 ? (
        <EmptyState
          title="Noch kein Bildungsbericht"
          text={
            darfBearbeiten
              ? 'Pro Semester ist ein Bildungsbericht Pflicht (Art. 13 BiVo). Sonderberichte bei Bedarf.'
              : 'Es wurde noch kein Bildungsbericht erstellt. Berichte werden vom Berufsbildner erfasst.'
          }
          action={darfBearbeiten ? <Button variant="primary" onClick={() => setModal({ bestehend: null })}>Ersten Bericht erstellen</Button> : undefined}
        />
      ) : (
        <div className={s.liste}>
          {berichte.map((b) => {
            const inhalt = (b.inhalt ?? {}) as Record<string, string>
            const offen = b.status === 'entwurf'
            return (
              <Card key={b.id} className={offen ? s.cardEntwurf : undefined}>
                <div className={s.kopf}>
                  <Badge tone={b.typ === 'sonderbericht' ? 'warn' : 'accent'}>{TYP_LABEL[b.typ]}</Badge>
                  {b.typ === 'semester' && b.semester != null && (
                    <span className={s.semester}>Semester {b.semester}</span>
                  )}
                  <Badge tone={offen ? 'neutral' : 'erledigt'}>{offen ? 'Entwurf' : 'Abgeschlossen'}</Badge>
                  <span className={s.datum}>{b.datum}</span>
                </div>

                <div className={s.koerper}>
                  <div className={s.texte}>
                    {felderFuer(b.typ).map((f) => (
                      <div key={f.key} className={s.feld}>
                        <div className={s.feldLabel}>{f.label}</div>
                        <div className={inhalt[f.key] ? s.feldText : s.feldLeer}>
                          {inhalt[f.key] || 'keine Angabe'}
                        </div>
                      </div>
                    ))}
                  </div>
                  <SnapshotPanel k={b.kennzahlen ?? {}} prev={vorSemesterStand(b, berichte)} />
                </div>

                {darfBearbeiten && offen && (
                  <div className={s.cardFoot}>
                    <Button variant="ghost" onClick={() => setModal({ bestehend: b })}>Bearbeiten</Button>
                    <Button variant="primary" onClick={() => setAbschluss(b)}>Abschliessen</Button>
                  </div>
                )}
                {!offen && (
                  <div className={s.gesperrt}>
                    <LockIcon /> Abgeschlossen – unveränderlich
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {darfBearbeiten && aktivId && modal && (
        <BerichtModal
          benutzerId={aktivId}
          machtBm={!!aktiv?.macht_bm}
          erfasstVon={profil?.id ?? null}
          lernendeName={aktiv?.name ?? ''}
          bestehend={modal.bestehend}
          onClose={() => setModal(null)}
          onGespeichert={() => {
            setModal(null)
            void laden()
          }}
        />
      )}

      {abschluss && (
        <Modal
          open
          onClose={() => setAbschluss(null)}
          title="Bericht abschliessen"
          footer={
            <>
              <Button variant="ghost" onClick={() => setAbschluss(null)}>Abbrechen</Button>
              <Button variant="primary" loading={busy} onClick={() => void abschliessen(abschluss)}>Abschliessen</Button>
            </>
          }
        >
          <p>
            Der Bericht wird mit dem <b>aktuellen Ausbildungsstand</b> eingefroren und ist danach
            <b> nicht mehr änderbar</b>. Fortfahren?
          </p>
        </Modal>
      )}
    </div>
  )
}

function BerichtModal({
  benutzerId,
  machtBm,
  erfasstVon,
  lernendeName,
  bestehend,
  onClose,
  onGespeichert,
}: {
  benutzerId: string
  machtBm: boolean
  erfasstVon: string | null
  lernendeName: string
  bestehend: Bildungsbericht | null
  onClose: () => void
  onGespeichert: () => void
}) {
  const [typ, setTyp] = useState<BerichtTyp>(bestehend?.typ ?? 'semester')
  const [semester, setSemester] = useState(String(bestehend?.semester ?? 1))
  const [status, setStatus] = useState<BerichtStatus>(bestehend?.status ?? 'entwurf')
  const [inhalt, setInhalt] = useState<Record<string, string>>(
    (bestehend?.inhalt as Record<string, string>) ?? {},
  )
  const [kennzahlen, setKennzahlen] = useState<BerichtKennzahlen | null>(null)
  const [speichert, setSpeichert] = useState(false)

  // Ausbildungsstand live laden (wird beim Speichern eingefroren).
  useEffect(() => {
    let aktiv = true
    void ladeKennzahlen(benutzerId, machtBm).then((k) => {
      if (aktiv) setKennzahlen(k)
    })
    return () => {
      aktiv = false
    }
  }, [benutzerId, machtBm])

  async function speichern() {
    if (!kennzahlen) return
    setSpeichert(true)
    const zeile = {
      benutzer_id: benutzerId,
      typ,
      semester: typ === 'semester' ? Number(semester) : null,
      status,
      inhalt,
      kennzahlen,
      erfasst_von: erfasstVon,
    }
    const wirdAbgeschlossen = status === 'abgeschlossen' && (!bestehend || bestehend.status === 'entwurf')
    let berichtId = bestehend?.id ?? null
    if (bestehend) {
      await supabase.from('bildungsbericht').update(zeile).eq('id', bestehend.id)
    } else {
      const { data: ins } = await supabase.from('bildungsbericht').insert(zeile).select('id').single()
      berichtId = (ins as { id: string } | null)?.id ?? null
    }
    if (wirdAbgeschlossen && berichtId) {
      await sendeBerichtAbgeschlossen({
        berichtId,
        typ,
        semester: typ === 'semester' ? Number(semester) : null,
        datum: bestehend?.datum ?? new Date().toISOString().slice(0, 10),
        lernendeName,
        inhalt,
        kennzahlen,
      })
    }
    setSpeichert(false)
    onGespeichert()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={bestehend ? 'Bildungsbericht bearbeiten' : 'Neuer Bildungsbericht'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" loading={speichert} disabled={!kennzahlen} onClick={() => void speichern()}>
            {status === 'abgeschlossen' ? 'Speichern & abschliessen' : 'Speichern'}
          </Button>
        </>
      }
    >
      <div className={s.formGrid}>
        <Select
          label="Typ"
          value={typ}
          onChange={(e) => setTyp(e.target.value as BerichtTyp)}
          options={[
            { value: 'semester', label: 'Semesterbericht (Art. 13 BiVo)' },
            { value: 'sonderbericht', label: 'Sonderbericht (anlassbezogen)' },
          ]}
        />
        {typ === 'semester' ? (
          <Select
            label="Semester"
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            options={[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: String(n), label: `Semester ${n}` }))}
          />
        ) : (
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as BerichtStatus)}
            options={[
              { value: 'entwurf', label: 'Entwurf' },
              { value: 'abgeschlossen', label: 'Abgeschlossen' },
            ]}
          />
        )}
        {typ === 'semester' && (
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as BerichtStatus)}
            options={[
              { value: 'entwurf', label: 'Entwurf' },
              { value: 'abgeschlossen', label: 'Abgeschlossen' },
            ]}
          />
        )}
      </div>

      {typ === 'sonderbericht' && (
        <p className={s.hint}>
          Sonderbericht: anlassbezogen, wenn ein Gespräch zwingend nötig ist (z.B. ungenügende
          Leistung oder ein anderes Problem). Nicht an ein Semester gebunden.
        </p>
      )}

      <div className={s.kzBlock}>
        <div className={s.kzBlockTitel}>Automatisch erfasster Ausbildungsstand</div>
        {kennzahlen ? (
          <KennzahlenAnzeige k={kennzahlen} />
        ) : (
          <div style={{ padding: 'var(--sp-3)' }}><Spinner /></div>
        )}
        <div className={s.kzBlockNote}>
          Dieser Stand wird beim Speichern in den Bericht eingefroren.
        </div>
      </div>

      {felderFuer(typ).map((f) => (
        <Textarea
          key={f.key}
          label={f.label}
          value={inhalt[f.key] ?? ''}
          onChange={(e) => setInhalt((c) => ({ ...c, [f.key]: e.target.value }))}
        />
      ))}
    </Modal>
  )
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}
