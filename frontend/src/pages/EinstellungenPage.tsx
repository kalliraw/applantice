import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.ts'
import { useAuth } from '../auth/AuthContext.tsx'
import type { Benutzer, Rolle } from '../lib/types.ts'
import {
  EntraSyncFehler,
  holeProviderToken,
  ladeKonfig,
  speichereKonfig,
  syncEntraBenutzer,
  type EntraKonfig,
  type SyncErgebnis,
} from '../lib/entra.ts'
import { sendeMailEreignis } from '../lib/mail.ts'
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Select, Spinner, Tabs, TextField } from '../ui/index.ts'
import s from './Einstellungen.module.css'

// Mail-Typen für die Benachrichtigungs-Tab (müssen den mailer-Typen entsprechen).
const BENACHR_TYPEN: { typ: string; label: string; desc: string }[] = [
  { typ: 'rolle_zugewiesen', label: 'Zugang freigeschaltet', desc: 'Mail an die Person, wenn eine Rolle vergeben wird (mit Link zum Tool).' },
  { typ: 'bericht_abgeschlossen', label: 'Bildungsbericht abgeschlossen', desc: 'Bericht als PDF an den abschliessenden Berufsbildner.' },
  { typ: 'ziel_zugewiesen', label: 'Ziele fürs Team', desc: 'Info an die Teamverantwortlichen, wenn Leistungsziele zugewiesen werden.' },
  { typ: 'teamwechsel', label: 'Teamwechsel steht an', desc: 'Reminder an Teamverantwortliche und Lernende (nur bei aktivem Scheduler).' },
  { typ: 'note_fehlt', label: 'Fehlende Noten', desc: 'Reminder an Lernende: abgeschlossenes Modul ohne Note (nur bei aktivem Scheduler).' },
  { typ: 'semesterbericht_faellig', label: 'Semesterbericht überfällig', desc: 'Reminder an Berufsbildner (nur bei aktivem Scheduler).' },
]

type EditState = {
  id: string | null // null = neuer Benutzer
  name: string
  email: string
  rolle: '' | Rolle
  aktiv: boolean
  ausbildungsstart: string
  macht_bm: boolean
}

export function EinstellungenPage() {
  const { profil } = useAuth()
  const istBB = profil?.rolle === 'berufsbildner'

  const [tab, setTab] = useState<'benutzer' | 'benachr'>('benutzer')
  const [benutzer, setBenutzer] = useState<Benutzer[]>([])
  const [benachr, setBenachr] = useState<Record<string, boolean>>({})
  const [ladt, setLadt] = useState(true)
  const [edit, setEdit] = useState<EditState | null>(null)
  const [speichert, setSpeichert] = useState(false)
  const [loescht, setLoescht] = useState(false)
  const [aktionFehler, setAktionFehler] = useState<string | null>(null)

  // Filter/Suche für die Benutzerliste.
  const [suche, setSuche] = useState('')
  const [fRolle, setFRolle] = useState('')
  const [fTyp, setFTyp] = useState('')
  const [fStatus, setFStatus] = useState('')

  // Entra-Sync-Konfiguration (lokal im Browser).
  const [konfig, setKonfig] = useState<EntraKonfig>(() => ladeKonfig())
  const [konfigDirty, setKonfigDirty] = useState(false)
  const [syncLauft, setSyncLauft] = useState(false)
  const [syncErg, setSyncErg] = useState<SyncErgebnis | null>(null)
  const [syncFehler, setSyncFehler] = useState<string | null>(null)
  const [tokenDa, setTokenDa] = useState<boolean | null>(null)

  async function laden() {
    const { data } = await supabase.from('benutzer').select('*').order('name')
    setBenutzer((data as Benutzer[]) ?? [])
    setLadt(false)
  }
  async function ladeBenachr() {
    const { data } = await supabase.from('benachrichtigung_einstellung').select('typ, aktiv')
    const m: Record<string, boolean> = {}
    for (const r of (data as { typ: string; aktiv: boolean }[]) ?? []) m[r.typ] = r.aktiv
    setBenachr(m)
  }
  async function toggleBenachr(typ: string, aktiv: boolean) {
    setBenachr((c) => ({ ...c, [typ]: aktiv }))
    await supabase
      .from('benachrichtigung_einstellung')
      .upsert({ typ, aktiv, aktualisiert_von: profil?.id ?? null, aktualisiert_am: new Date().toISOString() }, { onConflict: 'typ' })
  }
  useEffect(() => {
    void laden()
    void ladeBenachr()
    void holeProviderToken().then((t) => setTokenDa(Boolean(t)))
  }, [])

  const sortiert = useMemo(
    () =>
      [...benutzer].sort((a, b) => {
        // Rollenlose zuerst (brauchen Zuweisung), dann nach Name.
        const ra = a.rolle === null ? 0 : 1
        const rb = b.rolle === null ? 0 : 1
        return ra - rb || a.name.localeCompare(b.name)
      }),
    [benutzer],
  )
  const ohneRolle = benutzer.filter((b) => b.rolle === null && b.aktiv).length

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase()
    return sortiert.filter((b) => {
      if (q && !(b.name.toLowerCase().includes(q) || b.email.toLowerCase().includes(q))) return false
      if (fRolle === 'ohne' && b.rolle !== null) return false
      if ((fRolle === 'lernende' || fRolle === 'berufsbildner') && b.rolle !== fRolle) return false
      if (fTyp && b.auth_typ !== fTyp) return false
      if (fStatus === 'aktiv' && !b.aktiv) return false
      if (fStatus === 'inaktiv' && b.aktiv) return false
      return true
    })
  }, [sortiert, suche, fRolle, fTyp, fStatus])

  function speichereEntraKonfig() {
    speichereKonfig(konfig)
    setKonfigDirty(false)
  }

  async function sync() {
    setSyncLauft(true)
    setSyncFehler(null)
    setSyncErg(null)
    try {
      if (konfigDirty) speichereEntraKonfig()
      const erg = await syncEntraBenutzer(konfig)
      setSyncErg(erg)
      await laden()
    } catch (e) {
      const msg = e instanceof EntraSyncFehler ? e.message : (e as Error).message
      setSyncFehler(msg)
      if (e instanceof EntraSyncFehler && e.code === 'KEIN_TOKEN') setTokenDa(false)
    } finally {
      setSyncLauft(false)
    }
  }

  function neu() {
    setAktionFehler(null)
    setEdit({ id: null, name: '', email: '', rolle: '', aktiv: true, ausbildungsstart: '', macht_bm: false })
  }
  function bearbeiten(b: Benutzer) {
    setAktionFehler(null)
    setEdit({
      id: b.id,
      name: b.name,
      email: b.email,
      rolle: b.rolle ?? '',
      aktiv: b.aktiv,
      ausbildungsstart: b.ausbildungsstart ?? '',
      macht_bm: b.macht_bm,
    })
  }

  async function speichern() {
    if (!edit || !edit.name.trim()) return
    setSpeichert(true)
    const istLernende = edit.rolle === 'lernende'
    const payload = {
      name: edit.name.trim(),
      rolle: edit.rolle || null,
      aktiv: edit.aktiv,
      // Ausbildungsstart/BM nur für Lernende sinnvoll -> sonst leeren.
      ausbildungsstart: istLernende ? edit.ausbildungsstart || null : null,
      macht_bm: istLernende ? edit.macht_bm : false,
    }
    const vorherRolle = edit.id ? benutzer.find((b) => b.id === edit.id)?.rolle ?? null : null
    let benutzerId = edit.id
    if (edit.id) {
      await supabase.from('benutzer').update(payload).eq('id', edit.id)
    } else {
      const { data: ins } = await supabase
        .from('benutzer')
        .insert({ ...payload, email: edit.email.trim(), auth_typ: 'entra_id' })
        .select('id')
        .single()
      benutzerId = (ins as { id: string } | null)?.id ?? null
    }
    // Zugangs-Mail nur bei NEU vergebener Rolle (vorher keine bzw. neuer Benutzer mit Rolle).
    const rolleNeuVergeben = edit.rolle !== '' && (edit.id ? vorherRolle === null : true)
    if (rolleNeuVergeben && benutzerId) await sendeMailEreignis('rolle_zugewiesen', benutzerId)
    setSpeichert(false)
    setEdit(null)
    void laden()
  }

  async function loeschen() {
    if (!edit?.id) return
    if (
      !window.confirm(
        `Benutzer „${edit.name}" wirklich löschen?\n\nEntfernt nur das Profil. Konten mit bereits erfassten Daten ` +
          `(Noten, Einschätzungen, Berichte) lassen sich nicht löschen – dann stattdessen „Konto aktiv" deaktivieren.`,
      )
    )
      return
    setLoescht(true)
    setAktionFehler(null)
    const { data: geloescht, error } = await supabase.from('benutzer').delete().eq('id', edit.id).select('id')
    setLoescht(false)
    if (error) {
      setAktionFehler(
        error.code === '23503'
          ? 'Benutzer hat bereits Daten (Noten/Einschätzungen/Berichte) und kann nicht gelöscht werden. Bitte stattdessen „Konto aktiv" deaktivieren.'
          : `Löschen fehlgeschlagen: ${error.message}`,
      )
      return
    }
    if (!geloescht || geloescht.length === 0) {
      setAktionFehler('Löschen wurde nicht ausgeführt (fehlende Berechtigung?). Ist die Delete-Migration eingespielt?')
      return
    }
    setEdit(null)
    void laden()
  }

  if (!istBB) {
    return <EmptyState title="Kein Zugriff" text="Nur Berufsbildner können Benutzer und Einstellungen verwalten." />
  }
  if (ladt) return <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}><Spinner /></div>

  const eigenesKonto = edit?.id != null && edit.id === profil?.id

  return (
    <div>
      <PageHeader
        eyebrow="Verwaltung"
        title="Einstellungen"
        description="Benutzer & Rollen verwalten und Benachrichtigungen steuern."
        actions={tab === 'benutzer' ? <Button variant="primary" onClick={neu}>+ Benutzer</Button> : undefined}
      />

      <Tabs
        tabs={[
          { id: 'benutzer', label: 'Benutzerverwaltung' },
          { id: 'benachr', label: 'Benachrichtigungen' },
        ]}
        active={tab}
        onChange={(id) => setTab(id as 'benutzer' | 'benachr')}
      />

      {tab === 'benutzer' && (
      <div className={s.tabInhalt}>
      {/* ---------- Entra-Sync ---------- */}
      <Card title="Benutzer aus Entra ID synchronisieren" className={s.syncCard}>
        <p className={`muted ${s.syncLead}`}>
          Holt die Mitglieder einer Entra-ID-Gruppe und legt sie hier als Benutzer <b>ohne Rolle</b> an.
          Läuft mit deinem Anmelde-Token – nur <b>direkt nach dem Entra-Login</b> verfügbar.
        </p>

        <div className={s.syncFelder}>
          <TextField
            label="Entra-Gruppenname"
            value={konfig.gruppeName}
            onChange={(e) => { setKonfig({ ...konfig, gruppeName: e.target.value }); setKonfigDirty(true) }}
            placeholder="z.B. ICT-Lernende Swiss TPH"
            hint="Wird beim Sync zu einer Gruppen-ID aufgelöst."
          />
          <TextField
            label="Gruppen-ID (optional, GUID)"
            value={konfig.gruppeId}
            onChange={(e) => { setKonfig({ ...konfig, gruppeId: e.target.value }); setKonfigDirty(true) }}
            placeholder="00000000-0000-0000-0000-000000000000"
            hint="Wenn gesetzt, wird direkt diese ID verwendet (kein Namens-Lookup)."
          />
        </div>

        {tokenDa === false && (
          <p className={s.warn}>
            Kein Microsoft-Graph-Token in dieser Sitzung (z.B. Break-Glass-Login oder Token abgelaufen).
            Für den Sync bitte über <b>Microsoft Entra ID</b> anmelden und direkt danach synchronisieren.
          </p>
        )}
        {syncFehler && <p className={s.warn}>{syncFehler}</p>}
        {syncErg && (
          <div className={s.syncErg}>
            <Badge tone="accent">{syncErg.neu} neu</Badge>
            <Badge tone="neutral">{syncErg.aktualisiert} aktualisiert</Badge>
            <Badge tone="neutral">{syncErg.unveraendert} unverändert</Badge>
            <span className="muted">
              · {syncErg.benutzer} Benutzer{syncErg.mitglieder !== syncErg.benutzer && ` von ${syncErg.mitglieder} Mitgliedern`} aus Entra
            </span>
            {syncErg.fehler.length > 0 && (
              <details className={s.syncFehlerListe}>
                <summary>{syncErg.fehler.length} Fehler</summary>
                <ul>{syncErg.fehler.map((f, i) => <li key={i}>{f}</li>)}</ul>
              </details>
            )}
          </div>
        )}

        <div className={s.syncActions}>
          <Button variant="secondary" onClick={speichereEntraKonfig} disabled={!konfigDirty}>
            Konfiguration speichern
          </Button>
          <Button variant="primary" loading={syncLauft} onClick={() => void sync()}>
            Jetzt synchronisieren
          </Button>
        </div>
      </Card>

      {/* ---------- Benutzerliste ---------- */}
      <div className={s.toolbar}>
        <div className={s.filter}>
          <div className={s.sucheFeld}>
            <TextField
              aria-label="Suche"
              placeholder="Name oder E-Mail suchen …"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
            />
          </div>
          <Select
            aria-label="Rolle filtern"
            value={fRolle}
            onChange={(e) => setFRolle(e.target.value)}
            options={[
              { value: '', label: 'Alle Rollen' },
              { value: 'ohne', label: 'ohne Rolle' },
              { value: 'lernende', label: 'Lernende' },
              { value: 'berufsbildner', label: 'Berufsbildner' },
            ]}
          />
          <Select
            aria-label="Typ filtern"
            value={fTyp}
            onChange={(e) => setFTyp(e.target.value)}
            options={[
              { value: '', label: 'Alle Typen' },
              { value: 'entra_id', label: 'Entra' },
              { value: 'lokal', label: 'Lokal' },
            ]}
          />
          <Select
            aria-label="Status filtern"
            value={fStatus}
            onChange={(e) => setFStatus(e.target.value)}
            options={[
              { value: '', label: 'Alle Status' },
              { value: 'aktiv', label: 'aktiv' },
              { value: 'inaktiv', label: 'inaktiv' },
            ]}
          />
        </div>
        <span className="muted" style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
          {gefiltert.length} von {benutzer.length}
          {ohneRolle > 0 && <> · <b>{ohneRolle} ohne Rolle</b></>}
        </span>
      </div>

      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>E-Mail</th>
              <th>Typ</th>
              <th>Rolle</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {gefiltert.map((b) => (
              <tr key={b.id} className={b.aktiv ? '' : s.inaktiv}>
                <td className={s.name}>{b.name}</td>
                <td className={s.mono}>{b.email}</td>
                <td>{b.auth_typ === 'lokal' ? <Badge tone="warn">lokal</Badge> : <Badge tone="neutral">Entra</Badge>}</td>
                <td>
                  {b.rolle === 'berufsbildner' ? (
                    <Badge tone="accent">Berufsbildner</Badge>
                  ) : b.rolle === 'lernende' ? (
                    <Badge tone="neutral">Lernende(r)</Badge>
                  ) : (
                    <Badge tone="warn">ohne Rolle</Badge>
                  )}
                </td>
                <td>{b.aktiv ? <Badge tone="accent">aktiv</Badge> : <Badge tone="neutral">inaktiv</Badge>}</td>
                <td>
                  <Button size="sm" variant="ghost" onClick={() => bearbeiten(b)}>Bearbeiten</Button>
                </td>
              </tr>
            ))}
            {gefiltert.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <p className="muted" style={{ margin: 0, padding: 'var(--sp-3)' }}>Keine Benutzer für diese Filter.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </div>
      )}

      {tab === 'benachr' && (
        <div className={s.tabInhalt}>
          <Card title="Benachrichtigungen">
            <p className={`muted ${s.syncLead}`}>
              Pro Ereignis festlegen, ob eine Mail versendet wird – Änderungen greifen sofort.
              Reminder (Noten, Semesterbericht, Teamwechsel) laufen zusätzlich nur, wenn der
              Scheduler serverseitig aktiviert ist.
            </p>
            <div className={s.benachrListe}>
              {BENACHR_TYPEN.map((t) => {
                const an = benachr[t.typ] ?? true
                return (
                  <label key={t.typ} className={s.benachrRow}>
                    <input type="checkbox" checked={an} onChange={(e) => void toggleBenachr(t.typ, e.target.checked)} />
                    <span className={s.benachrText}>
                      <span className={s.benachrLabel}>{t.label}</span>
                      <span className={s.benachrDesc}>{t.desc}</span>
                    </span>
                    <Badge tone={an ? 'accent' : 'neutral'}>{an ? 'an' : 'aus'}</Badge>
                  </label>
                )
              })}
            </div>
          </Card>
        </div>
      )}

      {edit && (
        <Modal
          open
          onClose={() => setEdit(null)}
          title={edit.id ? 'Benutzer bearbeiten' : 'Neuer Benutzer'}
          footer={
            <>
              {edit.id && !eigenesKonto && (
                <Button variant="danger" loading={loescht} onClick={() => void loeschen()} style={{ marginRight: 'auto' }}>
                  Löschen
                </Button>
              )}
              <Button variant="ghost" onClick={() => setEdit(null)}>Abbrechen</Button>
              <Button variant="primary" loading={speichert} onClick={() => void speichern()}>Speichern</Button>
            </>
          }
        >
          <TextField label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          {edit.id ? (
            <TextField label="E-Mail" value={edit.email} disabled hint="E-Mail ist der SSO-Identifier und nicht änderbar." />
          ) : (
            <TextField
              label="E-Mail"
              type="email"
              value={edit.email}
              onChange={(e) => setEdit({ ...edit, email: e.target.value })}
              placeholder="vorname.nachname@swisstph.ch"
            />
          )}

          <Select
            label="Rolle"
            value={edit.rolle}
            onChange={(e) => setEdit({ ...edit, rolle: e.target.value as '' | Rolle })}
            disabled={eigenesKonto}
            options={[
              { value: '', label: 'ohne Rolle (kein Zugriff)' },
              { value: 'lernende', label: 'Lernende(r)' },
              { value: 'berufsbildner', label: 'Berufsbildner' },
            ]}
          />

          {edit.rolle === 'lernende' && (
            <div className={s.editGrid}>
              <TextField
                label="Ausbildungsstart"
                type="date"
                value={edit.ausbildungsstart}
                onChange={(e) => setEdit({ ...edit, ausbildungsstart: e.target.value })}
                hint="Für Zeitstrahl & Dashboard."
              />
              <label className={s.checkRow}>
                <input type="checkbox" checked={edit.macht_bm} onChange={(e) => setEdit({ ...edit, macht_bm: e.target.checked })} />
                macht Berufsmaturität (BM)
              </label>
            </div>
          )}

          <label className={s.checkRow}>
            <input
              type="checkbox"
              checked={edit.aktiv}
              disabled={eigenesKonto}
              onChange={(e) => setEdit({ ...edit, aktiv: e.target.checked })}
            />
            Konto aktiv {edit.id && '(Lehrabschluss/Austritt → inaktiv statt löschen)'}
          </label>

          {eigenesKonto && (
            <p className={s.hintEigen}>Eigenes Konto: Rolle und Status sind hier gesperrt (Selbst-Aussperren verhindern).</p>
          )}
          {aktionFehler && <p className={s.warn}>{aktionFehler}</p>}
        </Modal>
      )}
    </div>
  )
}
