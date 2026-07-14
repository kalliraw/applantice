-- =====================================================================
-- Bildungsbericht: Typen (Semesterbericht nach Art. 13 BiVo vs.
-- anlassbezogener Sonderbericht), eingefrorener Ausbildungsstand
-- (kennzahlen) und Entwurf-Workflow.
--
-- Bewusste Ausnahme zur Append-only-Regel (CLAUDE.md): Ein Bericht im
-- Status 'entwurf' darf noch bearbeitet und auf 'abgeschlossen' gestellt
-- werden. Sobald 'abgeschlossen', ist er unveränderlich – dann gilt er
-- als Historie und wird nie mehr überschrieben (UPDATE-Policy unten).
-- =====================================================================

-- Berichtstyp -------------------------------------------------------
create type public.bericht_typ as enum ('semester', 'sonderbericht');

alter table public.bildungsbericht
  add column typ public.bericht_typ not null default 'semester';

-- Eingefrorener Ausbildungsstand zum Zeitpunkt der Berichterstellung:
-- erledigte Handlungskompetenzen, Leistungsziel-Fortschritt, aktuelle
-- Vornote(n). Bewusst als jsonb, damit sich der Snapshot-Umfang
-- weiterentwickeln kann, ohne Migration.
alter table public.bildungsbericht
  add column kennzahlen jsonb not null default '{}'::jsonb;

-- Ein Sonderbericht ist nicht an ein Semester gebunden (Anlass mitten im
-- Semester). Das Semester bleibt für Semesterberichte Pflicht (per UI),
-- die Spalte selbst wird optional.
alter table public.bildungsbericht
  alter column semester drop not null;

comment on column public.bildungsbericht.typ is
  'semester = Pflicht-Semesterbericht (Art. 13 BiVo); sonderbericht = anlassbezogen (ungenügende Leistung/Problem, Gespräch zwingend).';
comment on column public.bildungsbericht.kennzahlen is
  'Eingefrorener Ausbildungsstand bei Erstellung (erledigte Kompetenzen, Leistungsziel-Fortschritt, Vornote). Nicht neu berechnen – Momentaufnahme.';

-- Berichte legt ausschliesslich der Berufsbildner an; Lernende lesen nur
-- (Entscheidung Isaak). Die ursprüngliche INSERT-Policy erlaubte auch dem
-- Lernenden das Anlegen eigener Berichte – hier auf Berufsbildner verengt.
drop policy if exists bb_insert on public.bildungsbericht;
create policy bb_insert on public.bildungsbericht for insert to authenticated
  with check (app.ist_berufsbildner());

-- UPDATE nur durch Berufsbildner und nur solange Entwurf; sobald
-- 'abgeschlossen' gesperrt (Historie).
create policy bb_update on public.bildungsbericht for update to authenticated
  using (status = 'entwurf' and app.ist_berufsbildner())
  with check (app.ist_berufsbildner());
