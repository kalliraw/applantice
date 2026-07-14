-- =====================================================================
-- Auth-Verknüpfung: beim ersten Login (Entra ID SSO oder Break-Glass) wird der
-- neue auth.users-Datensatz über die E-Mail mit dem vorbereiteten benutzer-Eintrag
-- (Allowlist aus data/accounts.csv) verknüpft. Kein Treffer -> keine Rolle ->
-- RLS verweigert alles (deckt sich mit "Assignment required" in Entra, authconcept.md).
-- =====================================================================

create or replace function app.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Vergleich case-insensitiv über text, damit der (schema-abhängige) citext-Typ
  -- unter leerem search_path nicht namentlich referenziert werden muss.
  update public.benutzer
     set auth_user_id = new.id
   where lower(email::text) = lower(new.email)
     and auth_user_id is null;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();
