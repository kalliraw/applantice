#!/bin/bash
# =====================================================================
# Läuft einmalig bei der Erst-Initialisierung des Postgres-Volumes
# (docker-entrypoint-initdb.d). Stellt die Supabase-Service-Rollen und die
# auth-Helferfunktionen bereit, die GoTrue und PostgREST erwarten.
#
# Das supabase/postgres-Image bringt die meisten Rollen/Funktionen bereits mit;
# alles hier ist daher idempotent (IF NOT EXISTS / CREATE OR REPLACE) und setzt
# vor allem die Login-Passwörter der Verbindungsrollen aus den Compose-Env-Vars.
# =====================================================================
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  -- ---------- Service-Rollen (falls im Image nicht schon vorhanden) ----------
  do \$\$
  begin
    if not exists (select from pg_roles where rolname = 'anon') then
      create role anon nologin noinherit;
    end if;
    if not exists (select from pg_roles where rolname = 'authenticated') then
      create role authenticated nologin noinherit;
    end if;
    if not exists (select from pg_roles where rolname = 'service_role') then
      create role service_role nologin noinherit bypassrls;
    end if;
    if not exists (select from pg_roles where rolname = 'authenticator') then
      create role authenticator noinherit login;
    end if;
    if not exists (select from pg_roles where rolname = 'supabase_auth_admin') then
      create role supabase_auth_admin noinherit login createrole;
    end if;
    -- Weitere Standard-Supabase-Rollen, die manche GoTrue-/PostgREST-Migrationen
    -- per GRANT referenzieren (das nackte supabase/postgres-Image legt sie nicht an;
    -- im offiziellen Self-Hosting kommen sie aus roles.sql).
    if not exists (select from pg_roles where rolname = 'postgres') then
      create role postgres superuser login createdb createrole replication bypassrls;
    end if;
    if not exists (select from pg_roles where rolname = 'dashboard_user') then
      create role dashboard_user nologin createdb createrole replication;
    end if;
    if not exists (select from pg_roles where rolname = 'supabase_storage_admin') then
      create role supabase_storage_admin nologin;
    end if;
    if not exists (select from pg_roles where rolname = 'supabase_read_only_user') then
      create role supabase_read_only_user nologin bypassrls;
    end if;
  end
  \$\$;

  -- Login-Passwörter der Verbindungsrollen setzen (aus Compose-Env-Vars).
  alter role authenticator       with login password '${AUTHENTICATOR_PASSWORD}';
  alter role supabase_auth_admin  with login password '${AUTH_ADMIN_PASSWORD}' createrole;

  -- authenticator darf in die App-Rollen wechseln (PostgREST-Prinzip).
  grant anon, authenticated, service_role to authenticator;

  -- ---------- auth-Schema für GoTrue ----------
  create schema if not exists auth authorization supabase_auth_admin;
  grant all on schema auth to supabase_auth_admin;
  grant usage on schema auth to anon, authenticated, service_role;
  -- GoTrue legt seine Tabellen (users, refresh_tokens, schema_migrations ...) im
  -- auth-Schema an; ohne diesen Suchpfad landet es in public (kein CREATE-Recht).
  alter role supabase_auth_admin set search_path = auth;

  -- Hinweis: Die auth-Helferfunktionen (auth.uid()/auth.role()) werden NICHT hier
  -- angelegt – GoTrue erstellt sie beim Start selbst. Der Migrator ersetzt sie
  -- danach durch die kanonische Variante (liest sowohl legacy-GUC als auch das
  -- request.jwt.claims-JSON), siehe docker/migrator/apply.sh.
EOSQL

echo "[db-init] Supabase-Rollen und auth-Helfer bereitgestellt."
