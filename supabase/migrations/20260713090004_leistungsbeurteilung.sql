-- =====================================================================
-- Leistungsbeurteilungen (LB) + BM-Dispensation.
-- Ein Modul/Fach besteht aus mehreren LBs (Prüfungen, VA, ...) mit eigener
-- Gewichtung. Die Modulnote ist der gewichtete Schnitt seiner LBs; die
-- Komponentennote der gewichtete Schnitt der Modulnoten (fach.gewicht).
--
-- Anders als die append-only note-Tabelle ist eine LB das aktuelle "Notenbuch"
-- und daher editier-/löschbar (Korrekturen, Gewichtsanpassung) – bewusst, weil
-- die granulare Notengebung genau das erfordert.
-- =====================================================================

-- BM: nicht-Informatik-Komponenten (ABU/EGK/Sport) entfallen für BM-Lernende.
alter table public.notenkomponente
  add column entfaellt_bei_bm boolean not null default false;

create table public.leistungsbeurteilung (
  id           uuid primary key default gen_random_uuid(),
  benutzer_id  uuid not null references public.benutzer (id),
  fach_id      uuid not null references public.fach (id),
  titel        text not null,          -- z.B. 'LB1', 'Vertiefungsarbeit', 'Schlussprüfung'
  gewicht      numeric(6,3) not null default 1,   -- Gewicht innerhalb des Moduls
  wert         numeric(3,1) not null check (wert >= 1 and wert <= 6),
  datum        date not null default current_date,
  semester     int check (semester between 1 and 8),
  erfasst_am   timestamptz not null default now()
);
create index leistungsbeurteilung_idx on public.leistungsbeurteilung (benutzer_id, fach_id);
comment on table public.leistungsbeurteilung is 'Einzelne Prüfungsnoten je Modul mit Gewichtung. Modulnote = gewichteter Schnitt.';

grant select, insert, update, delete on public.leistungsbeurteilung to authenticated;
alter table public.leistungsbeurteilung enable row level security;

-- Lernende verwalten die eigenen LBs; Berufsbildner sehen alle (schreibgeschützt).
create policy lb_select on public.leistungsbeurteilung for select to authenticated
  using (benutzer_id = app.benutzer_id() or app.ist_berufsbildner());
create policy lb_insert on public.leistungsbeurteilung for insert to authenticated
  with check (benutzer_id = app.benutzer_id());
create policy lb_update on public.leistungsbeurteilung for update to authenticated
  using (benutzer_id = app.benutzer_id()) with check (benutzer_id = app.benutzer_id());
create policy lb_delete on public.leistungsbeurteilung for delete to authenticated
  using (benutzer_id = app.benutzer_id());
