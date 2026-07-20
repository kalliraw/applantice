-- =====================================================================
-- 4-Rollen-Modell: Teamowner + Admin + Betreuungs-Beziehung (planung/roles.md).
--
-- Kern der Änderung ist RLS, nicht das Frontend:
--   * Berufsbildner sehen personenbezogene Lernenden-Daten nur noch für die ihnen
--     ZUGEWIESENEN Lernenden (Tabelle betreuung), nicht mehr für alle.
--   * Admin sieht/verwaltet alles (Super-Berufsbildner, inkl. Break-Glass).
--   * Teamowner sieht ausschliesslich die Ziele + Team-Zuteilungen seiner Teams
--     (keine Noten/Berichte/Selbsteinschätzungen).
--
-- Setzt 20260720120005 (Enum-Werte) voraus. Idempotent (create or replace / drop
-- policy if exists / if not exists). Auf frischer DB automatisch; auf laufender DB
-- einmalig manuell einspielen (supabase/README.md).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Betreuungs-Beziehung: Berufsbildner ↔ Lernende (historisiert).
-- ---------------------------------------------------------------------
create table if not exists public.betreuung (
  id               uuid primary key default gen_random_uuid(),
  berufsbildner_id uuid not null references public.benutzer (id),
  lernende_id      uuid not null references public.benutzer (id),
  von_datum        date not null default current_date,
  bis_datum        date,                 -- offen = laufende Betreuung
  notiz            text,
  erstellt_von     uuid references public.benutzer (id),
  erstellt_am      timestamptz not null default now()
);
create index if not exists betreuung_bb_idx on public.betreuung (berufsbildner_id);
create index if not exists betreuung_lernende_idx on public.betreuung (lernende_id);
comment on table public.betreuung is
  'Zuweisung Berufsbildner->Lernende. Mehrere BB pro Lernendem möglich, historisiert (bis_datum). Steuert die RLS-Sicht der Berufsbildner auf Lernenden-Daten (roles.md).';

grant select, insert, update, delete on public.betreuung to authenticated;

-- ---------------------------------------------------------------------
-- 2) RLS-Hilfsfunktionen (SECURITY DEFINER -> lesen ohne RLS-Rekursion).
-- ---------------------------------------------------------------------
create or replace function app.ist_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.benutzer
    where auth_user_id = auth.uid() and rolle = 'admin' and aktiv
  );
$$;

-- "Verwaltung" = darf globale Konfiguration pflegen (Berufsbildner ODER Admin).
create or replace function app.ist_verwaltung()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.benutzer
    where auth_user_id = auth.uid() and rolle in ('berufsbildner', 'admin') and aktiv
  );
$$;

-- Betreut der aktuelle Benutzer (als Berufsbildner) diese lernende Person?
-- Sichtbar ab Betreuungsbeginn (von_datum <= heute); abgeschlossene bleiben sichtbar.
create or replace function app.betreut(ziel uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.betreuung b
    join public.benutzer me on me.id = b.berufsbildner_id
    where me.auth_user_id = auth.uid()
      and me.aktiv
      and b.lernende_id = ziel
      and b.von_datum <= current_date
  );
$$;

-- Zentrale Sicht-Regel für personenbezogene Lernenden-Daten:
-- eigene Daten ODER Admin ODER (Berufsbildner mit Betreuung dieses Lernenden).
create or replace function app.darf_lernende_daten(ziel uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select ziel = app.benutzer_id()
      or app.ist_admin()
      or app.betreut(ziel);
$$;

-- Ist der aktuelle Benutzer verantwortlich für dieses Team? (Teamowner)
create or replace function app.ist_teamverantwortlich(team uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.team t
    join public.benutzer me on me.id = t.verantwortlich_benutzer_id
    where t.id = team and me.auth_user_id = auth.uid() and me.aktiv
  );
$$;

-- Ist dieser Lernende in einem Team, das der aktuelle Benutzer verantwortet?
-- (Damit der Teamowner NUR die Namen seiner Team-Mitglieder sieht.)
create or replace function app.teamowner_sieht_lernende(ziel uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.team_zuteilung tz
    join public.team t on t.id = tz.team_id
    join public.benutzer me on me.id = t.verantwortlich_benutzer_id
    where tz.benutzer_id = ziel and me.auth_user_id = auth.uid() and me.aktiv
  );
$$;

grant execute on function app.ist_admin() to authenticated, anon;
grant execute on function app.ist_verwaltung() to authenticated, anon;
grant execute on function app.betreut(uuid) to authenticated, anon;
grant execute on function app.darf_lernende_daten(uuid) to authenticated, anon;
grant execute on function app.ist_teamverantwortlich(uuid) to authenticated, anon;
grant execute on function app.teamowner_sieht_lernende(uuid) to authenticated, anon;

-- ---------------------------------------------------------------------
-- 3) RLS für betreuung selbst.
-- ---------------------------------------------------------------------
alter table public.betreuung enable row level security;
drop policy if exists betr_select on public.betreuung;
create policy betr_select on public.betreuung for select to authenticated
  using (
    app.ist_verwaltung()
    or lernende_id = app.benutzer_id()
    or berufsbildner_id = app.benutzer_id()
  );
drop policy if exists betr_write on public.betreuung;
create policy betr_write on public.betreuung for all to authenticated
  using (app.ist_verwaltung()) with check (app.ist_verwaltung());

-- ---------------------------------------------------------------------
-- 4) Bestehende Policies neu fassen.
--    Muster:
--      * globale Konfiguration  -> app.ist_verwaltung()   (BB + Admin)
--      * Lernenden-Fachdaten    -> app.darf_lernende_daten(benutzer_id)
--      * benutzer/team_zuteilung -> zusätzlich Teamowner-Sicht
-- ---------------------------------------------------------------------

-- ----- benutzer -----
-- Sichtbar: eigenes Konto; Verwaltung (Namen aller – für Planung/Zuweisung nötig);
-- Teamowner nur die Mitglieder seiner Teams.
drop policy if exists benutzer_select on public.benutzer;
create policy benutzer_select on public.benutzer for select to authenticated
  using (
    auth_user_id = auth.uid()
    or app.ist_verwaltung()
    or app.teamowner_sieht_lernende(id)
  );
drop policy if exists benutzer_insert on public.benutzer;
create policy benutzer_insert on public.benutzer for insert to authenticated
  with check (app.ist_verwaltung());
drop policy if exists benutzer_update on public.benutzer;
create policy benutzer_update on public.benutzer for update to authenticated
  using (app.ist_verwaltung()) with check (app.ist_verwaltung());
drop policy if exists benutzer_delete on public.benutzer;
create policy benutzer_delete on public.benutzer for delete to authenticated
  using (app.ist_verwaltung());

-- ----- handlungskompetenz (betrieblich, global) -----
drop policy if exists hk_insert on public.handlungskompetenz;
create policy hk_insert on public.handlungskompetenz for insert to authenticated
  with check (app.ist_verwaltung() and quelle = 'betrieblich');
drop policy if exists hk_update on public.handlungskompetenz;
create policy hk_update on public.handlungskompetenz for update to authenticated
  using (app.ist_verwaltung() and quelle = 'betrieblich')
  with check (app.ist_verwaltung() and quelle = 'betrieblich');
drop policy if exists hk_delete on public.handlungskompetenz;
create policy hk_delete on public.handlungskompetenz for delete to authenticated
  using (app.ist_verwaltung() and quelle = 'betrieblich');

-- ----- leistungsziel (betrieblich, global) -----
drop policy if exists lz_insert on public.leistungsziel;
create policy lz_insert on public.leistungsziel for insert to authenticated
  with check (app.ist_verwaltung() and exists (
    select 1 from public.handlungskompetenz h
    where h.id = handlungskompetenz_id and h.quelle = 'betrieblich'));
drop policy if exists lz_update on public.leistungsziel;
create policy lz_update on public.leistungsziel for update to authenticated
  using (app.ist_verwaltung() and exists (
    select 1 from public.handlungskompetenz h
    where h.id = handlungskompetenz_id and h.quelle = 'betrieblich'))
  with check (app.ist_verwaltung() and exists (
    select 1 from public.handlungskompetenz h
    where h.id = handlungskompetenz_id and h.quelle = 'betrieblich'));
drop policy if exists lz_delete on public.leistungsziel;
create policy lz_delete on public.leistungsziel for delete to authenticated
  using (app.ist_verwaltung() and exists (
    select 1 from public.handlungskompetenz h
    where h.id = handlungskompetenz_id and h.quelle = 'betrieblich'));

-- ----- selbsteinschaetzung (Lernenden-Fachdaten) -----
drop policy if exists se_select on public.selbsteinschaetzung;
create policy se_select on public.selbsteinschaetzung for select to authenticated
  using (app.darf_lernende_daten(benutzer_id));
-- Insert bleibt: nur die lernende Person selbst (append-only).

-- ----- notenkomponente (global) -----
drop policy if exists nk_insert on public.notenkomponente;
create policy nk_insert on public.notenkomponente for insert to authenticated
  with check (app.ist_verwaltung());
drop policy if exists nk_update on public.notenkomponente;
create policy nk_update on public.notenkomponente for update to authenticated
  using (app.ist_verwaltung()) with check (app.ist_verwaltung());

-- ----- fach (global) -----
drop policy if exists fach_insert on public.fach;
create policy fach_insert on public.fach for insert to authenticated
  with check (app.ist_verwaltung());
drop policy if exists fach_update on public.fach;
create policy fach_update on public.fach for update to authenticated
  using (app.ist_verwaltung()) with check (app.ist_verwaltung());

-- ----- note (Lernenden-Fachdaten) -----
drop policy if exists note_select on public.note;
create policy note_select on public.note for select to authenticated
  using (app.darf_lernende_daten(benutzer_id));
-- Insert bleibt: nur die lernende Person selbst (append-only).

-- ----- leistungsbeurteilung (Lernenden-Fachdaten; migration 0004) -----
drop policy if exists lb_select on public.leistungsbeurteilung;
create policy lb_select on public.leistungsbeurteilung for select to authenticated
  using (app.darf_lernende_daten(benutzer_id));
-- Insert/Update/Delete bleiben: nur die lernende Person selbst.

-- ----- bildungsbericht (Lernenden-Fachdaten) -----
-- Berichte legt/pflegt NUR der betreuende Berufsbildner bzw. Admin an (Entscheidung
-- Isaak, migration 0006) – der Lernende liest nur. Daher hier bewusst NICHT die
-- eigene-Daten-Regel (kein Lernender-Insert), sondern Admin oder Betreuung.
drop policy if exists bb_select on public.bildungsbericht;
create policy bb_select on public.bildungsbericht for select to authenticated
  using (app.darf_lernende_daten(benutzer_id));
drop policy if exists bb_insert on public.bildungsbericht;
create policy bb_insert on public.bildungsbericht for insert to authenticated
  with check (app.ist_admin() or app.betreut(benutzer_id));
-- UPDATE nur solange Entwurf und nur durch den betreuenden BB/Admin (Historie-Schutz).
drop policy if exists bb_update on public.bildungsbericht;
create policy bb_update on public.bildungsbericht for update to authenticated
  using (status = 'entwurf' and (app.ist_admin() or app.betreut(benutzer_id)))
  with check (app.ist_admin() or app.betreut(benutzer_id));

-- ----- kompetenz_status (Lernenden-Fachdaten; wird automatisch abgeleitet) -----
drop policy if exists ks_select on public.kompetenz_status;
create policy ks_select on public.kompetenz_status for select to authenticated
  using (app.darf_lernende_daten(benutzer_id));
drop policy if exists ks_insert on public.kompetenz_status;
create policy ks_insert on public.kompetenz_status for insert to authenticated
  with check (app.ist_verwaltung());

-- ----- team / team_kompetenz / team_leistungsziel (global; alle lesen) -----
drop policy if exists team_write on public.team;
create policy team_write on public.team for all to authenticated
  using (app.ist_verwaltung()) with check (app.ist_verwaltung());
drop policy if exists tk_write on public.team_kompetenz;
create policy tk_write on public.team_kompetenz for all to authenticated
  using (app.ist_verwaltung()) with check (app.ist_verwaltung());
drop policy if exists tlz_write on public.team_leistungsziel;
create policy tlz_write on public.team_leistungsziel for all to authenticated
  using (app.ist_verwaltung()) with check (app.ist_verwaltung());

-- ----- team_zuteilung (eigene; Verwaltung; Teamowner seiner Teams) -----
drop policy if exists tz_select on public.team_zuteilung;
create policy tz_select on public.team_zuteilung for select to authenticated
  using (
    benutzer_id = app.benutzer_id()
    or app.ist_verwaltung()
    or app.ist_teamverantwortlich(team_id)
  );
drop policy if exists tz_write on public.team_zuteilung;
create policy tz_write on public.team_zuteilung for all to authenticated
  using (app.ist_verwaltung()) with check (app.ist_verwaltung());

-- ----- benachrichtigung_einstellung (global; migration 120004) -----
drop policy if exists benachr_select on public.benachrichtigung_einstellung;
create policy benachr_select on public.benachrichtigung_einstellung for select to authenticated
  using (app.ist_verwaltung());
drop policy if exists benachr_write on public.benachrichtigung_einstellung;
create policy benachr_write on public.benachrichtigung_einstellung for all to authenticated
  using (app.ist_verwaltung()) with check (app.ist_verwaltung());

-- ----- mail_log (global; migration 120003) -----
drop policy if exists mail_log_select on public.mail_log;
create policy mail_log_select on public.mail_log for select to authenticated
  using (app.ist_verwaltung());

-- ---------------------------------------------------------------------
-- 5) Admin-Bootstrap: der Break-Glass-Login wird Admin.
--    Ohne bestehenden Admin könnte niemand die neuen Rollen/Betreuungen vergeben
--    (eigene Rolle ist in der App gesperrt). Der lokale Break-Glass-Account ist der
--    Einstieg (per Definition der EINZIGE auth_typ='lokal'-Account, roles.md/
--    authconcept.md) – unabhängig von seiner konkreten E-Mail (die sich über die
--    Zeit geändert hat: admin@ / ausbildungsplan-admin@). Nur setzen, solange er
--    noch berufsbildner ist (bestehende Admins nicht anrühren).
-- ---------------------------------------------------------------------
update public.benutzer
   set rolle = 'admin'
 where auth_typ = 'lokal'
   and rolle = 'berufsbildner';
