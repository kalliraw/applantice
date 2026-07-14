# Ausbildungsplan Informatik EFZ – Projektkontext für Claude Code

Dieses Repository enthält **nur Planung und Ausgangsdaten**, keinen App-Code. Die
eigentliche App (React + Vite/TS Frontend, Supabase self-hosted Backend) wird von hier
aus mit Claude Code neu aufgesetzt.

## Warum dieses Projekt existiert

Isaak ist Senior Systems Engineer und Berufsbildner bei Swiss TPH und bildet aktuell
zwei Informatik-EFZ-Lernende aus, Fachrichtung Plattformentwicklung (vormals
Systemtechnik). Es gab bisher keinen strukturierten Ausbildungsplan – nur Excel-Chaos.
Ziel ist eine interaktive, self-hosted Web-App, die:

- den aktuellen Ausbildungsstand jederzeit sichtbar macht (Handlungskompetenzen, Noten,
  Bildungsberichte),
- Grundlage für die jährliche Standortbestimmung ist,
- Lernenden hilft, ihr eigenes Können zu dokumentieren und einzuschätzen,
- einen Notenrechner speziell für die Informatik-EFZ-Ausbildung enthält (inkl. optionaler
  Berufsmaturität lehrbegleitend),
- über den Wechsel einzelner Lernender hinaus Bestand hat und **von künftigen Lernenden
  im Rahmen ihrer Ausbildung mit Claude Code selbst weiterentwickelt wird** – das ist
  bewusst Teil des pädagogischen Konzepts, nicht nur Mittel zum Zweck.

Vollständiger Hintergrund: [`planung/vision.md`](planung/vision.md).

## Struktur dieses Repos

```
data/                       Ausgangsdaten für die erste Seed-Migration (CSV)
  accounts.csv               Start-Accounts: Break-Glass-Admin, Berufsbildner, Lernende (Platzhalter)
  handlungziele-kanton.csv   176 Leistungsziele / 33 Handlungskompetenzen (Bereiche a-f) aus dem
                              offiziellen kantonalen Bildungsplan (BiVo 21) – schreibgeschützt
  faecher.csv                Fächer/Module für den Notenrechner (EFZ: BFS-/ÜK-Module, ABU, EGK;
                              BM Typ Technik) – recherchiert, siehe Offene Punkte in featurematrix.md

planung/                    Konzeptionelle Vorgaben (von Isaak geprüft/korrigiert)
  vision.md                  Das "Warum" – Kontext, Ziele, Nicht-Ziele
  featurematrix.md            P0/P1/P2-Features + offene Punkte, die vor/während des Bauens
                              geklärt werden müssen
  roles.md                    Rollenmodell: Lernende vs. Berufsbildner, wer darf was
  authconcept.md              Entra ID SSO, Break-Glass-Login, Team-Sync aus Entra ID
  design.md                   Swiss TPH Corporate Design, Dark Mode als Grundmodus
  techstack.md                Frontend/Backend/Hosting/Zugriffskontrolle/Datenmodell-Prinzipien
                              (bewusst OHNE Datenbankschema)
  mailmodule.md                Anforderungen an das SMTP-Mail-Modul
```

## Wichtigste Leitplanken (aus den Planungsdateien)

- **Kein Datenbankschema wird vorgegeben.** Tabellen, Spalten, Beziehungen entwirft
  Claude Code selbst, ausgehend von den CSVs in `data/` und den Anforderungen in
  `planung/`.
- **Nichts wird hartkodiert, was sich ändern kann.** Notenformel-Gewichte, die
  Fächerliste (`data/faecher.csv`) und die Handlungskompetenzen sind Daten, nicht Code
  (siehe `techstack.md`).
- **Zugriffskontrolle ausschliesslich über Row Level Security** in Postgres, nicht im
  Frontend.
- **Verlaufsdaten werden nie überschrieben** – neue Zeile statt Update (Selbst-
  einschätzungen, Noten, Bildungsberichte, Standortbestimmungen).
- **Offizielle Kanton-Daten** (`data/handlungziele-kanton.csv`) sind für alle Rollen
  unveränderlich.
- **Kein IPA-Tracker** – die IPA organisiert der Lernende selbst.
- **Dark Mode ist der Grundmodus** der App (siehe `design.md`).

## Bekannte offene Punkte

`featurematrix.md` enthält einen Abschnitt "Offene Punkte (zur Prüfung durch Isaak)" –
u.a. zur Modul-Lehrjahr-Zuordnung in `faecher.csv`, zur BM-Notenformel (schulspezifisch,
noch zu erfragen) und zum Ausbildungsstart-Datum pro Lernendem. Vor dem produktiven
Seeden dieser Daten mit Isaak abgleichen.

## Vorgehen beim Start

1. Alle Dateien in `planung/` lesen (kurz, je 1-2 Seiten).
2. Die drei CSVs in `data/` lesen und verstehen, wofür sie Seed-Grundlage sind.
3. Datenmodell/Migrationen entwerfen (Supabase/Postgres), angelehnt an die Prinzipien in
   `techstack.md`.
4. Features gemäss Priorität in `featurematrix.md` umsetzen (P0 zuerst).
5. Bei Unklarheiten aus "Offene Punkte" nachfragen statt zu raten.
