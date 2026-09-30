# Rollen & Berechtigungen

**Vier Rollen:** Lernende, Teamowner, Berufsbildner, Admin. Die Sicht auf die Daten
eines Lernenden ist neu **eingeschränkt**: nicht mehr jeder Berufsbildner sieht alle
Lernenden. Wer welchen Lernenden sieht, ergibt sich aus einer expliziten
**Betreuungs-Beziehung** (Berufsbildner ↔ Lernende) bzw. der **Team-Verantwortung**
(Teamowner). Der Admin sieht alle.

Zugriffskontrolle bleibt ausschliesslich in Postgres (Row Level Security, siehe
`techstack.md`), nicht im Frontend.

## Übersicht: wer sieht welche Lernenden

| Rolle          | sichtbare Lernenden-Daten                                   |
| -------------- | ----------------------------------------------------------- |
| Lernende       | nur die eigenen                                             |
| Teamowner      | keine personenbezogenen Daten – nur Team-Ziele + Timeline   |
| Berufsbildner  | nur die ihm **zugewiesenen** (Betreuung)                    |
| Admin          | **alle**                                                    |

## Lernende

Unverändert:

- Sehen und bearbeiten ausschliesslich ihre **eigenen** Daten.
- Erfassen Selbsteinschätzungen pro Leistungsziel (3-Stufen-Raster Erklärt/Geübt/
  Selbstständig) – für sich selbst, nicht für andere.
- Erfassen ihre eigenen Noten (Notenrechner).
- **Lesen** ihre eigenen Bildungsberichte, können sie aber **nicht selbst erstellen
  oder bearbeiten** – das macht der betreuende Berufsbildner.
- Können **keine** Handlungskompetenzen bearbeiten/hinzufügen – nur einschätzen.
- Sehen die Kanton- und betrieblichen Handlungskompetenzen/-ziele (schreibgeschützt).
- Sehen ihre eigene Team-Zuteilung sowie den Status ihrer Handlungskompetenzen
  (offen/angefangen/erledigt). Dieser Status wird **automatisch aus ihrer eigenen
  Selbsteinschätzung abgeleitet** (erledigt = alle zugehörigen Leistungsziele auf
  Stufe "selbstständig") – niemand setzt ihn manuell.

## Teamowner (neu)

Die **verantwortliche Person eines Teams** (`team.verantwortlich_benutzer_id`) erhält
mit dieser Rolle einen eigenen, **stark eingeschränkten Lese-Zugang**. Zweck: dafür
sorgen, dass die dem eigenen Team zugewiesenen Ziele erreicht werden – **ohne** Einblick
in die sensiblen Daten der Lernenden.

Ein Teamowner:

- Kann für **mehrere Teams** verantwortlich sein; sieht dann alle seine Teams.
- Sieht **ausschliesslich**:
  - die seinem/seinen Team(s) zugewiesenen **Handlungskompetenzen und Leistungsziele**
    (`team_kompetenz`, `team_leistungsziel`),
  - eine **Timeline seines Teams**: welcher Lernende in welchem Zeitraum (Kalenderwochen)
    bei ihm im Team ist (`team_zuteilung` der eigenen Teams, inkl. Namen der Lernenden).
- Sieht **NICHT**: Noten, Fächer/Module-Noten, Bildungsberichte, Selbsteinschätzungen,
  den individuellen Kompetenz-Fortschritt einzelner Lernender, Einstellungen, andere
  Teams oder andere Lernende.
- **Setzt nichts** und bearbeitet nichts – reine Ansicht. Der Kompetenz-Status bleibt
  wie bei allen anderen automatisch aus der Selbsteinschätzung der Lernenden abgeleitet.

Die Rolle ist bewusst zusätzlich zur Team-Verantwortung: `verantwortlich_benutzer_id`
verknüpft eine Person mit einem Team; erst die Rolle `teamowner` gibt ihr den Login-Zugang
zum Team-Dashboard. Eine Person kann Teamowner sein, ohne Berufsbildner zu sein.

## Berufsbildner (neu: auf die eigenen Lernenden eingeschränkt)

Wie bisher volle fachliche Sicht **und Schreibrechte** – aber nur noch für die ihm über
die **Betreuungs-Beziehung** zugewiesenen Lernenden (siehe unten). Er:

- Sieht die **personenbezogenen Daten** (Selbsteinschätzungen, Noten,
  Leistungsbeurteilungen, Bildungsberichte, Kompetenz-Status, Team-Zuteilungen)
  **nur der ihm zugewiesenen** Lernenden.
- **Erstellt und verwaltet die Bildungsberichte** seiner Lernenden (Semester- und
  Sonderberichte; abgeschlossene Berichte sind unveränderlich).
- Reviewt/gegenzeichnet Selbsteinschätzungen seiner Lernenden.
- Erstellt/moderiert die Standortbestimmung seiner Lernenden.
- Verwaltet weiterhin die **globale Konfiguration** (kein Lernenden-Bezug, daher nicht
  eingeschränkt): betriebliche Handlungskompetenzen, Fächerliste/Notenkomponenten,
  Teams + Team-Ziele + Team-Rotation, Modul→Semester-Planung, Benutzer-/Rollen-Zuweisung,
  Benachrichtigungen. (Entscheidung Isaak: Admin **und** Berufsbildner teilen sich die
  Verwaltung.)
- Sieht die **Namen** aller Lernenden (für Team-Planung und Betreuungs-Zuweisung nötig),
  aber nicht deren personenbezogene Fachdaten, solange keine Betreuung besteht.

## Admin (neu)

Wie Berufsbildner, aber **ohne Einschränkung auf zugewiesene Lernende** – sieht und
verwaltet **alle** Lernenden. Fachlich der "Super-Berufsbildner"; gedacht für die
ausbildungsverantwortliche Person und den Break-Glass-Zugang.

- Der **Break-Glass-Login** (`ausbildungsplan-admin@swisstph.ch`, lokal, siehe
  `authconcept.md`) trägt die Rolle `admin` und ist der Bootstrap: nur ein Admin kann
  weitere Admins/Rollen und die Betreuungs-Zuweisungen vergeben.

## Betreuungs-Beziehung (neu): Berufsbildner ↔ Lernende

Explizite Tabelle `betreuung` verknüpft einen Berufsbildner mit den von ihm betreuten
Lernenden:

- **Mehrere Berufsbildner pro Lernendem** möglich (und ein Berufsbildner betreut mehrere
  Lernende).
- **Historisiert** (`von_datum`, `bis_datum`): eine beendete Betreuung wird nicht gelöscht,
  sondern mit `bis_datum` abgeschlossen – im Einklang mit der Leitplanke "Verlaufsdaten
  nie überschreiben". Ein Berufsbildner sieht die Fachdaten eines Lernenden, sobald eine
  Betreuung begonnen hat (auch abgeschlossene bleiben sichtbar – z.B. für früher
  verfasste Berichte). **Schreiben** (Bildungsberichte anlegen/bearbeiten) nur, solange die
  Betreuung läuft.
- Verwaltet wird die Zuweisung ausschliesslich vom **Admin** (Einstellungen > Betreuung) –
  sonst könnte sich ein Berufsbildner selbst Lernende zuweisen. Ebenso vergibt nur ein
  Admin die Rolle `admin` und ändert Admin-Konten (DB-Trigger, nicht nur Frontend).

## Was für alle Rollen gleich gilt

- Zugriffskontrolle ausschliesslich über Row Level Security in Postgres.
- Offizielle Kanton-Handlungskompetenzen/-ziele sind für **alle** Rollen
  schreibgeschützt – sie ändern sich nur durch eine neue Migration/Seed-Aktualisierung.
- Wer **keine** Rolle hat (`rolle IS NULL`, z.B. frisch per Entra-Sync angelegt), sieht
  faktisch nichts – RLS verweigert alles, bis ein Admin/Berufsbildner eine Rolle vergibt.

## Beim Lehrabschluss eines Lernenden

Datensatz nicht löschen (Historie bleibt sichtbar), sondern als inaktiv markieren. Neuer
Lernender erhält einen neuen Account-Eintrag. Laufende Betreuungen können mit `bis_datum`
abgeschlossen werden.
