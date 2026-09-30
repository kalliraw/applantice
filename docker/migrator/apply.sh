#!/bin/bash
# =====================================================================
# Wendet die versionskontrollierten Migrationen und den Seed an – dieselben
# Dateien, die lokal `npx supabase db reset` nutzt. Läuft bei JEDEM
# `docker compose up` und spielt nur NEUE Migrationen ein:
#
#   * Buchführung in migrator.angewendet (Dateiname + Zeitpunkt).
#   * Jede Migration läuft in EINER Transaktion zusammen mit ihrem Eintrag –
#     schlägt sie fehl, bleibt die DB unverändert und der Stack startet nicht
#     (rest wartet auf service_completed_successfully).
#   * Frische DB: alle Migrationen, danach seed.sql – ebenfalls gebucht (Eintrag
#     'seed.sql'), damit ein fehlgeschlagener Seed beim nächsten Start erneut läuft.
#   * Bestehende DB ohne Buchführung (vor Einführung dieses Skripts per Hand
#     gepflegt): Migrationen mit "Idempotent" im Kopf werden (erneut) eingespielt –
#     sie dürfen mehrfach laufen und holen so evtl. vergessene manuelle Schritte
#     nach –, alle anderen und der Seed gelten als bereits angewendet (Basis-Schema).
#
# Reihenfolge: migrations/* alphabetisch, dann seed.sql.
# Läuft als Superuser -> ist Owner der Tabellen und umgeht RLS
# (Kanton-Daten/Seed lassen sich einspielen; App-Rollen können sie nicht ändern).
# =====================================================================
set -euo pipefail

psql_q() { psql -v ON_ERROR_STOP=1 -qtAX "$@"; }

echo "[migrator] warte auf Datenbank ${PGHOST}:5432 ..."
until pg_isready -q; do sleep 1; done

# Kanonische auth-Helfer: GoTrue hat auth.uid()/auth.role() bereits (legacy-Variante,
# liest nur request.jwt.claim.sub) angelegt. Als Superuser überschreiben wir sie durch
# eine Variante, die auch das request.jwt.claims-JSON versteht (PostgREST v12 setzt
# per Default nur dieses JSON, PGRST_DB_USE_LEGACY_GUCS=false). Idempotent -> jedes Mal.
echo "[migrator] installiere kanonische auth-Helfer ..."
psql -v ON_ERROR_STOP=1 -q <<'SQL'
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

frisch=true
[ "$(psql_q -c "select to_regclass('public.benutzer') is not null")" = "t" ] && frisch=false
ohne_buchfuehrung=true
[ "$(psql_q -c "select to_regclass('migrator.angewendet') is not null")" = "t" ] && ohne_buchfuehrung=false

psql -v ON_ERROR_STOP=1 -q <<'SQL'
create schema if not exists migrator;
revoke all on schema migrator from public;
create table if not exists migrator.angewendet (
  datei         text primary key,
  angewendet_am timestamptz not null default now(),
  art           text not null default 'ausgefuehrt'  -- 'ausgefuehrt' | 'baseline'
);
SQL

if [ "$frisch" = false ] && [ "$ohne_buchfuehrung" = true ]; then
  echo "[migrator] bestehende DB ohne Buchführung – lege Baseline an ..."
  psql_q -c "insert into migrator.angewendet (datei, art) values ('seed.sql', 'baseline') on conflict do nothing"
  for f in $(ls /migrations/*.sql | sort); do
    name="$(basename "$f")"
    if grep -qi 'idempotent' "$f"; then
      echo "  -> $name: idempotent, wird eingespielt"
    else
      echo "  -> $name: als angewendet markiert (Basis-Schema)"
      psql_q -v datei="$name" <<'SQL'
insert into migrator.angewendet (datei, art) values (:'datei', 'baseline') on conflict do nothing;
SQL
    fi
  done
fi

echo "[migrator] prüfe Migrationen ..."
angewendet="$(psql_q -c "select datei from migrator.angewendet")"
# psql interpoliert Variablen nur in Dateien/stdin, nicht in -c -> Eintrag als Datei.
eintrag="$(mktemp)"
echo "insert into migrator.angewendet (datei) values (:'datei');" > "$eintrag"
neu=0
for f in $(ls /migrations/*.sql | sort); do
  name="$(basename "$f")"
  if grep -qxF "$name" <<< "$angewendet"; then
    continue
  fi
  echo "  -> $name"
  # Migration + Eintrag atomar (eine Transaktion).
  psql -v ON_ERROR_STOP=1 -q --single-transaction -v datei="$name" -f "$f" -f "$eintrag"
  neu=$((neu + 1))
done
rm -f "$eintrag"
echo "[migrator] $neu neue Migration(en) angewendet."

if ! grep -qxF "seed.sql" <<< "$angewendet"; then
  # Schutz: Seed-Daten schon vorhanden (z.B. DB von Hand gepflegt) -> nur buchen.
  if [ "$(psql_q -c "select exists (select 1 from public.notenkomponente)")" = "t" ]; then
    echo "[migrator] Seed-Daten bereits vorhanden – buche seed.sql als Baseline."
    psql_q -c "insert into migrator.angewendet (datei, art) values ('seed.sql', 'baseline') on conflict do nothing"
    angewendet="$angewendet"$'\n'"seed.sql"
  fi
fi
if ! grep -qxF "seed.sql" <<< "$angewendet"; then
  echo "[migrator] wende Seed an ..."
  # seed.sql steuert seine Transaktion selbst (begin/commit) -> Eintrag danach.
  psql -v ON_ERROR_STOP=1 -q -f /seed.sql
  psql_q -c "insert into migrator.angewendet (datei) values ('seed.sql')"
fi

echo "[migrator] benachrichtige PostgREST über Schema-Reload ..."
psql -v ON_ERROR_STOP=1 -q -c "notify pgrst, 'reload schema';" || true

echo "[migrator] abgeschlossen."
