# Supabase-Backend

Enthält die **versionskontrollierte Wahrheit** des Datenmodells: Migrationen und Seed.
Dasselbe Schema läuft lokal (Supabase CLI) und produktiv (offizielles Self-Hosting).

## Migrationen

| Datei | Inhalt |
|---|---|
| `migrations/20260713090001_schema.sql` | Enums, Tabellen, RLS-Hilfsfunktionen (Schema `app`) |
| `migrations/20260713090002_rls.sql` | Row-Level-Security-Policies (Rollenmodell aus `planung/roles.md`) |
| `migrations/20260713090003_auth.sql` | Auth-Trigger (E-Mail → Rolle beim ersten Login) |
| `seed.sql` | Generiert aus `data/*.csv` durch `scripts/generate-seed.mjs` |

Reihenfolge: Migrationen (alphabetisch nach Dateiname), danach `seed.sql`.

## Lokal

```bash
npx supabase start       # Docker-Stack hoch
npx supabase db reset    # Migrationen + Seed frisch einspielen
npx supabase status      # URLs, anon-Key, Studio (http://localhost:54323)
```

## Produktiv (self-hosted, betriebliches RZ)

Backend über das **offizielle** Supabase-Docker-Setup aufsetzen –
<https://supabase.com/docs/guides/self-hosting/docker> – nicht selbst nachbauen
(techstack.md). Danach dieses Schema anwenden:

1. Offizielles `docker/`-Verzeichnis von Supabase klonen, `.env` setzen (starke
   Secrets: `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`).
2. Migrationen anwenden – entweder `supabase db push --db-url "<POOLER_URL>"`
   oder die vier SQL-Dateien in Reihenfolge (`migrations/*` dann `seed.sql`) per
   `psql` gegen die produktive DB laufen lassen.
3. Entra ID: in Studio unter Authentication → Providers → Azure aktivieren
   (Client ID / Secret / Tenant-URL), Redirect-URI
   `https://ict-apprentice.swisstph.ch/auth/v1/callback` – siehe `authconcept.md`.

## Sofort nach Erstinbetriebnahme

- Break-Glass-Login (`admin@swisstph.ch`) einloggen, **Passwort ändern**, danach
  `passwort_platzhalter` in `data/accounts.csv` leeren und Seed neu generieren
  (der Block entfällt dann automatisch).
- Echte Lernenden-Accounts (Platzhalter `TODO-lernender-*`) in der App bzw. in
  `data/accounts.csv` durch echte E-Mail/Name + **Ausbildungsstart-Datum** ersetzen.
