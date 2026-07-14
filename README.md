# Ausbildungsplan Informatik EFZ

Interaktive, self-hosted Web-App für den Ausbildungsplan der Informatik-EFZ-Lehre
(Fachrichtung Plattformentwicklung) bei Swiss TPH. Hintergrund und Ziele:
[`planung/vision.md`](planung/vision.md).

> **Status:** Projekt-Setup + Datenmodell. Die P0-Features (Login → Handlungskompetenzen →
> Selbsteinschätzung → Fächer → Notenrechner → Bildungsbericht → Team-Rotation →
> Kompetenz-Status → Dashboard) werden auf diesem Fundament schrittweise gebaut.

## Architektur

| Schicht   | Technologie |
|-----------|-------------|
| Frontend  | React + Vite + TypeScript (schlank, ohne schwere UI-Toolchain – reines CSS mit Design-Tokens) |
| Backend   | Supabase self-hosted (Postgres + GoTrue Auth + PostgREST + Studio) |
| Auth      | Microsoft Entra ID SSO (OIDC) + lokaler Break-Glass-Login |
| Zugriff   | **Ausschliesslich** Row Level Security in Postgres – kein Zugriffsschutz im Frontend |

Design-Entscheidungen und Leitplanken: siehe [`planung/`](planung/) und [`CLAUDE.md`](CLAUDE.md).

## Repo-Struktur

```
data/            Seed-Ausgangsdaten (CSV) – Kanton-Bildungsplan, Accounts, Fächer
planung/         Konzeptvorgaben (von Isaak geprüft)
frontend/        React-App (Vite + TS)
supabase/        config.toml, Migrationen, generierter Seed
scripts/         generate-seed.mjs – erzeugt supabase/seed.sql aus data/*.csv
```

## Entwicklung (lokal)

Voraussetzungen: Node ≥ 20, Docker Desktop, npm.

```bash
# 1) Backend: Supabase-Stack lokal starten (zieht Docker-Images beim ersten Mal)
npx supabase start          # startet Postgres, Auth, PostgREST, Studio ...
npx supabase db reset       # wendet supabase/migrations/* an und lädt supabase/seed.sql

# 2) Frontend
cd frontend
cp .env.example .env        # Werte aus `npx supabase status` eintragen
npm install
npm run dev                 # http://localhost:5173
```

`npx supabase status` zeigt API-URL, `anon`-Key und Studio-URL (Standard
http://localhost:54323). Diese Werte gehören in `frontend/.env`.

### Seed neu erzeugen

`supabase/seed.sql` wird aus den drei CSVs in `data/` generiert und ist eingecheckt.
Nach Änderungen an den CSVs:

```bash
node scripts/generate-seed.mjs      # schreibt supabase/seed.sql neu
npx supabase db reset               # spielt Migrationen + neuen Seed ein
```

### Notenformel-Tests

Die Notenberechnung ist als reine Funktionen mit Unit-Tests umgesetzt (Node-Bordmittel,
keine Extra-Abhängigkeit):

```bash
cd frontend
npm test                    # node --test
```

## Produktiv-Deployment (self-hosted, betriebliches RZ)

Deployment via GitLab CI/CD als Docker-Container. Backend über das **offizielle**
Supabase-Self-Hosting-Setup
(<https://supabase.com/docs/guides/self-hosting/docker>) – nicht selbst nachbauen.
Dieselben `supabase/migrations/*.sql` und `supabase/seed.sql` werden gegen die
produktive Datenbank angewandt. Ziel-Domain: `ict-apprentice.swisstph.ch`.
Details und Reihenfolge: [`supabase/README.md`](supabase/README.md).

## Wichtige Leitplanken (Kurzfassung)

- Kein Hartkodieren von Notengewichten oder Fächern – alles Daten (Tabellen).
- Verlaufsdaten (Selbsteinschätzung, Noten, Bildungsberichte) werden nie überschrieben.
- Offizielle Kanton-Daten sind für alle Rollen unveränderlich.
- Dark Mode ist der Grundmodus.
