#!/bin/bash
# =====================================================================
# Wendet die versionskontrollierten Migrationen und den Seed an – dieselben
# Dateien, die lokal `npx supabase db reset` nutzt. Einmalig und idempotent:
# ist das Schema schon vorhanden (Tabelle public.benutzer), wird nichts getan,
# damit `docker compose up -d` beliebig oft laufen darf.
#
# Reihenfolge (siehe supabase/README.md): migrations/* alphabetisch, dann seed.sql.
# Läuft als Superuser 'postgres' -> ist Owner der Tabellen und umgeht RLS
# (Kanton-Daten/Seed lassen sich einspielen; App-Rollen können sie nicht ändern).
# =====================================================================
set -euo pipefail

echo "[migrator] warte auf Datenbank ${PGHOST}:5432 ..."
until pg_isready -q; do sleep 1; done

if [ "$(psql -tAc "select to_regclass('public.benutzer') is not null")" = "t" ]; then
  echo "[migrator] Schema bereits vorhanden – überspringe Migrationen und Seed."
  exit 0
fi

# Kanonische auth-Helfer: GoTrue hat auth.uid()/auth.role() bereits (legacy-Variante,
# liest nur request.jwt.claim.sub) angelegt. Als Superuser überschreiben wir sie durch
# eine Variante, die auch das request.jwt.claims-JSON versteht (PostgREST v12 setzt
# per Default nur dieses JSON, PGRST_DB_USE_LEGACY_GUCS=false).
echo "[migrator] installiere kanonische auth-Helfer ..."
psql -v ON_ERROR_STOP=1 <<'SQL'
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )
$$;
SQL

echo "[migrator] wende Migrationen an ..."
for f in $(ls /migrations/*.sql | sort); do
  echo "  -> $(basename "$f")"
  psql -v ON_ERROR_STOP=1 -f "$f"
done

echo "[migrator] wende Seed an ..."
psql -v ON_ERROR_STOP=1 -f /seed.sql

echo "[migrator] fertig. Benachrichtige PostgREST über Schema-Reload ..."
psql -v ON_ERROR_STOP=1 -c "notify pgrst, 'reload schema';" || true

echo "[migrator] abgeschlossen."
