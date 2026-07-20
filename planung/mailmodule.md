# Mail-Modul

## Zweck

Benachrichtigungen unabhängig vom Login/Auth-Flow. Zwei Klassen:

1. **Reminder** (zeitgesteuert) – alles, was dazu führen kann, dass der Ausbildungsstand
   **veraltet/unvollständig** wird, soll aktiv angemahnt werden (fehlende Noten, überfällige
   Semesterberichte, anstehende Teamwechsel …).
2. **Ereignis-Mails** – Reaktion auf eine konkrete Aktion in der App (Ziel zugewiesen,
   Bericht abgeschlossen …).

## Versand-Architektur (Microsoft Graph, App-only)

Versand läuft über **Microsoft Graph `sendMail`** aus einer Shared-Mailbox
(`GRAPH_MAIL_SENDER`), abgesichert per **RBAC for Applications** (die App darf nur diese
eine Mailbox bespielen). Einrichtung + Secrets: siehe [`../README.md`](../README.md)
(Abschnitt „Mail-Versand") und [`authconcept.md`](authconcept.md). **Kein SMTP mehr** –
ersetzt den früheren SMTP-Ansatz; die Tabelle `smtp_einstellung` entfällt (Migration, s.
Offene Entscheidungen).

### Komponenten

- **`mailer`-Container** (neuer Dienst im Compose-Stack, schlank, Node):
  - Hält `GRAPH_MAIL_*` aus dem Env (Client-Credentials → Graph-Token, gecacht bis Ablauf).
  - **Rendert Templates** (siehe unten) und ruft `POST /users/{GRAPH_MAIL_SENDER}/sendMail`.
  - **Interne API** `POST /send` für Ereignis-Mails – **nicht** öffentlich; via nginx unter
    `/mail/` gerouted (gleicher Origin, kein CORS) und mit dem Supabase-**JWT** des Aufrufers
    abgesichert (nur Berufsbildner bzw. die eigene Aktion). Aufrufer schickt nur
    `{ event, bezug_id, … }` – **Empfänger-Auflösung und Template wählt der mailer**, damit
    alle Mail-Logik an einer Stelle liegt.
  - **Scheduler** (täglich, `node-cron`): liest die DB **direkt** (Backend-Rolle, umgeht RLS),
    wertet die Reminder-Bedingungen aus, sendet und protokolliert.
- **`mail_log`-Tabelle** (append-only): verhindert Doppelversand (Reminder nicht täglich neu)
  und dient als Audit. Skizze: `id, typ, empfaenger, bezug_id, bezug_semester, gesendet_am,
  status, fehler`.
- **Templates**: `mail-templates/*.html` – per Compose-**Volume** in den Container gemountet,
  also **ohne Rebuild pflegbar**.

### Auslöser-Wege

| Weg | Wofür | Mechanik |
|---|---|---|
| **Ereignis** | Mails 3, 5 | App ruft nach der Aktion `POST /mail/send` mit `{event, bezug_id, …}` |
| **Zeitplan** | Mails 1, 2, 4 | `mailer`-Scheduler prüft täglich die DB-Bedingungen |

## Mail-Liste (P0)

| # | Mail | Auslöser | Empfänger | Anhang | Bedingung / Datenquelle |
|---|---|---|---|---|---|
| 1 | **Semesterbericht überfällig** | Zeitplan | Berufsbildner | – | Aktuelles Semester (aus `benutzer.ausbildungsstart`) hat nach Frist **keinen** `bildungsbericht` mit `typ='semester'`, `status='abgeschlossen'` |
| 2 | **Note fehlt für abgeschlossenes Modul** | Zeitplan | Lernende(r) | – | `fach.semester` liegt (laut `ausbildungsstart`) in der Vergangenheit, aber es existiert **keine** `note` für (`benutzer`, `fach`) |
| 3 | **Neues Ziel für dein Team** | Ereignis (`team_leistungsziel` INSERT) | Team­verantwortliche (`team.verantwortlich_benutzer_id`) | – | zugewiesenes `leistungsziel` (Code + Text), Team-Name |
| 4 | **Teamwechsel steht an** | Zeitplan | Team­verantwortliche (neues Team) **+** Lernende(r) | – | `team_zuteilung.von_datum` in ≤ *X* Tagen |
| 5 | **Bildungsbericht abgeschlossen** | Ereignis (`bildungsbericht.status` → `abgeschlossen`) | Berufsbildner, der abgeschlossen hat (`erfasst_von`) | **Bericht-PDF** | Bericht-Inhalt + Kennzahlen |
| 6 | **Rolle zugewiesen / Zugang freigeschaltet** | Ereignis (Rolle in *Einstellungen > Benutzer* gesetzt, vorher keine) | Der/die betroffene Benutzer(in) | – | `benutzer` (Name, Rolle) + `{{link}}` = `PUBLIC_URL` |

*Grundsatz „Daten-Aktualität": Mails 1/2/4 decken die heute bekannten Veraltungs-Quellen ab.
Weitere Reminder (z.B. lange nicht aktualisierte Selbsteinschätzung) lassen sich als
zusätzliche Scheduler-Regel ergänzen (P1), ohne die Architektur zu ändern.*

## Templates

- Ein Ordner `mail-templates/` im Repo, je Mail eine HTML-Datei (z.B. `note-fehlt.html`,
  `bericht-abgeschlossen.html`) **plus** ein gemeinsames `layout.html` (Swiss-TPH-Kopf/Fuss,
  Dark-neutral, siehe `design.md`).
- **Platzhalter** im Mustache-Stil `{{name}}`, `{{modul}}`, `{{semester}}`, `{{link}}`,
  `{{teamname}}` … – `{{link}}` ist die Tool-URL aus `PUBLIC_URL` (env, pro Umgebung
  local/test/prod verschieden). Der `mailer` ersetzt sie beim Rendern (kleine, abhängigkeitsarme
  Substitution). Pro Mail optional eine `.txt`-Variante als Plaintext-Fallback (sonst wird
  automatisch eine reduzierte Textversion erzeugt).
- Betreff je Template im Kopf als `<!-- subject: … {{semester}} … -->` deklarierbar, damit
  Betreff + Inhalt zusammen gepflegt werden.

## Entschieden (Stand Bau)

- **PDF-Erzeugung (Mail 5):** Das **Frontend** rendert den Bericht beim Abschliessen zu PDF
  (`html2pdf`/`jsPDF`) und schickt ihn an `/mail/send`. Kein Headless-Browser im Stack.
- **Empfänger Mail 4 (Teamwechsel):** **beide** – neue Team­verantwortliche **und** die/der
  wechselnde Lernende.
- **Fristen/Kadenz:** Semesterbericht gilt **ab Ende des jeweiligen Semesters** als überfällig.
  Teamwechsel-Vorlauf **7 Tage**. Noch offene Reminder werden **wöchentlich** erneut gesendet
  (gesteuert über `mail_log`, damit nicht täglich).
- **`smtp_einstellung`:** Tabelle **+ RLS-Policy per Migration entfernen** (SMTP-Ansatz ersetzt).

## Abgrenzung

Sauber getrennt vom Auth-Flow: Login läuft über Entra ID SSO ([`authconcept.md`](authconcept.md)),
Mailversand ist ein eigenständiges Modul mit **eigener** App-Registration (getrennte Secrets,
getrennte, mailbox-gescopte Berechtigung).
