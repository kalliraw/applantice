# Mail-Modul

## Zweck

Benachrichtigungen unabhängig vom Login/Auth-Flow, z.B.:

- Erinnerung: Bildungsbericht für das laufende Semester ist fällig (siehe P2 in
  `featurematrix.md`).
- Einladung an neue Lernende, sobald ein Account angelegt wird.

## Anforderungen

- **Versand via SMTP, ohne dass SMTP-Authentifizierung vorausgesetzt wird** – viele
  interne Firmen-Mailrelays erlauben anonymes Relay aus dem internen Netz. Trotzdem ein
  optionales Feld für Benutzername/Passwort vorsehen, falls der eingesetzte Relay doch
  Auth verlangt.
- **SMTP-Host, Port und Absenderadresse sind in der App konfigurierbar** – eigene
  Einstellungsseite für den Berufsbildner, Werte in der Datenbank, nicht im `.env`.
  Grund: eine Änderung der Mailkonfiguration soll kein Redeploy brauchen.
- Test-Versand-Funktion in den Einstellungen, damit die Konfiguration ohne Rätselraten
  geprüft werden kann.

## Architektur

- **Sauber getrennt vom Auth-Flow**: Login läuft über Entra ID (siehe `authconcept.md`),
  Mailversand ist ein eigenes, unabhängiges Modul. Kein Vermischen der beiden Zuständig-
  keiten.
- Konkrete Umsetzung (z.B. eigener kleiner Mail-Service-Container vs. Supabase Edge
  Function) entscheidet Claude Code beim Bauen – hier nur die funktionalen Anforderungen
  und die Trennung von Zuständigkeiten vorgegeben.
