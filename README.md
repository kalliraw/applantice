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

## Mail-Versand (Microsoft Graph, App-only, RBAC for Applications)

Benachrichtigungen werden über **Microsoft Graph** aus einer Shared-Mailbox versendet –
**kein SMTP** (SMTP AUTH / Basic Auth ist bei Microsoft abgekündigt). Least Privilege:
eine **eigene** App-Registration (getrennt vom SSO) darf per **RBAC for Applications**
ausschliesslich **eine** Mailbox bespielen. Die `Mail.Send`-Berechtigung wird **nicht**
in Entra consented, sondern allein über Exchange-RBAC vergeben und dort auf die Mailbox
begrenzt – siehe [`planung/authconcept.md`](planung/authconcept.md).

### Einmalige Einrichtung (Admin)

**1. App-Registration** (entra.microsoft.com → App registrations → New registration):
Single tenant, **keine** Redirect-URI. Client-Secret erzeugen. **Keine** Graph-API-
Permission `Mail.Send` hinzufügen und **kein** Admin-Consent (ein tenant-weiter Consent
würde die Mailbox-Einschränkung aushebeln → Union). `Application (client) ID`,
`Directory (tenant) ID` sowie die **Enterprise-Application → Object ID** notieren
(Letztere ist die `ObjectId` unten – nicht die Object ID der App-Registration).

**2. Exchange Online RBAC** (`Connect-ExchangeOnline`, Rolle *Organization Management*
bzw. *Exchange Administrator*):

```powershell
# Shared Mailbox (keine Lizenz nötig), falls noch nicht vorhanden
New-Mailbox -Shared -Name "Ausbildungsplan noreply" -PrimarySmtpAddress <SENDER>

# Exchange-Pointer auf die Entra-App
New-ServicePrincipal -AppId <CLIENT_ID> -ObjectId <ENTERPRISE_APP_OBJECT_ID> -DisplayName "Ausbildungsplan Mail-Sender"

# Resource-Scope = genau diese eine Mailbox
New-ManagementScope -Name "Ausbildungsplan-noreply" -RecipientRestrictionFilter "PrimarySmtpAddress -eq '<SENDER>'"

# Rolle 'Application Mail.Send', auf den Scope begrenzt
New-ManagementRoleAssignment -Name "Ausbildungsplan-MailSend" -App <ENTERPRISE_APP_OBJECT_ID> -Role "Application Mail.Send" -CustomResourceScope "Ausbildungsplan-noreply"

# Verifizieren (umgeht den Cache): erwartet True für <SENDER>, False für alle anderen
Test-ServicePrincipalAuthorization -Identity <ENTERPRISE_APP_OBJECT_ID> -Resource <SENDER> | ft
```

Für **mehrere** Absender später: statt `PrimarySmtpAddress -eq …` eine mail-enabled
Security Group und `-RecipientRestrictionFilter "MemberOfGroup -eq '<DN>'"` (DN via
`Get-Group`). Änderungen greifen live nach **30 Min–2 h** (Berechtigungs-Cache); das
`Test-…`-Cmdlet umgeht ihn.

**3. Konfiguration** (`.env`, siehe [`.env.example`](.env.example); Secret **nie** committen):

```
GRAPH_MAIL_TENANT_ID=<tenant-id>
GRAPH_MAIL_CLIENT_ID=<client-id>
GRAPH_MAIL_CLIENT_SECRET=<secret>
GRAPH_MAIL_SENDER=<shared-mailbox-adresse>
```

Der Mail-Sender holt sein Token per Client-Credentials
(`scope=https://graph.microsoft.com/.default`) und ruft `POST /users/{GRAPH_MAIL_SENDER}/sendMail`.
Autorisiert wird über Exchange-RBAC (nicht über Entra-Rollen); das Token trägt daher
keinen `Mail.Send`-Rollen-Claim.

## Wichtige Leitplanken (Kurzfassung)

- Kein Hartkodieren von Notengewichten oder Fächern – alles Daten (Tabellen).
- Verlaufsdaten (Selbsteinschätzung, Noten, Bildungsberichte) werden nie überschrieben.
- Offizielle Kanton-Daten sind für alle Rollen unveränderlich.
- Helle Mint-Palette (Light) ist der Grundmodus.
