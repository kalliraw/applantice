# Containerisierung (Docker Compose)

Die gesamte Anwendung – Frontend **und** Backend – startet mit einem Befehl.
Es wird **kein Quellcode verändert**; die bestehenden Dateien in `frontend/` und
`supabase/` werden nur eingebunden.

```bash
docker compose up -d          # baut das Frontend beim ersten Mal automatisch und
                              # fährt den ganzen Stack hoch
# App:            http://localhost:8080
```

Stoppen / aufräumen:

```bash
docker compose down           # stoppt alles, Datenbank-Volume bleibt erhalten
docker compose down -v        # zusätzlich Datenbank-Volume löschen (frischer Seed)
docker compose up -d --build  # Frontend nach Änderungen neu bauen
```

## Was läuft

| Service    | Image                     | Rolle |
|------------|---------------------------|-------|
| `db`       | `supabase/postgres`       | Postgres + Supabase-Rollen; `docker/db/init` legt Service-Rollen & `auth`-Schema an |
| `auth`     | `supabase/gotrue`         | Authentifizierung (E-Mail-Break-Glass + optional Entra ID) |
| `migrator` | `supabase/postgres`       | Einmalig: wendet `supabase/migrations/*` + `supabase/seed.sql` an (idempotent) |
| `rest`     | `postgrest/postgrest`     | REST + RPC auf `public` |
| `web`      | selbst gebaut (Vite+nginx)| liefert die SPA **und** proxyt `/auth/v1` + `/rest/v1` auf denselben Origin |

Weil `web` Frontend und API unter demselben Origin ausliefert, ist
`VITE_SUPABASE_URL` schlicht die App-URL selbst – kein CORS, kein separates Gateway.
Das Frontend nutzt nur Auth (`signInWithPassword`/OAuth/Session) und PostgREST
(`.from()` / `.rpc()`); Storage, Realtime und Edge Functions werden nicht gebraucht
und daher bewusst nicht gestartet.

## Konfiguration & Versionen

Alle Image-Versionen, Ports und Secrets stehen als überschreibbare Variablen in
`docker-compose.yml`. Zum Anpassen `cp .env.example .env` und Werte setzen – ohne
`.env` gelten die Defaults.

- **Versionen** (`POSTGRES_VERSION`, `GOTRUE_VERSION`, `POSTGREST_VERSION`,
  `NODE_VERSION`, `NGINX_VERSION`) lassen sich einzeln anheben.
- **Secrets**: Die Defaults sind die offiziellen Supabase-Self-Hosting-**Demo-Keys**
  (`JWT_SECRET`/`ANON_KEY` gehören zusammen). **Vor Produktivbetrieb ersetzen.**
- **Port/URL**: `APP_PORT` und der Host-Teil von `PUBLIC_URL` müssen zusammenpassen.
  Nach einer URL-Änderung `docker compose up -d --build web` (Vite bäckt die URL ein).
- **Entra ID SSO**: Standard aus. Zum Aktivieren `GOTRUE_EXTERNAL_AZURE_ENABLED=true`
  und die drei Azure-Variablen in `.env` setzen (Secrets nie committen).

## Break-Glass-Login

Der Seed legt den lokalen Admin aus `data/accounts.csv` an
(`admin@swisstph.ch`). Nach dem ersten Login das Passwort ändern und – wie in
`supabase/README.md` beschrieben – `passwort_platzhalter` leeren.
