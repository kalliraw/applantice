# Vision

## Ausgangslage

Senior Systems Engineer und langjähriger Berufsbildner, aktuell kein Ausbildungsplan im
Betrieb vorhanden. Zwei Informatik-EFZ-Lernende, Fachrichtung Plattformentwicklung
(vormals Systemtechnik). Wenn eine Lehre abgeschlossen ist, startet ein neuer Lernender –
das Tool muss über diesen Wechsel hinaus Bestand haben.

## Ziel

Ein funktionierender, gut strukturierter Ausbildungsplan – **einmal richtig gemacht**,
nicht als weiteres Excel-Chaos. Grundlage: die offiziellen Lernziele nach
Bildungsverordnung 21 (BiVo 21), der aktuelle Bildungsplan/Lernzielkatalog des Kantons,
sowie die gesetzlichen Vorgaben zur Ausbildung (u.a. Art. 12 BiVo: Lerndokumentation
Pflicht; Art. 13 BiVo: Bildungsbericht pro Semester Pflicht).

## Warum nicht einfach Excel

Excel ist unübersichtlich, lädt nicht zur Aktualisierung ein und bildet weder Verlauf
noch Interaktivität ab. Das Ziel ist ein Tool, das:

- **Interaktiv** ist statt einer toten Tabelle.
- **Einlädt, aktuell gehalten zu werden** – Lernende sehen ihren eigenen Fortschritt und
  wollen ihn pflegen.
- **Von überall verfügbar** ist (self-hosted, Browser-Zugriff).
- **Den aktuellen Ausbildungsstand jederzeit im Blick behält** – für Lernende und
  Berufsbildner gleichermassen.
- **Grundlage für die jährliche Standortbestimmung** ist – kombiniert Kompetenzstand,
  Noten und Bildungsberichte.
- **Lernenden hilft, ihr eigenes Können zu dokumentieren und einzuschätzen** – über die
  ganze Lehre hinweg sichtbar, nicht in einer Excel-Zeile begraben.
- **Die Noten berechnet** – ein Notenrechner speziell für die Informatik-Ausbildung
  (Semester-Vornoten, Modulnoten, IPA, ABU, erweiterte Grundkompetenzen).

## Besonderheit: von den Lernenden selbst gebaut und gepflegt

Bewusste Entscheidung: die App wird **von den Lernenden im Rahmen ihrer Ausbildung mit
Claude Code selbst entwickelt und weiterbetrieben** – nicht nur benutzt. Das ist Teil
der Ausbildung (passt inhaltlich zur Fachrichtung Plattformentwicklung: Betrieb eigener
Infrastruktur, DevOps-Prozesse) und löst das Kontinuitätsproblem anders als ein rein
extern gebautes Tool: der Berufsbildner bleibt die Konstante über Lernenden-Generationen
hinweg und sorgt für den Wissenstransfer beim Wechsel.

## Nicht Teil dieses Tools

Die individuelle praktische Arbeit (IPA) hat eigene, separate Vorgaben und wird von den
Lernenden selbst organisiert – kein IPA-Tracker in dieser App.

## Wie diese Planungsunterlagen zu benutzen sind

- `data/` enthält die faktischen Ausgangsdaten (Leistungsziele des Kantons, Accounts) als
  CSV – bewusst ohne Datenbankschema, das entscheidet Claude Code beim Bauen.
- `planung/` enthält die konzeptionellen Vorgaben (dieses Dokument sowie
  `featurematrix.md`, `techstack.md`, `authconcept.md`, `roles.md`, `design.md`,
  `mailmodule.md`). Diese Dateien werden von Isaak review­t und korrigiert, bevor die
  Entwicklung mit Claude Code beginnt.
