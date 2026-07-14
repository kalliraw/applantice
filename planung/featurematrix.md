# Feature-Matrix

Stand: gemeinsam erarbeitet und von Isaak bestätigt (P0 + P1 vollständig zugestimmt,
IPA-Tracker aus P2 gestrichen, Rest P2 bestätigt).

## P0 – für die erste lauffähige Version

| Feature | Beschreibung |
|---|---|
| Login mit Rollen | Lernende vs. Berufsbildner, SSO via Entra ID (siehe `authconcept.md`) |
| Handlungskompetenzen-Übersicht | Bereiche und Handlungskompetenzen aus dem kantonalen Bildungsplan (Datenquelle: `data/handlungziele-kanton.csv`), je mit ihren Leistungszielen |
| Selbsteinschätzung | Lernende bewerten sich **pro Leistungsziel** (nicht pro Handlungskompetenz) im offiziellen 3-Stufen-Raster: **Erklärt → Geübt → Selbstständig**. Jede Stufe mit Datum. Verlauf bleibt sichtbar, nichts wird überschrieben (neue Zeile pro erreichter Stufe) |
| Fächer-Verwaltung | Fächer sind **Daten, nicht hartkodiert** – der Berufsbildner pflegt die Fächerliste in der App (anlegen, bearbeiten, inaktiv setzen – nicht löschen, damit historische Noten nachvollziehbar bleiben). Jedes Fach trägt Attribute wie: Kontext (EFZ oder BM), Typ, zugehörige Notenkomponente (z.B. Informatikkompetenzen-BFS, ÜK, ABU, erweiterte Grundkompetenzen, BM-Fachnote), Gewichtung innerhalb dieser Komponente. Startdaten (recherchiert, zur Prüfung durch Isaak) in `data/faecher.csv`. Siehe `techstack.md` für die konzeptionellen Attribute (kein Schema) |
| Notenrechner | Noten pro Fach erfassen, EFZ-Gesamtnote live nach BiVo-Formel: IPA 40% / Informatikkompetenzen 30% (davon Berufsfachschule 80% + ÜK 20%) / ABU 20% / erweiterte Grundkompetenzen 10%. Gewichte **und Fächerzuordnung** sind Daten, nicht hartkodiert (siehe Fächer-Verwaltung und `techstack.md`). Pro Lernendem erfassbar: **macht BM (Berufsmaturität) lehrbegleitend, ja/nein**. BM ist ein eigenes, separates Qualifikationsverfahren mit eigenem Zeugnis – BM-Fächer/-Noten fliessen **nicht** in die EFZ-Gesamtnote ein. Die BM-Notenberechnung läuft parallel, ebenfalls über die Fächer-Verwaltung mit eigenen Gewichten (siehe Offene Punkte) |
| Bildungsbericht | Zwei Typen: **Semesterbericht** (Pflicht nach Art. 13 BiVo, semestergebunden) und **Sonderbericht** (anlassbezogen, wenn ein Gespräch zwingend nötig ist – z.B. ungenügende Leistung oder ein anderes Problem, nicht semestergebunden). Jeder Bericht **hält den Ausbildungsstand automatisch fest** (Momentaufnahme, eingefroren): erledigte Handlungskompetenzen, Leistungsziel-Fortschritt und die aktuelle Vornote (EFZ, bei BM zusätzlich BM) – berechnet aus derselben Logik wie der Notenrechner. Workflow: als **Entwurf** speicherbar und später auf **abgeschlossen** umstellbar; ein abgeschlossener Bericht ist **unveränderlich** (Historie, bewusste Ausnahme zur Append-only-Regel: nur der Entwurf ist mutierbar). **Nur der Berufsbildner erstellt/bearbeitet Berichte**, Lernende lesen sie (Entscheidung Isaak). |
| Team-Rotation (Zeitstrahl) | Vertikaler, scrollbarer **Zeitstrahl pro Lernendem** über alle 4 Lehrjahre / 8 Semester mit Jahres-, Semester- und KW-Achse und einem **„Heute"-Marker** (aus Ausbildungsstart). Drei Spuren: (1) **Schule** – Module sind Semestern zugeordnet (`fach.semester`, global für alle Lernenden gleich, editierbar, schulspezifisch – kein Seed); (2) **Betrieb** – Team-Zuteilungen als Bänder über KW-Bereiche (`team_zuteilung`, Datum = Wahrheit, KW abgeleitet); (3) **Berichte** – verlinkte Flags aller Bildungsberichte (Semester/Sonder) am jeweiligen Datum, klickbar zur Bericht-Seite. Jedes Team hat eine **verantwortliche Person** (`team.verantwortlich_benutzer_id`) und **zugewiesene Leistungsziele** (`team_leistungsziel`, **pro Leistungsziel** statt pro Handlungskompetenz – Entscheidung Isaak). Damit: Überblick, welches Team in welcher KW/welchem Semester welche Ziele erreichen soll und welche Module die Schule behandelt. Teams aus Entra ID synchronisierbar (UPN). Nur Berufsbildner bearbeiten; Lernende lesen (siehe `roles.md`). **Noch offen (Etappe 3):** Soll-vs-Ist am Marker + „Ziel X geplant in Semester Y bei Team Z" auch bei den Handlungskompetenzen anzeigen. |
| Handlungskompetenz-Status | Der Status einer Handlungskompetenz pro Lernendem wird **automatisch aus der Selbsteinschätzung abgeleitet**: *offen* (keine Einschätzung), *angefangen* (teilweiser Fortschritt) und *erledigt* (**alle** zugehörigen Leistungsziele auf Stufe „selbstständig"). Kein manuelles Setzen durch den Berufsbildner mehr. Farbliche Markierung in der Übersicht: gelb = angefangen, grün = erledigt. (Entscheidung Isaak, ersetzt die ursprünglich vorgesehene manuelle Markierung durch den Berufsbildner) |
| Dashboard | Aktueller Stand als zwei übereinanderliegende Statusbars: (1) **Ausbildungszeit** – von Ausbildungsstart bis Ausbildungsstart + 4 Jahre, aktuelle Position visuell markiert; (2) **Handlungskompetenzen-Fortschritt** – 100% = alle Handlungskompetenzen, Fortschritt nach erledigten Handlungskompetenzen (alle zugehörigen Leistungsziele auf „selbstständig"). Dazu: eingeschätzte Kompetenzen, aktuelles Semester, offene Berichte |

## P1 – kurz danach

| Feature | Beschreibung |
|---|---|
| Standortbestimmung | Jahresübersicht: kombiniert Kompetenzen + Noten + Bildungsberichte für das jährliche Gespräch |
| Berufsbildner-Sicht | Beide Lernende nebeneinander vergleichen, eigene Einschätzung/Review neben der Selbsteinschätzung (entspricht dem "Überprüft BB/FV"-Feld im offiziellen Lernzielkatalog) |
| Nachweise verlinken | Pro Leistungsziel/-kompetenz Link auf Beleg/Artefakt (Confluence, SharePoint, Repo) |

## P2 – später, falls Zeit/Bedarf

| Feature | Beschreibung |
|---|---|
| Notenverlauf-Chart | Gesamtnote/Teilnoten über Semester als Grafik |
| Export/Druck | Standortbestimmung/Bildungsbericht als PDF/Druckansicht |
| Erinnerungen | Hinweis wenn Bildungsbericht fällig ist (nutzt SMTP, siehe `mailmodule.md`) |

## Explizit nicht Teil der App

- **IPA-Tracker**: Die IPA hat eigene, separate Vorgaben und wird vom Lernenden selbst
  organisiert und verwaltet.

## Offene Punkte (zur Prüfung durch Isaak)

- **`modulverweise_rohtext`** in `data/handlungziele-kanton.csv` enthält BFS-Modul- und
  ÜK-Kurs-Referenzen pro Handlungskompetenz noch als gemeinsamen Freitext (nicht in
  getrennte Spalten aufgeteilt), da sich das automatisiert nicht zuverlässig trennen
  liess. Falls die App die beiden getrennt braucht, entweder manuell nachpflegen oder
  Claude Code beim Bauen frei parsen/strukturieren lassen.
- **Ausbildungsstart-Datum pro Lernendem** wird für die Ausbildungszeit-Statusbar
  benötigt und fehlt noch als Datenpunkt – bei der Seed-Erstellung in `data/accounts.csv`
  oder als Feld beim Anlegen eines Lernenden ergänzen.
- Die frühere Frage zur **"Abt 1-4"-Rotation** aus dem offiziellen Lernzielkatalog ist
  durch das neue Feature **Team-Rotation** oben abgedeckt.
- **BM-Notenformel**: laut Recherche (Stand Juli 2026) sind EFZ- und BM-Qualifikations-
  verfahren rechtlich getrennt – für die EFZ-Gesamtnote zählen ausschliesslich
  EFZ-Erfahrungs- und -Abschlussnoten, keine BM-Noten. Die BM selbst hat eine eigene
  Notenberechnung (Erfahrungsnoten + schulische Abschlussprüfungen), deren genaue
  Gewichte aber **je nach Berufsmaturitätsschule/Kanton und BM-Profil (Wirtschaft/
  Technik) variieren** und nicht Teil der BiVo Informatik sind. Für den Notenrechner
  daher: BM-Track als eigenständiger, paralleler Bereich mit eigenen, konfigurierbaren
  Gewichten (nicht hartkodiert) abbilden – die konkreten Werte muss Isaak beim
  jeweiligen BM-Anbieter der Lernenden erfragen, bevor Claude Code das umsetzt.
- **`data/faecher.csv` ist ein recherchierter Startpunkt, keine geprüfte Quelle.** Die
  33 BFS-Module und 7 ÜK-Module (Fachrichtung Plattformentwicklung) stammen aus dem
  offiziellen Bildungsplan-PDF (Modulübersicht S. 57), aber bei der Text-Extraktion ging
  die Tabellenstruktur verloren – **Lehrjahr-Zuordnung und die genaue Pflicht/Wahl-
  Klassifikation jedes einzelnen Moduls sind nicht zuverlässig** und müssen anhand des
  Original-PDFs visuell verifiziert werden (siehe Bemerkung je Zeile in der CSV). Die
  BM-Fächerliste (Typ Technik) folgt dem allgemeinen SBFI-Rahmenlehrplan; welche zwei
  Ergänzungsfächer die konkrete BM-Schule anbietet sowie die genauen Notengewichte pro
  Fach sind schulspezifisch und müssen bei der BM-Schule der Lernenden erfragt werden.
