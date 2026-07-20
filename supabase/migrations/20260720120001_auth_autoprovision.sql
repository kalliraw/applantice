-- =====================================================================
-- Erst-Login: Auto-Provisionierung OHNE Rolle.
--
-- Ersetzt app.handle_new_user() aus 20260713090003_auth.sql. Neu: meldet sich ein
-- Entra-/SSO-Benutzer an, für den es noch KEINEN Allowlist-Eintrag gibt, wird ein
-- benutzer-Datensatz OHNE Rolle angelegt (rolle IS NULL). Rollen vergibt
-- ausschliesslich der Berufsbildner in der App (Einstellungen > Benutzer).
--
-- Wichtig: Es wird NIE eine Default-Rolle (z.B. berufsbildner) gesetzt. Rollenlos
-- bedeutet: RLS verweigert alles (app.ist_berufsbildner()/benutzer_id() liefern
-- nichts) – der Account ist sichtbar für den Berufsbildner, aber ohne Zugriff, bis
-- eine Rolle zugewiesen wurde. Deckt sich mit "Assignment required" in Entra
-- (authconcept.md): unerwünschte Konten kommen gar nicht erst bis hierher.
--
-- Idempotent (create or replace + drop trigger if exists) – darf mehrfach laufen.
-- Wird auf einer frischen DB automatisch angewandt; auf einer bereits
-- initialisierten DB einmalig manuell einspielen (siehe supabase/README.md).
-- =====================================================================

create or replace function app.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- 1) Vorhandenen Eintrag (Allowlist-Seed oder per Entra-Sync angelegt) über die
  --    E-Mail verknüpfen. Die dort hinterlegte Rolle bleibt unangetastet.
  --    Vergleich case-insensitiv über text (citext-Typname unter leerem search_path
  --    nicht referenzierbar).
  update public.benutzer
     set auth_user_id = new.id
   where lower(email::text) = lower(new.email)
     and auth_user_id is null;

  -- 2) Kein Treffer -> neuen Benutzer OHNE Rolle anlegen (rolle = NULL).
  if not found then
    insert into public.benutzer (auth_user_id, email, name, rolle, auth_typ)
    values (
      new.id,
      new.email,
      coalesce(
        nullif(new.raw_user_meta_data ->> 'full_name', ''),
        nullif(new.raw_user_meta_data ->> 'name', ''),
        new.email
      ),
      null,          -- NIE eine Default-Rolle vergeben – der Berufsbildner weist zu.
      'entra_id'
    )
    -- Falls parallel bereits eine (rollen-)Zeile mit dieser E-Mail existiert:
    -- nur verknüpfen, Rolle NICHT überschreiben.
    on conflict (email) do update set auth_user_id = excluded.auth_user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();
