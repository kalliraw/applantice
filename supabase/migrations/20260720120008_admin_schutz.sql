-- =====================================================================
-- Sicherheits-Nachzug zum 4-Rollen-Modell (20260720120006/120007).
--
-- 1) Admin-Rechte vergibt NUR ein Admin (roles.md). Die Policy benutzer_update
--    erlaubt "Verwaltung" (Berufsbildner ODER Admin) jede Änderung – damit konnte sich
--    ein Berufsbildner per direktem API-Call selbst zum Admin machen. Policies sehen
--    OLD/NEW nicht, daher ein Trigger. Für Nicht-Admins gilt:
--      * niemand wird (per Insert/Update) zum Admin gemacht,
--      * Admin-Konten: Rolle, aktiv, auth_user_id, E-Mail, auth_typ unveränderlich;
--        Löschen verboten (Name/UPN darf der Entra-Sync weiter pflegen),
--      * die eigene Rolle ist nicht änderbar,
--      * auth_user_id ist nicht änderbar (sonst Übernahme eines fremden Kontos samt
--        dessen Betreuungen).
--    Ohne JWT (Migrationen, Auth-Trigger bei Signup, service_role) greift der Schutz
--    nicht.
--
-- 2) Schreibrechte auf Bildungsberichte nur bei LAUFENDER Betreuung. Beendet der
--    Admin eine Betreuung (bis_datum = heute), darf der Berufsbildner keine Berichte
--    mehr anlegen/bearbeiten. Lesen bleibt wie in roles.md festgelegt (auch
--    abgeschlossene Betreuungen bleiben sichtbar, app.betreut()).
--
-- Idempotent. Auf frischer DB automatisch; auf laufender DB einmalig manuell
-- einspielen (supabase/README.md).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Admin-Schutz auf benutzer.
-- ---------------------------------------------------------------------
create or replace function app.schuetze_admin_rechte()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or app.ist_admin() then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if new.rolle = 'admin' then
      raise exception 'Nur ein Admin darf die Rolle Admin vergeben' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.rolle = 'admin' then
      raise exception 'Nur ein Admin darf Admin-Konten löschen' using errcode = '42501';
    end if;
    return old;
  end if;

  -- UPDATE
  if new.rolle = 'admin' and old.rolle is distinct from 'admin' then
    raise exception 'Nur ein Admin darf die Rolle Admin vergeben' using errcode = '42501';
  end if;
  if old.rolle = 'admin'
     and (new.rolle, new.aktiv, new.email::text, new.auth_typ)
         is distinct from (old.rolle, old.aktiv, old.email::text, old.auth_typ) then
    raise exception 'Nur ein Admin darf Admin-Konten ändern' using errcode = '42501';
  end if;
  if new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'Nur ein Admin darf die Konto-Verknüpfung ändern' using errcode = '42501';
  end if;
  if old.auth_user_id = auth.uid() and new.rolle is distinct from old.rolle then
    raise exception 'Die eigene Rolle ist nicht änderbar' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists benutzer_admin_schutz on public.benutzer;
create trigger benutzer_admin_schutz
  before insert or update or delete on public.benutzer
  for each row execute function app.schuetze_admin_rechte();

-- ---------------------------------------------------------------------
-- 2) Laufende Betreuung (für Schreibrechte).
--    Laufend = begonnen und nicht beendet. "Beenden" in der App setzt
--    bis_datum = heute -> ab sofort nicht mehr laufend.
-- ---------------------------------------------------------------------
create or replace function app.betreut_aktiv(ziel uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.betreuung b
    join public.benutzer me on me.id = b.berufsbildner_id
    where me.auth_user_id = auth.uid()
      and me.aktiv
      and b.lernende_id = ziel
      and b.von_datum <= current_date
      and (b.bis_datum is null or b.bis_datum > current_date)
  );
$$;
grant execute on function app.betreut_aktiv(uuid) to authenticated, anon;

drop policy if exists bb_insert on public.bildungsbericht;
create policy bb_insert on public.bildungsbericht for insert to authenticated
  with check (app.ist_admin() or app.betreut_aktiv(benutzer_id));
drop policy if exists bb_update on public.bildungsbericht;
create policy bb_update on public.bildungsbericht for update to authenticated
  using (status = 'entwurf' and (app.ist_admin() or app.betreut_aktiv(benutzer_id)))
  with check (app.ist_admin() or app.betreut_aktiv(benutzer_id));
