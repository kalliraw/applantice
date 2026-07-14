# Tech Stack

**Kein Datenbankschema in diesem Dokument** – das entwirft Claude Code selbst anhand
der Daten in `data/` und der Anforderungen in den übrigen Planungsdateien.

## Frontend

- React (Vite) + TypeScript.
- Bewusst **kein schwerer UI-Framework-Unterbau** (kein Tailwind-Toolchain-Zwang, keine
  komplexe Build-Pipeline) – Grund: die App muss über Jahre von zwei Lernenden wartbar
  bleiben und darf nicht an Tooling-Komplexität ersticken.
- **Zu klären:** Isaak möchte einen modernen, "coolen" Look (Dark Mode, siehe
  `design.md`) – das steht in leichter Spannung zum obigen Grundsatz "kein schwerer
  UI-Framework-Unterbau", da moderne Optik oft mit Tailwind/Component-Libraries erreicht
  wird. Claude Code soll beim Bauen einen Mittelweg wählen (z.B. schlanke,
  unstyled/headless Komponenten oder reines CSS mit den Design-Tokens aus `design.md`),
  statt automatisch eine schwere Toolchain einzuführen.

## Backend

- **Supabase, self-hosted**, über das offizielle Docker-Setup
  (https://supabase.com/docs/guides/self-hosting/docker) – nicht selbst nachbauen, damit
  Image-Versionen und Env-Variablen nicht veralten.
- Postgres + Auth (GoTrue) + PostgREST + Studio reichen für den Start;
  Realtime/Storage/Functions/Analytics nur bei konkretem Bedarf ergänzen.

## Hosting & Deployment

- Betriebliches Rechenzentrum, Deployment als Docker-Container via GitLab CI/CD.
- Start lokal mit `localhost`. Ziel-Domain nach Produktiv-Deployment:
  **`ict-apprentice.swisstph.ch`** (CNAME wird gesetzt, sobald das Deployment steht).
- Kein externer Cloud-Dienst ausserhalb Confluence/SharePoint/eigenem RZ ohne
  Rücksprache mit dem Berufsbildner (Daten sind laut Einschätzung nicht besonders
  schützenswert, aber Hosting bleibt intern).

## Zugriffskontrolle

- Ausschliesslich **Row Level Security (RLS)** in Postgres, kein Zugriffsschutz im
  Frontend-Code. Jede Tabelle mit personenbezogenen/rollenabhängigen Daten braucht eine
  RLS-Policy.
- Rollenmodell und Berechtigungen: siehe `roles.md`.

## Prinzipien fürs Datenmodell (unabhängig vom konkreten Schema)

- **Notenformel-Gewichte sind Daten, nicht Code.** BiVo-Revisionen ändern Prozentsätze,
  nicht die Rechenlogik – Gewichte gehören in eine Tabelle, nicht hartkodiert in die
  Anwendungslogik.
- **Fächer sind Daten, nicht Code.** Kein hartkodierter Fächerkatalog – der Berufsbildner
  pflegt Fächer in der App (siehe Feature "Fächer-Verwaltung" in `featurematrix.md`).
  Konzeptionell (kein Schema) braucht ein Fach mindestens: Name, **Kontext** (EFZ oder
  BM – damit BM-Fächer nie versehentlich in die EFZ-Gesamtnote einfliessen und
  umgekehrt), Zuordnung zu einer **Notenkomponente** (IPA, Informatikkompetenzen-BFS,
  ÜK, ABU, erweiterte Grundkompetenzen, oder die entsprechenden BM-Komponenten),
  **Gewichtung** innerhalb dieser Komponente, sowie einen **aktiv/inaktiv**-Status statt
  Löschen (Curricula ändern sich über Jahre, alte Noten müssen nachvollziehbar bleiben).
- **Notenformel-Logik als reine, ungebundene Funktionen mit Unit-Tests.**
  Beispielrechnungen als Testfälle, keine zusätzliche Test-Framework-Abhängigkeit nötig.
- **Nichts wird überschrieben.** Selbsteinschätzungen (pro Leistungsziel, 3-Stufen-Raster
  Erklärt/Geübt/Selbstständig), Bildungsberichte und Standortbestimmungen sind
  Verlaufsdaten – neue Zeile statt Update, damit der Fortschritt über die ganze Lehre
  sichtbar bleibt.
- **Offizielle Kanton-Daten sind unveränderlich.** Handlungskompetenzen/-ziele aus
  `data/handlungziele-kanton.csv` werden nur per Migration/Seed eingespielt und sind in
  der App nicht editierbar. Firmeneigene Kompetenzen sind davon klar getrennt (siehe
  `roles.md` und `featurematrix.md`).

## Datenquellen für die erste Seed-Migration

- `data/handlungziele-kanton.csv` – Handlungskompetenzen und -ziele des Kantons.
- `data/accounts.csv` – Ausgangs-Accounts (Master-/Break-Glass-Login, Berufsbildner,
  Platzhalter für Lernende).
- `data/faecher.csv` – Startpunkt für die Fächer-Verwaltung (EFZ-Module BFS/ÜK, ABU, EGK,
  BM-Fächer Typ Technik). Recherchiert, nicht vollständig verifiziert – siehe Offene
  Punkte in `featurematrix.md` vor dem Seeden prüfen.

## Mailversand

Separates, konfigurierbares SMTP-Modul – siehe `mailmodule.md`.

## Authentifizierung

Microsoft Entra ID SSO plus Break-Glass-Login – siehe `authconcept.md`.

## Team-Sync

Entra-ID-Gruppen-Sync (UPN als Identifier) für die Team-Rotation-Planung – siehe
Abschnitt "Team-Sync aus Entra ID" in `authconcept.md` und Feature "Team-Rotation" in
`featurematrix.md`. Konkrete Sync-Implementierung (Graph API, Scheduling) entscheidet
Claude Code.
