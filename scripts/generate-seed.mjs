// Erzeugt supabase/seed.sql aus data/*.csv.
// Bewusst ohne externe Abhängigkeit (schlanke Toolchain, techstack.md).
//
// Lauf:  node scripts/generate-seed.mjs
//
// Der Seed ist für eine FRISCHE Datenbank gedacht (npx supabase db reset).
// Gewichte/Fächer/Kompetenzen sind Daten, nicht Code -> hier nur eingelesen und
// in INSERTs übersetzt. Die EFZ-Notenformel-Gewichte stammen aus der BiVo
// (featurematrix.md), NICHT aus einer Annahme.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = join(root, 'data')
const out = join(root, 'supabase', 'seed.sql')

// ---------- kleiner RFC-4180-CSV-Parser ----------
function parseCsv(text) {
  text = text.replace(/^﻿/, '') // BOM
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c === '\r') {
      // ignorieren (CRLF)
    } else {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  const header = rows.shift()
  return rows
    .filter((r) => r.some((v) => v.trim() !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])))
}

// ---------- SQL-Helfer ----------
const q = (v) =>
  v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`
const bool = (v) => (String(v).toLowerCase() === 'ja' || v === true ? 'true' : 'false')

const load = (name) => parseCsv(readFileSync(join(dataDir, name), 'utf8'))

const kanton = load('handlungziele-kanton.csv')
const faecher = load('faecher.csv')
const accounts = load('accounts.csv')

const chunks = []
const w = (s) => chunks.push(s)

w(`-- =====================================================================
-- GENERIERT von scripts/generate-seed.mjs aus data/*.csv – nicht von Hand editieren.
-- Für eine frische DB (npx supabase db reset). Quellen:
--   data/handlungziele-kanton.csv, data/faecher.csv, data/accounts.csv
-- =====================================================================
begin;
`)

// ---------- Notenkomponenten (EFZ-Formel = Daten aus BiVo, featurematrix.md) ----------
w(`
-- Notenkomponenten: EFZ-Formel IPA 40 / Informatikkompetenzen 30 (BFS 80 + ÜK 20)
-- / ABU 20 / EGK 10. Sport ist nicht qualifikationsrelevant (Gewicht 0).
-- BM-Komponenten sind PLATZHALTER (Gewicht 0): Gewichte sind schulspezifisch und
-- müssen vor Nutzung des BM-Rechners erfasst werden (offener Punkt, featurematrix.md).
insert into public.notenkomponente (code, name, kontext, parent_id, gewicht, ist_qualifikationsrelevant, entfaellt_bei_bm, sortierung) values
  ('IPA', 'Individuelle praktische Arbeit (IPA)', 'EFZ', null, 0.40, true, false, 1),
  ('INFORMATIK', 'Informatikkompetenzen', 'EFZ', null, 0.30, true, false, 2),
  ('ABU', 'Allgemeinbildung (ABU)', 'EFZ', null, 0.20, true, true, 3),
  ('EGK', 'Erweiterte Grundkompetenzen', 'EFZ', null, 0.10, true, true, 4),
  ('SPORT', 'Sport (nicht qualifikationsrelevant)', 'EFZ', null, 0, false, true, 5),
  ('BM_FACHNOTE', 'BM-Fachnoten (Gewichte schulspezifisch – zu erfassen)', 'BM', null, 0, true, false, 10),
  ('BM_IDPA', 'BM Interdisziplinäre Projektarbeit (IDPA)', 'BM', null, 0, true, false, 11);

-- Unterkomponenten von INFORMATIK (BFS 80% + ÜK 20%), referenzieren den Parent per code.
insert into public.notenkomponente (code, name, kontext, parent_id, gewicht, ist_qualifikationsrelevant, entfaellt_bei_bm, sortierung) values
  ('INFORMATIK_BFS', 'Informatikkompetenzen Berufsfachschule', 'EFZ',
     (select id from public.notenkomponente where code = 'INFORMATIK'), 0.80, true, false, 1),
  ('INFORMATIK_UEK', 'Informatikkompetenzen überbetriebliche Kurse', 'EFZ',
     (select id from public.notenkomponente where code = 'INFORMATIK'), 0.20, true, false, 2);
`)

// Mapping der faecher.csv-Notenkomponente auf Komponenten-Codes.
const komponenteMap = {
  'Allgemeinbildung-ABU': 'ABU',
  'Erweiterte-Grundkompetenzen-EGK': 'EGK',
  'keine-nicht-qualifikationsrelevant': 'SPORT',
  'Informatikkompetenzen-UEK': 'INFORMATIK_UEK',
  'Informatikkompetenzen-BFS': 'INFORMATIK_BFS',
  'BM-Fachnote': 'BM_FACHNOTE',
  'BM-IDPA': 'BM_IDPA',
}

// ---------- Bereiche ----------
const bereiche = []
const seenBereich = new Set()
for (const r of kanton) {
  if (!seenBereich.has(r.bereich_code)) {
    seenBereich.add(r.bereich_code)
    bereiche.push({ code: r.bereich_code, titel: r.bereich_titel })
  }
}
w(`\n-- Bereiche (Kanton)\ninsert into public.bereich (code, titel, sortierung) values`)
w(
  bereiche
    .map((b, i) => `  (${q(b.code)}, ${q(b.titel)}, ${i + 1})`)
    .join(',\n') + ';',
)

// ---------- Handlungskompetenzen (Kanton) ----------
const komps = []
const seenKomp = new Set()
for (const r of kanton) {
  if (!seenKomp.has(r.kompetenz_code)) {
    seenKomp.add(r.kompetenz_code)
    komps.push({
      code: r.kompetenz_code,
      titel: r.kompetenz_titel,
      beschreibung: r.kompetenz_beschreibung,
      bereich: r.bereich_code,
    })
  }
}
w(`\n-- Handlungskompetenzen (Kanton, quelle='kanton')\ninsert into public.handlungskompetenz (code, titel, beschreibung, bereich_code, quelle, sortierung) values`)
w(
  komps
    .map(
      (k, i) =>
        `  (${q(k.code)}, ${q(k.titel)}, ${q(k.beschreibung)}, ${q(k.bereich)}, 'kanton', ${i + 1})`,
    )
    .join(',\n') + ';',
)

// ---------- Leistungsziele (Kanton) ----------
w(`\n-- Leistungsziele (Kanton) – referenzieren die Kompetenz über code`)
w(`insert into public.leistungsziel (handlungskompetenz_id, code, text, taxonomiestufe, modulverweise_rohtext, sortierung) values`)
w(
  kanton
    .map((r, i) => {
      const hk = `(select id from public.handlungskompetenz where code = ${q(r.kompetenz_code)} and quelle = 'kanton')`
      return `  (${hk}, ${q(r.leistungsziel_code)}, ${q(r.leistungsziel_text)}, ${q(r.taxonomiestufe)}, ${q(r.modulverweise_rohtext)}, ${i + 1})`
    })
    .join(',\n') + ';',
)

// ---------- Fächer ----------
w(`\n-- Fächer (Startdaten aus data/faecher.csv; Berufsbildner pflegt in der App)`)
w(`insert into public.fach (name, modul_nr, kontext, typ, notenkomponente_id, gewicht, aktiv, bemerkung, sortierung) values`)
w(
  faecher
    .map((f, i) => {
      const code = komponenteMap[f.notenkomponente]
      if (!code) throw new Error(`Unbekannte Notenkomponente in faecher.csv: ${f.notenkomponente}`)
      const nk = `(select id from public.notenkomponente where code = ${q(code)})`
      return `  (${q(f.fach_name)}, ${q(f.modul_nr)}, ${q(f.kontext)}, ${q(f.typ)}, ${nk}, 1, ${bool(f.aktiv)}, ${q(f.bemerkung)}, ${i + 1})`
    })
    .join(',\n') + ';',
)

// ---------- Benutzer (Allowlist aus accounts.csv) ----------
w(`\n-- Benutzer/Allowlist (aus data/accounts.csv). auth_user_id wird beim ersten Login verknüpft.`)
w(`insert into public.benutzer (email, name, rolle, auth_typ, ausbildungsstart) values`)
w(
  accounts
    .map(
      (a) =>
        `  (${q(a.email)}, ${q(a.name)}, ${q(a.rolle)}, ${q(a.auth_typ)}, ${q(a.ausbildungsstart)})`,
    )
    .join(',\n') + ';',
)

// ---------- Break-Glass: lokaler Auth-User (nur wenn Platzhalter-Passwort gesetzt) ----------
for (const a of accounts) {
  if (a.auth_typ === 'lokal' && a.passwort_platzhalter) {
    w(`
-- Break-Glass-Login (${a.email}). Passwort NACH erstem Login ändern, danach
-- passwort_platzhalter in data/accounts.csv leeren und Seed neu generieren.
do $$
declare v_uid uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    -- GoTrue liest diese Token-Spalten als non-null String -> leere Strings statt NULL.
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    ${q(a.email)}, crypt(${q(a.passwort_platzhalter)}, gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_uid, v_uid::text,
    jsonb_build_object('sub', v_uid::text, 'email', ${q(a.email)}),
    'email', now(), now(), now()
  );
  -- Verknüpfung (der Auth-Trigger tut dies bereits; hier explizit zur Sicherheit).
  update public.benutzer set auth_user_id = v_uid where email = ${q(a.email)};
end $$;
`)
  }
}

w(`\ncommit;\n`)

writeFileSync(out, chunks.join('\n'))
console.log(`seed.sql geschrieben: ${out}`)
console.log(
  `  Bereiche=${bereiche.length}  Handlungskompetenzen=${komps.length}  Leistungsziele=${kanton.length}  Fächer=${faecher.length}  Benutzer=${accounts.length}`,
)
