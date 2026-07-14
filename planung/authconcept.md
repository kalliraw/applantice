# Auth-Konzept

## Primär: Microsoft Entra ID SSO (OIDC)

Login läuft über Microsoft Entra ID, eingebunden über den Azure-Provider von Supabase
Auth (Authentication > Providers > Azure im Supabase Studio).

### App-Registration im Entra-Tenant (von Isaak selbst auszuführen)

1. **entra.microsoft.com > Applications > App registrations > New registration.**
   Name z.B. "Ausbildungsplan Informatik EFZ". Account-Typ: "Accounts in this
   organizational directory only (Single tenant)".
2. **Redirect URIs** (Plattform "Web"), beide von Anfang an eintragen:
   - `http://localhost:8000/auth/v1/callback` (lokale Entwicklung, jetzt)
   - `https://ict-apprentice.swisstph.ch/auth/v1/callback` (nach Produktiv-Deployment)
3. **Application (client) ID** und **Directory (tenant) ID** von der Overview-Seite
   notieren.
4. **Certificates & secrets > New client secret.** Ablauf: 12 Monate empfohlen +
   Kalender-Reminder zur Rotation. Wert sofort kopieren (nur einmal sichtbar).
5. **API permissions > Microsoft Graph > Delegated**: `openid`, `email`, `profile`,
   `offline_access`, `User.Read`. Danach "Grant admin consent" klicken.
6. **Empfohlen: Zugriff einschränken.** Enterprise Applications > diese App >
   Properties > "Assignment required?" = Yes, dann unter "Users and groups" die
   2 Lernenden + Berufsbildner (+ künftige Lernende) eintragen.
7. **Werte in Supabase eintragen**: Authentication > Providers > Azure aktivieren,
   Client ID / Client Secret / Tenant ID eintragen. Redirect-URI in Supabase muss exakt
   der jeweils verwendeten URL entsprechen (lokal vs. produktiv).

### Sicherheitshinweise

- Client Secret nie ins Git-Repo committen (auch nicht in `.env`-Dateien, die
  versehentlich eingecheckt werden könnten).
- Ablaufdatum im Kalender eintragen, rechtzeitig rotieren.

## Team-Sync aus Entra ID

- Eine Entra-ID-**Gruppe** (Teams/Abteilungen) wird in die App gesynct, damit der
  Berufsbildner Lernende Teams zuordnen kann (siehe Feature "Team-Rotation" in
  `featurematrix.md`).
- **Identifier: UPN** (User Principal Name), nicht die E-Mail-Adresse – auch wenn UPN und
  E-Mail bei Swiss TPH meist identisch sind, ist der UPN der stabile Identifier für den
  Abgleich mit Entra ID. Ob `data/accounts.csv` dafür eine eigene Spalte braucht oder ob
  E-Mail/UPN als austauschbar behandelt werden, entscheidet Claude Code beim Bauen.
- Sync-Mechanismus (z.B. periodischer Abruf via Microsoft Graph API
  `GET /groups/{id}/members`, oder On-Demand-Button in den Berufsbildner-Einstellungen)
  ist eine Implementierungsentscheidung von Claude Code – hier nur die Anforderung: die
  Gruppenmitgliedschaft muss regelmässig aktualisierbar sein, ohne manuelle Pflege pro
  Lernendem.
- **API permissions** für den Gruppen-Read zusätzlich zu den unter "App-Registration"
  genannten Delegated Permissions einplanen (z.B. `GroupMember.Read.All`, ggf. Application
  Permission mit Admin-Consent, falls der Sync ohne eingeloggten Benutzerkontext laufen
  soll).

## Rollen-Zuweisung nach Login

Entra ID liefert keine Rolle (Lernende/Berufsbildner) automatisch mit. Nötig ist eine
Zuordnung E-Mail → Rolle. Ausgangspunkt dafür: `data/accounts.csv`. Claude Code soll
daraus einen sauberen Mechanismus bauen (z.B. Zuordnungstabelle + Auth-Trigger beim
ersten Login), der vom Berufsbildner in der App gepflegt werden kann, wenn neue
Lernende dazukommen.

## Master-/Break-Glass-Login

Ein einzelner lokaler Account **ohne** Entra-ID/SSO, fest mit Rolle Berufsbildner, für
den Fall dass SSO nicht erreichbar oder falsch konfiguriert ist. Ausgangsdaten
(Platzhalter-Passwort) in `data/accounts.csv` (Zeile `admin@swisstph.ch`). Passwort bei
Erstinbetriebnahme sofort ändern, danach den Platzhalter-Wert aus der CSV entfernen.

## Was dieses Dokument bewusst nicht vorgibt

Keine Tabellennamen oder Spalten – die konkrete Umsetzung der Rollen-Zuordnung und des
Break-Glass-Accounts im Schema entscheidet Claude Code beim Bauen, basierend auf den
Daten in `data/accounts.csv` und dem Berechtigungsmodell in `roles.md`.
