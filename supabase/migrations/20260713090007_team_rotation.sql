-- =====================================================================
-- Team-Rotation (Zeitstrahl): Modul→Semester-Planung, verantwortliche
-- Person je Team, und Zuweisung von Leistungszielen an Teams.
-- =====================================================================

-- Modul → Semester (global, für alle Lernenden gleich; schulspezifisch,
-- editierbar durch den Berufsbildner, kein Seed). fach_update-Policy erlaubt
-- Berufsbildner das Pflegen bereits.
alter table public.fach
  add column semester int check (semester between 1 and 8);
comment on column public.fach.semester is
  'Geplantes Schul-Semester (1-8), in dem das Modul unterrichtet wird. Global (für alle Lernenden gleich), schulspezifisch, vom Berufsbildner gepflegt.';

-- Verantwortliche Person je Team (App-/Entra-Benutzer).
alter table public.team
  add column verantwortlich_benutzer_id uuid references public.benutzer (id);
comment on column public.team.verantwortlich_benutzer_id is
  'Verantwortliche Person des Teams (Referenz auf benutzer, aus Entra gesynct).';

-- Ziel (Leistungsziel) → Team. Feinere Granularität als team_kompetenz
-- (Entscheidung Isaak: pro Leistungsziel statt pro Handlungskompetenz).
-- Basis der Soll-Planung: "Ziel X ist geplant in Semester Y bei Team Z".
create table public.team_leistungsziel (
  id               uuid primary key default gen_random_uuid(),
  team_id          uuid not null references public.team (id) on delete cascade,
  leistungsziel_id uuid not null references public.leistungsziel (id) on delete cascade,
  unique (team_id, leistungsziel_id)
);
comment on table public.team_leistungsziel is
  'Pro Team zu erreichende Leistungsziele (vom Berufsbildner zugewiesen).';

-- Tabellenrecht (neue Tabellen erben den Grant aus Migration 0002 nicht).
grant select, insert, update, delete on public.team_leistungsziel to authenticated;

alter table public.team_leistungsziel enable row level security;
create policy tlz_select on public.team_leistungsziel for select to authenticated using (true);
create policy tlz_write on public.team_leistungsziel for all to authenticated
  using (app.ist_berufsbildner()) with check (app.ist_berufsbildner());
