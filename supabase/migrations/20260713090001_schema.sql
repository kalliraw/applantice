-- =====================================================================
-- Schema: Ausbildungsplan Informatik EFZ
-- Datenmodell abgeleitet aus data/*.csv und planung/*.md.
-- Leitplanken (siehe planung/techstack.md):
--   * Notengewichte + Fächer sind Daten (Tabellen), nicht Code.
--   * Verlaufsdaten werden nie überschrieben -> append-only Tabellen.
--   * Offizielle Kanton-Daten sind unveränderlich (per RLS, siehe *_rls.sql).
-- =====================================================================

create extension if not exists citext;
create extension if not exists pgcrypto;

-- Privates Schema für RLS-Hilfsfunktionen (nicht über die API exponiert).
create schema if not exists app;

-- ---------- Enums ----------
create type public.rolle as enum ('lernende', 'berufsbildner');
create type public.auth_typ as enum ('entra_id', 'lokal');
create type public.kompetenz_quelle as enum ('kanton', 'betrieblich');
-- Reihenfolge = Fortschritt; MAX(ordinal) ergibt die aktuell erreichte Stufe.
create type public.einschaetzung_stufe as enum ('erklaert', 'geuebt', 'selbststaendig');
create type public.hk_status as enum ('offen', 'in_arbeit', 'erledigt');
create type public.noten_kontext as enum ('EFZ', 'BM');
create type public.bericht_status as enum ('entwurf', 'abgeschlossen');

-- ---------- Benutzer / Rollen-Zuordnung ----------
-- Allowlist + Profil in einem: aus data/accounts.csv geseedet (auth_user_id noch
-- leer). Der Auth-Trigger (20260713090003_auth.sql) verknüpft beim ersten Login
-- über die E-Mail. Wer hier nicht steht, hat keine Rolle -> RLS verweigert alles.
-- rolle ist NULLABLE: beim Entra-Gruppen-Sync werden alle Mitglieder ohne Rolle
-- angelegt; der Berufsbildner weist die Rolle danach in der App zu. Bis dahin
-- (rolle IS NULL) sieht der Account faktisch nichts (RLS).
create table public.benutzer (
  id             uuid primary key default gen_random_uuid(),
  auth_user_id   uuid unique references auth.users (id) on delete set null,
  email          citext not null unique,
  name           text not null,
  rolle          public.rolle,
  auth_typ       public.auth_typ not null default 'entra_id',
  upn            text unique,          -- Entra-ID-UPN: stabiler Identifier (authconcept.md)
  ausbildungsstart date,               -- nur Lernende; offener Punkt (featurematrix.md) -> nullable
  macht_bm       boolean not null default false,
  aktiv          boolean not null default true,  -- Lehrabschluss -> inaktiv statt löschen
  erstellt_am    timestamptz not null default now()
);
comment on table public.benutzer is 'Accounts + Rolle. Historie bleibt (aktiv=false statt löschen), siehe roles.md.';
comment on column public.benutzer.ausbildungsstart is 'Für Ausbildungszeit-Statusbar (Dashboard). Offener Punkt: bei echten Lernenden nachtragen.';

-- ---------- RLS-Hilfsfunktionen (SECURITY DEFINER -> lesen ohne RLS-Rekursion) ----------
create or replace function app.benutzer_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.benutzer where auth_user_id = auth.uid();
$$;

create or replace function app.rolle()
returns public.rolle language sql stable security definer set search_path = '' as $$
  select rolle from public.benutzer where auth_user_id = auth.uid();
$$;

create or replace function app.ist_berufsbildner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.benutzer
    where auth_user_id = auth.uid() and rolle = 'berufsbildner' and aktiv
  );
$$;

-- ---------- Handlungskompetenzen (Kanton = unveränderlich, Betrieblich = editierbar) ----------
create table public.bereich (
  code        text primary key,        -- 'a'..'f'
  titel       text not null,
  sortierung  int not null default 0
);
comment on table public.bereich is 'Handlungskompetenzbereiche aus dem kantonalen Bildungsplan (BiVo 21).';

create table public.handlungskompetenz (
  id            uuid primary key default gen_random_uuid(),
  code          text,                  -- 'a1'; bei betrieblich optional
  titel         text not null,
  beschreibung  text,
  bereich_code  text references public.bereich (code),
  quelle        public.kompetenz_quelle not null,
  aktiv         boolean not null default true,
  sortierung    int not null default 0,
  erstellt_von  uuid references public.benutzer (id),
  erstellt_am   timestamptz not null default now()
);
create unique index handlungskompetenz_kanton_code_uidx
  on public.handlungskompetenz (code) where quelle = 'kanton';
comment on table public.handlungskompetenz is 'quelle=kanton ist für alle Rollen schreibgeschützt (RLS). quelle=betrieblich: Berufsbildner pflegt.';

create table public.leistungsziel (
  id                    uuid primary key default gen_random_uuid(),
  handlungskompetenz_id uuid not null references public.handlungskompetenz (id) on delete cascade,
  code                  text,          -- 'a1.1'
  text                  text not null,
  taxonomiestufe        text,          -- K1..K6
  modulverweise_rohtext text,          -- Freitext, ungetrennt (offener Punkt, featurematrix.md)
  sortierung            int not null default 0
);
create index leistungsziel_hk_idx on public.leistungsziel (handlungskompetenz_id);

-- ---------- Selbsteinschätzung (append-only Verlauf, pro Leistungsziel) ----------
create table public.selbsteinschaetzung (
  id              uuid primary key default gen_random_uuid(),
  benutzer_id     uuid not null references public.benutzer (id),
  leistungsziel_id uuid not null references public.leistungsziel (id),
  stufe           public.einschaetzung_stufe not null,
  erreicht_am     date not null default current_date,
  notiz           text,
  erfasst_am      timestamptz not null default now()
);
create index selbsteinschaetzung_lz_idx
  on public.selbsteinschaetzung (benutzer_id, leistungsziel_id);
comment on table public.selbsteinschaetzung is 'Neue Zeile pro erreichter Stufe (Erklärt/Geübt/Selbstständig). Nie überschreiben; aktueller Stand = höchste Stufe.';

-- ---------- Noten: Komponentenbaum (Gewichte = Daten) + Fächer + Notenwerte ----------
create table public.notenkomponente (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,  -- 'IPA','INFORMATIK','INFORMATIK_BFS',...
  name          text not null,
  kontext       public.noten_kontext not null,
  parent_id     uuid references public.notenkomponente (id),
  gewicht       numeric(6,4) not null default 0,  -- Gewicht innerhalb des Parents
  ist_qualifikationsrelevant boolean not null default true,  -- z.B. Sport = false
  sortierung    int not null default 0,
  aktiv         boolean not null default true
);
comment on table public.notenkomponente is 'Notenformel als Daten. EFZ-Wurzeln: IPA/INFORMATIK/ABU/EGK. Gewichte änderbar ohne Code-Änderung.';

create table public.fach (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  modul_nr          text,
  kontext           public.noten_kontext not null,
  typ               text,              -- 'BFS-Modul','UEK-Modul','ABU','EGK','Sport','BM-Grundlagenfach'...
  notenkomponente_id uuid references public.notenkomponente (id),
  gewicht           numeric(6,4) not null default 1,  -- Gewicht innerhalb der Komponente
  aktiv             boolean not null default true,     -- inaktiv statt löschen
  bemerkung         text,
  sortierung        int not null default 0,
  erstellt_von      uuid references public.benutzer (id),
  erstellt_am       timestamptz not null default now()
);
comment on table public.fach is 'Fächerliste (Daten). Berufsbildner pflegt. Startdaten aus data/faecher.csv.';

create table public.note (
  id                uuid primary key default gen_random_uuid(),
  benutzer_id       uuid not null references public.benutzer (id),
  fach_id           uuid references public.fach (id),
  notenkomponente_id uuid references public.notenkomponente (id),  -- z.B. IPA-Note ohne Fach
  semester          int check (semester between 1 and 8),
  wert              numeric(3,1) not null check (wert >= 1 and wert <= 6),
  art               text,             -- 'erfahrung','pruefung','modul','ipa'
  datum             date not null default current_date,
  erfasst_am        timestamptz not null default now(),
  check (fach_id is not null or notenkomponente_id is not null)
);
create index note_benutzer_idx on public.note (benutzer_id);
comment on table public.note is 'Append-only. Aktueller Wert je (Lernende, Fach, Semester) = neueste Zeile.';

-- ---------- Bildungsbericht (Art. 13 BiVo, pro Semester, append-only) ----------
create table public.bildungsbericht (
  id           uuid primary key default gen_random_uuid(),
  benutzer_id  uuid not null references public.benutzer (id),
  semester     int not null check (semester between 1 and 8),
  datum        date not null default current_date,
  status       public.bericht_status not null default 'entwurf',
  inhalt       jsonb not null default '{}'::jsonb,   -- Formularfelder (flexibel für P0)
  erfasst_von  uuid references public.benutzer (id),
  erstellt_am  timestamptz not null default now()
);
create index bildungsbericht_benutzer_idx on public.bildungsbericht (benutzer_id, semester);

-- ---------- Team-Rotation ----------
create table public.team (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  entra_gruppe_id text,
  upn            text,                 -- Identifier aus Entra ID (authconcept.md)
  aktiv          boolean not null default true,
  erstellt_am    timestamptz not null default now()
);
comment on table public.team is 'Teams/Abteilungen, aus einer Entra-ID-Gruppe synchronisierbar (UPN als Identifier).';

create table public.team_zuteilung (
  id           uuid primary key default gen_random_uuid(),
  benutzer_id  uuid not null references public.benutzer (id),
  team_id      uuid not null references public.team (id),
  von_datum    date not null,
  bis_datum    date,
  notiz        text,
  erstellt_von uuid references public.benutzer (id),
  erstellt_am  timestamptz not null default now()
);
create index team_zuteilung_benutzer_idx on public.team_zuteilung (benutzer_id);

create table public.team_kompetenz (
  id                    uuid primary key default gen_random_uuid(),
  team_id               uuid not null references public.team (id) on delete cascade,
  handlungskompetenz_id uuid not null references public.handlungskompetenz (id) on delete cascade,
  unique (team_id, handlungskompetenz_id)
);
comment on table public.team_kompetenz is 'Pro Team zu bearbeitende Handlungskompetenzen (vom Berufsbildner zugewiesen).';

-- ---------- Handlungskompetenz-Status pro Lernendem (append-only Verlauf) ----------
create table public.kompetenz_status (
  id                    uuid primary key default gen_random_uuid(),
  benutzer_id           uuid not null references public.benutzer (id),
  handlungskompetenz_id uuid not null references public.handlungskompetenz (id),
  status                public.hk_status not null,
  notiz                 text,
  gesetzt_von           uuid references public.benutzer (id),
  gesetzt_am            timestamptz not null default now()
);
create index kompetenz_status_idx
  on public.kompetenz_status (benutzer_id, handlungskompetenz_id);
comment on table public.kompetenz_status is 'Nur Berufsbildner setzt Status (offen/in Arbeit/erledigt). Append-only; aktueller Status = neueste Zeile.';

-- ---------- SMTP-Einstellungen (Mail-Modul, mailmodule.md) ----------
create table public.smtp_einstellung (
  id              uuid primary key default gen_random_uuid(),
  host            text not null,
  port            int not null default 25,
  absender        text not null,
  benutzername    text,                -- optional (anonymes Relay möglich)
  passwort        text,                -- optional
  aktiv           boolean not null default true,
  aktualisiert_von uuid references public.benutzer (id),
  aktualisiert_am timestamptz not null default now()
);
comment on table public.smtp_einstellung is 'In der DB konfigurierbar (kein .env, kein Redeploy). Nur Berufsbildner (RLS).';
