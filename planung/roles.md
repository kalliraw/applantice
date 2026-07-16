# Rollen & Berechtigungen

Zwei Rollen. Kein separates Admin-Konzept – der Break-Glass-Login (siehe
`authconcept.md`) trägt faktisch die Rolle Berufsbildner.

## Lernende

- Sehen und bearbeiten ausschliesslich ihre **eigenen** Daten.
- Erfassen Selbsteinschätzungen pro Leistungsziel (3-Stufen-Raster Erklärt/Geübt/
  Selbstständig, siehe `featurematrix.md`) – für sich selbst, nicht für andere.
- Erfassen ihre eigenen Noten (Notenrechner).
- **Lesen** ihre eigenen Bildungsberichte (Semester- und Sonderberichte), können sie aber
  **nicht selbst erstellen oder bearbeiten** – Bildungsberichte verfasst der Berufsbildner
  (Entscheidung Isaak).
- Sehen ihre eigene Standortbestimmung/Jahresübersicht.
- Können **keine** Handlungskompetenzen bearbeiten oder hinzufügen (weder offizielle
  noch betriebliche) – nur einschätzen.
- Sehen die Handlungskompetenzen/-ziele des Kantons (schreibgeschützt) sowie
  betriebliche Kompetenzen, die der Berufsbildner hinzugefügt hat.
- Sehen ihre eigene Team-Zuteilung über die Ausbildungszeit sowie den Status ihrer
  Handlungskompetenzen (offen/angefangen/erledigt). Dieser Status wird **automatisch aus
  ihrer eigenen Selbsteinschätzung abgeleitet** (erledigt = alle zugehörigen
  Leistungsziele auf Stufe "selbstständig") – niemand setzt ihn manuell (siehe
  `featurematrix.md`, Feature "Handlungskompetenz-Status").

## Berufsbildner

- Sehen **alle** Lernenden (aktuelle und historische), nicht nur die eigenen Daten.
- Können **betriebliche Handlungskompetenzen** hinzufügen, bearbeiten und löschen
  (z.B. betriebsspezifische Tools/Prozesse) – klar getrennt von den offiziellen
  Kanton-Daten aus `data/handlungziele-kanton.csv`, die für niemanden editierbar sind.
- Können Selbsteinschätzungen der Lernenden reviewen/gegenzeichnen (entspricht dem Feld
  "Überprüft BB/FV" im offiziellen Lernzielkatalog).
- Verwalten Rollen-Zuordnungen (E-Mail → Rolle) für neue Lernende.
- Planen die **Team-Rotation** im Zeitstrahl: weisen jedem Lernenden zu, in welchem
  Team/welcher Abteilung er sich in welchem Zeitraum (Kalenderwochen) der Ausbildung
  befindet (Teams werden aus einer Entra-ID-Gruppe gesynct, UPN als Identifier – siehe
  `authconcept.md`), legen pro Team eine **verantwortliche Person** fest, weisen pro Team
  die dort zu erreichenden **Leistungsziele** zu (pro Leistungsziel) und planen, in
  welchem **Semester** welches **Modul** in der Schule unterrichtet wird (global für alle
  Lernenden). Lernende sehen ihren eigenen Zeitstrahl (Rotation, Module, verlinkte
  Berichte) und dürfen die **Modul→Semester-Planung mitpflegen** (globaler Schulplan, nur
  die Semester-Zuordnung – abgesichert über eine SECURITY-DEFINER-Funktion), können aber
  **Team-Zuteilungen nicht bearbeiten**.
- Der Erledigt-Status einer Handlungskompetenz wird **automatisch aus der
  Selbsteinschätzung der Lernenden abgeleitet** (erledigt = alle zugehörigen
  Leistungsziele auf Stufe "selbstständig") und **nicht mehr manuell** vom Berufsbildner
  gesetzt (Entscheidung Isaak, ersetzt die frühere manuelle Markierung). Der Berufsbildner
  definiert stattdessen bei betrieblichen Kompetenzen die zugehörigen Leistungsziele und
  sieht den abgeleiteten Fortschritt pro Lernendem.
- Verwalten die **Fächerliste** für den Notenrechner (anlegen, bearbeiten, inaktiv
  setzen) inkl. Zuordnung zu Notenkomponente, Kontext (EFZ/BM) und Gewichtung – siehe
  Feature "Fächer-Verwaltung" in `featurematrix.md`. Lernende sehen die Fächer nur,
  können sie nicht bearbeiten.
- Verwalten die SMTP-Einstellungen (siehe `mailmodule.md`).
- **Erstellen und verwalten die Bildungsberichte** der Lernenden – sowohl den Pflicht-
  Semesterbericht (Art. 13 BiVo) als auch anlassbezogene Sonderberichte. Ein Bericht kann
  als Entwurf gespeichert und später abgeschlossen werden; **abgeschlossene Berichte sind
  unveränderlich** (Historie). Jeder Bericht hält den Ausbildungsstand automatisch fest
  (erledigte Kompetenzen, Leistungsziel-Fortschritt, aktuelle Vornote) – siehe Feature
  "Bildungsbericht" in `featurematrix.md`.
- Erstellen/moderieren die Standortbestimmung im jährlichen Gespräch, ergänzen eigene
  Einschätzung neben der Selbsteinschätzung der Lernenden.

## Was für beide Rollen gleich gilt

- Zugriffskontrolle ausschliesslich über Row Level Security in Postgres (siehe
  `techstack.md`), nicht im Frontend.
- Offizielle Kanton-Handlungskompetenzen/-ziele sind für **alle** Rollen
  schreibgeschützt, unabhängig von der Rolle – sie ändern sich nur durch eine neue
  Migration/Seed-Aktualisierung.

## Beim Lehrabschluss eines Lernenden

Datensatz nicht löschen (Historie bleibt für Berufsbildner und Nachfolger als Referenz
sichtbar), sondern als inaktiv markieren. Neuer Lernender erhält einen neuen
Account-Eintrag (siehe `data/accounts.csv` als Ausgangspunkt, danach Pflege in der App
durch den Berufsbildner).
