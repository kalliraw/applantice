import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.ts'
import { useAuth } from '../auth/AuthContext.tsx'
import type { Fach, Notenkomponente, NotenKontext } from '../lib/types.ts'
import { Badge, Button, Card, Modal, PageHeader, Select, Spinner, TextField, Textarea } from '../ui/index.ts'
import s from './Faecher.module.css'

type FormState = {
  id: string | null
  name: string
  modul_nr: string
  kontext: NotenKontext
  typ: string
  notenkomponente_id: string
  gewicht: string
  bemerkung: string
  aktiv: boolean
  hat_abschlusspruefung: boolean
}

const LEER = (kontext: NotenKontext): FormState => ({
  id: null,
  name: '',
  modul_nr: '',
  kontext,
  typ: '',
  notenkomponente_id: '',
  gewicht: '1',
  bemerkung: '',
  aktiv: true,
  hat_abschlusspruefung: false,
})

export function FaecherPage() {
  const { profil } = useAuth()
  // Berufsbildner UND Admin dürfen Fächer pflegen (globale Konfiguration).
  const istBB = profil?.rolle === 'berufsbildner' || profil?.rolle === 'admin'
  const [faecher, setFaecher] = useState<Fach[]>([])
  const [komponenten, setKomponenten] = useState<Notenkomponente[]>([])
  const [kontext, setKontext] = useState<NotenKontext>('EFZ')
  const [suche, setSuche] = useState('')
  const [ladt, setLadt] = useState(true)
  const [form, setForm] = useState<FormState | null>(null)
  const [speichert, setSpeichert] = useState(false)

  async function laden() {
    const [f, k] = await Promise.all([
      supabase.from('fach').select('*').order('sortierung'),
      supabase.from('notenkomponente').select('*').order('sortierung'),
    ])
    setFaecher((f.data as Fach[]) ?? [])
    setKomponenten((k.data as Notenkomponente[]) ?? [])
    setLadt(false)
  }
  useEffect(() => {
    void laden()
  }, [])

  const komponenteName = useMemo(() => {
    const m: Record<string, string> = {}
    for (const k of komponenten) m[k.id] = k.name
    return m
  }, [komponenten])

  const q = suche.trim().toLowerCase()
  const liste = faecher.filter(
    (f) =>
      f.kontext === kontext &&
      (!q ||
        (f.modul_nr ?? '').toLowerCase().includes(q) ||
        f.name.toLowerCase().includes(q) ||
        (f.typ ?? '').toLowerCase().includes(q)),
  )

  async function speichern() {
    if (!form || !form.name.trim()) return
    setSpeichert(true)
    const payload = {
      name: form.name.trim(),
      modul_nr: form.modul_nr.trim() || null,
      kontext: form.kontext,
      typ: form.typ.trim() || null,
      notenkomponente_id: form.notenkomponente_id || null,
      gewicht: Number(form.gewicht) || 0,
      bemerkung: form.bemerkung.trim() || null,
      aktiv: form.aktiv,
      hat_abschlusspruefung: form.kontext === 'BM' && form.hat_abschlusspruefung,
    }
    if (form.id) await supabase.from('fach').update(payload).eq('id', form.id)
    else await supabase.from('fach').insert(payload)
    setSpeichert(false)
    setForm(null)
    void laden()
  }

  async function toggleAktiv(f: Fach) {
    setFaecher((cur) => cur.map((x) => (x.id === f.id ? { ...x, aktiv: !x.aktiv } : x)))
    await supabase.from('fach').update({ aktiv: !f.aktiv }).eq('id', f.id)
  }

  function bearbeiten(f: Fach) {
    setForm({
      id: f.id,
      name: f.name,
      modul_nr: f.modul_nr ?? '',
      kontext: f.kontext,
      typ: f.typ ?? '',
      notenkomponente_id: f.notenkomponente_id ?? '',
      gewicht: String(f.gewicht),
      bemerkung: f.bemerkung ?? '',
      aktiv: f.aktiv,
      hat_abschlusspruefung: f.hat_abschlusspruefung,
    })
  }

  if (ladt) return <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}><Spinner /></div>

  return (
    <div>
      <PageHeader
        eyebrow="Notenrechner-Grundlage"
        title="Fächer verwalten"
        description="Fächer sind Daten, nicht Code. Kontext (EFZ/BM), Notenkomponente und Gewicht bestimmen, wie ein Fach in die Note einfliesst. Inaktiv statt löschen – historische Noten bleiben nachvollziehbar."
        actions={
          istBB && (
            <Button variant="primary" onClick={() => setForm(LEER(kontext))}>
              + Fach
            </Button>
          )
        }
      />

      <div className={s.toolbar}>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' }}>
          <Select
            aria-label="Kontext"
            value={kontext}
            onChange={(e) => setKontext(e.target.value as NotenKontext)}
            options={[
              { value: 'EFZ', label: 'EFZ' },
              { value: 'BM', label: 'Berufsmaturität' },
            ]}
          />
          <div style={{ width: 260 }}>
            <TextField
              aria-label="Suche"
              placeholder="Modulnummer oder Stichwort …"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
            />
          </div>
        </div>
        <span className="muted" style={{ fontSize: '0.85rem' }}>{liste.length} Fächer</span>
      </div>

      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Fach</th>
              <th>Modul</th>
              <th>Typ</th>
              <th>Notenkomponente</th>
              <th className={s.num}>Gewicht</th>
              <th>Status</th>
              {istBB && <th></th>}
            </tr>
          </thead>
          <tbody>
            {liste.map((f) => (
              <tr key={f.id} className={f.aktiv ? '' : s.inaktiv}>
                <td className={s.name}>{f.name}</td>
                <td className={s.modul}>{f.modul_nr ?? '—'}</td>
                <td>{f.typ ?? '—'}</td>
                <td className={s.komponenteTag}>
                  {f.notenkomponente_id ? komponenteName[f.notenkomponente_id] ?? '—' : '—'}
                </td>
                <td className={s.num}>{f.gewicht}</td>
                <td>
                  {f.aktiv ? <Badge tone="accent">aktiv</Badge> : <Badge tone="neutral">inaktiv</Badge>}
                </td>
                {istBB && (
                  <td>
                    <div className={s.rowActions}>
                      <Button size="sm" variant="ghost" onClick={() => bearbeiten(f)}>Bearbeiten</Button>
                      <Button size="sm" variant="ghost" onClick={() => void toggleAktiv(f)}>
                        {f.aktiv ? 'Deaktivieren' : 'Aktivieren'}
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {liste.length === 0 && (
              <tr>
                <td colSpan={istBB ? 7 : 6}>
                  <Card style={{ border: 'none', background: 'transparent', boxShadow: 'none' }}>
                    <p className="muted" style={{ margin: 0 }}>Keine Fächer in diesem Kontext.</p>
                  </Card>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {istBB && form && (
        <Modal
          open
          onClose={() => setForm(null)}
          title={form.id ? 'Fach bearbeiten' : 'Neues Fach'}
          footer={
            <>
              <Button variant="ghost" onClick={() => setForm(null)}>Abbrechen</Button>
              <Button variant="primary" loading={speichert} onClick={() => void speichern()}>Speichern</Button>
            </>
          }
        >
          <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)' }}>
            <TextField label="Modul-Nr. (optional)" value={form.modul_nr} onChange={(e) => setForm({ ...form, modul_nr: e.target.value })} />
            <TextField label="Typ (optional)" value={form.typ} onChange={(e) => setForm({ ...form, typ: e.target.value })} placeholder="z.B. BFS-Modul" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)' }}>
            <Select
              label="Kontext"
              value={form.kontext}
              onChange={(e) => setForm({ ...form, kontext: e.target.value as NotenKontext, notenkomponente_id: '' })}
              options={[
                { value: 'EFZ', label: 'EFZ' },
                { value: 'BM', label: 'Berufsmaturität' },
              ]}
            />
            <TextField label="Gewicht" type="number" step="0.01" value={form.gewicht} onChange={(e) => setForm({ ...form, gewicht: e.target.value })} />
          </div>
          <Select
            label="Notenkomponente"
            value={form.notenkomponente_id}
            onChange={(e) => setForm({ ...form, notenkomponente_id: e.target.value })}
            options={[
              { value: '', label: '— keine —' },
              ...komponenten.filter((k) => k.kontext === form.kontext).map((k) => ({ value: k.id, label: k.name })),
            ]}
          />
          {form.kontext === 'BM' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: '0.9rem', color: 'var(--text-2)' }}>
              <input
                type="checkbox"
                checked={form.hat_abschlusspruefung}
                onChange={(e) => setForm({ ...form, hat_abschlusspruefung: e.target.checked })}
                style={{ accentColor: 'var(--accent-solid-1)', width: 16, height: 16 }}
              />
              Abschlussprüfung (Fachnote = Erfahrungsnote + Prüfungsnote)
            </label>
          )}
          <Textarea label="Bemerkung (optional)" value={form.bemerkung} onChange={(e) => setForm({ ...form, bemerkung: e.target.value })} />
        </Modal>
      )}
    </div>
  )
}
