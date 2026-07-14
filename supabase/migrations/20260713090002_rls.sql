-- =====================================================================
-- Row Level Security – EINZIGER Zugriffsschutz (planung/techstack.md, roles.md).
-- Prinzip: RLS aktiv = deny by default. Ohne passende Policy -> kein Zugriff.
-- Der Tabellen-Owner (postgres, Migration/Seed) umgeht RLS -> Kanton-Daten und
-- Seed lassen sich einspielen; die App-Rollen (authenticated) können sie nicht ändern.
-- Append-only wird erzwungen, indem UPDATE/DELETE-Policies bewusst fehlen.
-- =====================================================================

-- Zugriff auf die Hilfsfunktionen (im privaten Schema app).
grant usage on schema app to authenticated, anon;
grant execute on function app.benutzer_id() to authenticated, anon;
grant execute on function app.rolle() to authenticated, anon;
grant execute on function app.ist_berufsbildner() to authenticated, anon;

-- Tabellenrechte an die eingeloggte Rolle; die Feinsteuerung macht RLS.
-- 'anon' (nicht eingeloggt) erhält bewusst keine Rechte.
grant select, insert, update, delete on all tables in schema public to authenticated;

-- RLS auf allen Tabellen aktivieren.
alter table public.benutzer            enable row level security;
alter table public.bereich             enable row level security;
alter table public.handlungskompetenz  enable row level security;
alter table public.leistungsziel       enable row level security;
alter table public.selbsteinschaetzung enable row level security;
alter table public.notenkomponente     enable row level security;
alter table public.fach                enable row level security;
alter table public.note                enable row level security;
alter table public.bildungsbericht     enable row level security;
alter table public.team                enable row level security;
alter table public.team_zuteilung      enable row level security;
alter table public.team_kompetenz      enable row level security;
alter table public.kompetenz_status    enable row level security;
alter table public.smtp_einstellung    enable row level security;

-- ---------- benutzer ----------
-- Lernende sehen sich selbst; Berufsbildner sehen alle. Verwaltung nur Berufsbildner.
create policy benutzer_select on public.benutzer for select to authenticated
  using (auth_user_id = auth.uid() or app.ist_berufsbildner());
create policy benutzer_insert on public.benutzer for insert to authenticated
  with check (app.ist_berufsbildner());
create policy benutzer_update on public.benutzer for update to authenticated
  using (app.ist_berufsbildner()) with check (app.ist_berufsbildner());

-- ---------- bereich / handlungskompetenz / leistungsziel ----------
-- Alle eingeloggten Rollen dürfen lesen (Kanton schreibgeschützt + Betrieblich).
create policy bereich_select on public.bereich for select to authenticated using (true);

create policy hk_select on public.handlungskompetenz for select to authenticated using (true);
-- Nur Berufsbildner, nur betriebliche Kompetenzen (Kanton bleibt unveränderlich).
create policy hk_insert on public.handlungskompetenz for insert to authenticated
  with check (app.ist_berufsbildner() and quelle = 'betrieblich');
create policy hk_update on public.handlungskompetenz for update to authenticated
  using (app.ist_berufsbildner() and quelle = 'betrieblich')
  with check (app.ist_berufsbildner() and quelle = 'betrieblich');
create policy hk_delete on public.handlungskompetenz for delete to authenticated
  using (app.ist_berufsbildner() and quelle = 'betrieblich');

create policy lz_select on public.leistungsziel for select to authenticated using (true);
-- Schreiben nur für Leistungsziele betrieblicher Kompetenzen, nur Berufsbildner.
create policy lz_insert on public.leistungsziel for insert to authenticated
  with check (app.ist_berufsbildner() and exists (
    select 1 from public.handlungskompetenz h
    where h.id = handlungskompetenz_id and h.quelle = 'betrieblich'));
create policy lz_update on public.leistungsziel for update to authenticated
  using (app.ist_berufsbildner() and exists (
    select 1 from public.handlungskompetenz h
    where h.id = handlungskompetenz_id and h.quelle = 'betrieblich'))
  with check (app.ist_berufsbildner() and exists (
    select 1 from public.handlungskompetenz h
    where h.id = handlungskompetenz_id and h.quelle = 'betrieblich'));
create policy lz_delete on public.leistungsziel for delete to authenticated
  using (app.ist_berufsbildner() and exists (
    select 1 from public.handlungskompetenz h
    where h.id = handlungskompetenz_id and h.quelle = 'betrieblich'));

-- ---------- selbsteinschaetzung (append-only) ----------
create policy se_select on public.selbsteinschaetzung for select to authenticated
  using (benutzer_id = app.benutzer_id() or app.ist_berufsbildner());
-- Lernende erfassen nur für sich selbst. Kein UPDATE/DELETE -> Verlauf unveränderlich.
create policy se_insert on public.selbsteinschaetzung for insert to authenticated
  with check (benutzer_id = app.benutzer_id());

-- ---------- notenkomponente (Gewichte = Daten, Berufsbildner pflegt) ----------
create policy nk_select on public.notenkomponente for select to authenticated using (true);
create policy nk_insert on public.notenkomponente for insert to authenticated
  with check (app.ist_berufsbildner());
create policy nk_update on public.notenkomponente for update to authenticated
  using (app.ist_berufsbildner()) with check (app.ist_berufsbildner());

-- ---------- fach (Berufsbildner pflegt; kein DELETE -> inaktiv statt löschen) ----------
create policy fach_select on public.fach for select to authenticated using (true);
create policy fach_insert on public.fach for insert to authenticated
  with check (app.ist_berufsbildner());
create policy fach_update on public.fach for update to authenticated
  using (app.ist_berufsbildner()) with check (app.ist_berufsbildner());

-- ---------- note (Lernende erfassen eigene; append-only) ----------
create policy note_select on public.note for select to authenticated
  using (benutzer_id = app.benutzer_id() or app.ist_berufsbildner());
create policy note_insert on public.note for insert to authenticated
  with check (benutzer_id = app.benutzer_id());

-- ---------- bildungsbericht (Lernende füllen eigene; Berufsbildner Aufsicht; append-only) ----------
create policy bb_select on public.bildungsbericht for select to authenticated
  using (benutzer_id = app.benutzer_id() or app.ist_berufsbildner());
create policy bb_insert on public.bildungsbericht for insert to authenticated
  with check (benutzer_id = app.benutzer_id() or app.ist_berufsbildner());

-- ---------- team / team_kompetenz (Berufsbildner verwaltet; alle lesen) ----------
create policy team_select on public.team for select to authenticated using (true);
create policy team_write on public.team for all to authenticated
  using (app.ist_berufsbildner()) with check (app.ist_berufsbildner());

create policy tk_select on public.team_kompetenz for select to authenticated using (true);
create policy tk_write on public.team_kompetenz for all to authenticated
  using (app.ist_berufsbildner()) with check (app.ist_berufsbildner());

-- ---------- team_zuteilung (Lernende sehen eigene; Berufsbildner verwaltet) ----------
create policy tz_select on public.team_zuteilung for select to authenticated
  using (benutzer_id = app.benutzer_id() or app.ist_berufsbildner());
create policy tz_write on public.team_zuteilung for all to authenticated
  using (app.ist_berufsbildner()) with check (app.ist_berufsbildner());

-- ---------- kompetenz_status (nur Berufsbildner setzt; Lernende sehen eigene; append-only) ----------
create policy ks_select on public.kompetenz_status for select to authenticated
  using (benutzer_id = app.benutzer_id() or app.ist_berufsbildner());
create policy ks_insert on public.kompetenz_status for insert to authenticated
  with check (app.ist_berufsbildner());

-- ---------- smtp_einstellung (nur Berufsbildner, enthält Secrets) ----------
create policy smtp_all on public.smtp_einstellung for all to authenticated
  using (app.ist_berufsbildner()) with check (app.ist_berufsbildner());
