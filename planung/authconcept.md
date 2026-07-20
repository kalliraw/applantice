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
   `offline_access`, `User.Read` sowie für den Benutzer-Sync (siehe unten)
   `GroupMember.Read.All` **und** `User.ReadBasic.All`. Danach "Grant admin consent"
   klicken. Wichtig:
   - Ohne Admin-Consent würden diese Directory-Permissions beim Login pro Benutzer eine
     Zustimmung verlangen bzw. den Login für Lernende blockieren.
   - `GroupMember.Read.All` liefert nur die **Mitgliedschaft**; die **Profilfelder**
     (Name/E-Mail/UPN) anderer Benutzer sind erst mit `User.ReadBasic.All` lesbar. Fehlt
     dieser Scope, kommen die Mitglieder mit leeren Werten zurück, sobald der Tenant
     "Benutzer dürfen andere Benutzer lesen" einschränkt (bei Swiss TPH der Fall).
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

## Benutzer-Sync aus Entra ID (implementiert)

**Umgesetzter Mechanismus: On-Demand-Button, delegiert.** Der Berufsbildner öffnet
*Einstellungen > Benutzer* und klickt "Jetzt synchronisieren". Die App liest mit dem
Microsoft-Graph-Token des eingeloggten Berufsbildners (`session.provider_token`) die
Mitglieder einer Entra-Gruppe über `GET /groups/{id}/members` und legt sie in
`public.benutzer` an. Kein Backend-Dienst, kein gespeichertes App-Secret; die Graph-Calls
laufen direkt aus dem Browser (Graph unterstützt CORS).

- **Nur Personen → `benutzer`.** Gruppenmitglieder werden **ohne Rolle** angelegt
  (`rolle IS NULL`); der Berufsbildner weist die Rolle danach in derselben Ansicht zu.
  Bestehende Einträge werden nur in Stammdaten (Name, UPN) aktualisiert – Rolle, `aktiv`
  und `ausbildungsstart` bleiben unangetastet. (Team-Sync von Entra-Gruppen → `team` ist
  bewusst NICHT Teil dieser Etappe; Teams werden vorerst manuell gepflegt, das
  `team.entra_gruppe_id`/`upn`-Feld bleibt für später.)
- **Gruppen-Konfiguration in der App.** Gruppenname *oder* Gruppen-ID (GUID) werden in
  *Einstellungen > Benutzer* eingetragen (lokal im Browser gespeichert, optionaler
  Build-Default via `VITE_ENTRA_GROUP_NAME`/`VITE_ENTRA_GROUP_ID`). Ein Name wird beim
  Sync per `GET /groups?$filter=displayName eq '...'` zur ID aufgelöst.
- **Identifier: UPN** (User Principal Name) als stabiler Abgleich-Identifier, Fallback
  E-Mail (`benutzer.upn` ist unique; UPN und E-Mail sind bei Swiss TPH meist identisch).
- **Grenze des delegierten Ansatzes:** `provider_token` liegt nur unmittelbar nach dem
  SSO-Login vor (nicht nach einem Token-Refresh, nicht beim Break-Glass-Login). Die App
  weist darauf hin und bittet ggf. um erneute Entra-Anmeldung. Für einen
  hintergrundbasierten, benutzerunabhängigen Sync wäre stattdessen ein App-Only-Flow
  (Client-Credentials, Application Permission `GroupMember.Read.All` + Admin-Consent,
  eigener geplanter Dienst) nötig – bewusst nicht umgesetzt.
- **API permissions:** delegated `GroupMember.Read.All` (Mitgliedschaft) **und**
  `User.ReadBasic.All` (Profilfelder anderer Benutzer), beide mit Admin-Consent (siehe
  App-Registration, Schritt 5). Die App fordert beide Scopes beim Login mit an. Fehlt
  `User.ReadBasic.All`, liest der Sync die Gruppe zwar, erhält aber leere Namen/E-Mails.

## Rollen-Zuweisung nach Login (implementiert)

Entra ID liefert **keine** Rolle mit, und es wird **nie** automatisch eine Default-Rolle
vergeben. Ablauf:

- **Erst-Login (Auto-Provisionierung ohne Rolle).** Der Auth-Trigger
  `app.handle_new_user()` (Migration `20260720120001_auth_autoprovision.sql`) verknüpft
  einen neuen `auth.users`-Datensatz über die E-Mail mit einem vorhandenen
  `benutzer`-Eintrag (Seed-Allowlist oder per Sync angelegt). Gibt es keinen, wird ein
  neuer `benutzer`-Datensatz **mit `rolle = NULL`** angelegt. Rollenlos heisst: RLS
  verweigert alles – der Account ist für den Berufsbildner sichtbar, hat aber keinen
  Zugriff, bis eine Rolle vergeben wird.
- **Rollen-Zuweisung durch Admin/Berufsbildner.** In *Einstellungen > Benutzer* weist ein
  Admin oder Berufsbildner jedem Konto eine der vier Rollen zu (Lernende/Teamowner/
  Berufsbildner/Admin – siehe `roles.md`), setzt es aktiv/inaktiv (Lehrabschluss → inaktiv
  statt löschen) und pflegt bei Lernenden Ausbildungsstart und "macht BM". In
  *Einstellungen > Betreuung* wird zugewiesen, welcher Berufsbildner welche Lernenden
  sieht. Das eigene Konto ist gegen Rollen-/Status-Änderung gesperrt (Selbst-Aussperren
  verhindern); der Break-Glass-Login (Admin) bleibt als Rückfallebene.
- **Ausgangs-Allowlist:** `data/accounts.csv` seedet die ersten Konten (Break-Glass-Admin
  mit Rolle `admin`; weitere Berufsbildner/Lernende folgen per Sync/Zuweisung).

## Master-/Break-Glass-Login

Ein einzelner lokaler Account **ohne** Entra-ID/SSO, fest mit Rolle **Admin** (sieht alle
Lernenden, vergibt Rollen + Betreuungen – der Bootstrap des Rollensystems), für
den Fall dass SSO nicht erreichbar oder falsch konfiguriert ist. Ausgangsdaten
(Platzhalter-Passwort) in `data/accounts.csv` (Zeile `admin@swisstph.ch`). Passwort bei
Erstinbetriebnahme sofort ändern, danach den Platzhalter-Wert aus der CSV entfernen.

## Was dieses Dokument bewusst nicht vorgibt

Keine Tabellennamen oder Spalten – die konkrete Umsetzung der Rollen-Zuordnung und des
Break-Glass-Accounts im Schema entscheidet Claude Code beim Bauen, basierend auf den
Daten in `data/accounts.csv` und dem Berechtigungsmodell in `roles.md`.
