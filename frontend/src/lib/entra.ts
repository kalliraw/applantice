// =====================================================================
// Microsoft-Entra-ID Benutzer-Sync (On-Demand, delegiert).
//
// Der eingeloggte Berufsbildner ruft mit seinem Microsoft-Graph-Access-Token
// (session.provider_token, nur direkt nach dem SSO-Login vorhanden) die Mitglieder
// einer Entra-Gruppe ab und legt sie als benutzer-Zeilen OHNE Rolle an. Rollen
// vergibt der Berufsbildner danach in der App (Einstellungen > Benutzer).
//
// Kein Backend, kein gespeichertes App-Secret: die Graph-Calls laufen direkt aus dem
// Browser (Graph unterstützt CORS für SPAs). Die Gruppen-Konfiguration liegt lokal
// im Browser (localStorage), Default optional aus der Build-Env VITE_ENTRA_GROUP_ID.
// =====================================================================
import { supabase } from './supabase.ts'
import type { Benutzer } from './types.ts'

const GRAPH = 'https://graph.microsoft.com/v1.0'
const LS_ID = 'entra.gruppeId'
const LS_NAME = 'entra.gruppeName'

/** Ein Mitglied einer Entra-Gruppe (nur die für uns relevanten Felder). */
export type GraphMitglied = {
  id: string
  displayName?: string | null
  userPrincipalName?: string | null
  mail?: string | null
  accountEnabled?: boolean | null
  // Bei gemischten Gruppen kennzeichnet Graph den Objekttyp (User/Gruppe/Gerät).
  '@odata.type'?: string
}

export type EntraKonfig = {
  gruppeName: string
  gruppeId: string
}

export type SyncErgebnis = {
  mitglieder: number // Gruppenmitglieder gesamt (alle Objekttypen)
  benutzer: number // davon echte Benutzer (mit UPN)
  neu: number
  aktualisiert: number
  unveraendert: number // vorhanden, keine Änderung nötig
  fehler: string[]
}

/** Fehler mit maschinenlesbarem Code, damit die UI gezielt reagieren kann. */
export class EntraSyncFehler extends Error {
  constructor(
    public code: 'KEIN_TOKEN' | 'KEINE_GRUPPE' | 'GRUPPE_NICHT_GEFUNDEN' | 'GRAPH' | 'DB',
    message: string,
  ) {
    super(message)
    this.name = 'EntraSyncFehler'
  }
}

// ---------- Konfiguration (localStorage + optionaler Build-Default) ----------
export function ladeKonfig(): EntraKonfig {
  const envId = (import.meta.env.VITE_ENTRA_GROUP_ID ?? '').trim()
  const envName = (import.meta.env.VITE_ENTRA_GROUP_NAME ?? '').trim()
  return {
    gruppeId: localStorage.getItem(LS_ID) ?? envId,
    gruppeName: localStorage.getItem(LS_NAME) ?? envName,
  }
}

export function speichereKonfig(k: EntraKonfig): void {
  const id = k.gruppeId.trim()
  const name = k.gruppeName.trim()
  id ? localStorage.setItem(LS_ID, id) : localStorage.removeItem(LS_ID)
  name ? localStorage.setItem(LS_NAME, name) : localStorage.removeItem(LS_NAME)
}

// ---------- Graph-Zugriff ----------
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Microsoft-Graph-Access-Token des eingeloggten Benutzers (null, wenn nicht vorhanden). */
export async function holeProviderToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.provider_token ?? null
}

async function graphGet(token: string, url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      if (body?.error?.message) detail = body.error.message
    } catch {
      /* ignore */
    }
    throw new EntraSyncFehler('GRAPH', `Microsoft Graph ${res.status}: ${detail}`)
  }
  return (await res.json()) as Record<string, unknown>
}

/** Löst einen Gruppennamen (displayName) zu einer Gruppen-ID auf (erster Treffer). */
export async function sucheGruppeId(token: string, name: string): Promise<string> {
  const q = name.replace(/'/g, "''")
  const json = await graphGet(
    token,
    `${GRAPH}/groups?$select=id,displayName&$filter=displayName eq '${encodeURIComponent(q)}'`,
  )
  const treffer = (json.value as Array<{ id: string }> | undefined) ?? []
  if (treffer.length === 0) {
    throw new EntraSyncFehler('GRUPPE_NICHT_GEFUNDEN', `Keine Entra-Gruppe mit dem Namen „${name}" gefunden.`)
  }
  return treffer[0].id
}

/** Alle Mitglieder einer Gruppe (mit Paging über @odata.nextLink). */
export async function holeGruppenMitglieder(token: string, gruppeId: string): Promise<GraphMitglied[]> {
  // Bewusst OHNE $select und OHNE OData-Cast (/microsoft.graph.user): diese
  // Kombination lieferte in manchen Tenants Objekte OHNE userPrincipalName/mail,
  // wodurch beim Sync alle Mitglieder mangels E-Mail übersprungen wurden. Die
  // Standard-Repräsentation von /members enthält diese Felder zuverlässig; die
  // Filterung auf echte Benutzer passiert clientseitig (siehe istBenutzer()).
  let url: string | null = `${GRAPH}/groups/${encodeURIComponent(gruppeId)}/members?$top=999`
  const alle: GraphMitglied[] = []
  while (url) {
    const json = await graphGet(token, url)
    for (const m of (json.value as GraphMitglied[] | undefined) ?? []) alle.push(m)
    url = (json['@odata.nextLink'] as string | undefined) ?? null
  }
  return alle
}

/** True, wenn das Mitglied ein echter Benutzer mit UPN ist (keine Gruppe/Gerät). */
function istBenutzer(m: GraphMitglied): boolean {
  const typ = m['@odata.type'] ?? '#microsoft.graph.user'
  return typ === '#microsoft.graph.user' && typeof m.userPrincipalName === 'string' && m.userPrincipalName.trim().length > 0
}

// ---------- Sync: Graph-Mitglieder -> public.benutzer ----------
/**
 * Synchronisiert die Mitglieder der konfigurierten Entra-Gruppe in public.benutzer.
 * Neue Mitglieder werden OHNE Rolle angelegt (rolle = null); bestehende Einträge
 * werden nur in Stammdaten (Name, UPN) aktualisiert – Rolle/aktiv/Ausbildungsstart
 * bleiben unangetastet.
 */
export async function syncEntraBenutzer(konfig: EntraKonfig): Promise<SyncErgebnis> {
  const token = await holeProviderToken()
  if (!token) {
    throw new EntraSyncFehler(
      'KEIN_TOKEN',
      'Kein Microsoft-Graph-Token verfügbar. Bitte neu über Entra ID anmelden und direkt danach synchronisieren.',
    )
  }

  let gruppeId = konfig.gruppeId.trim()
  if (!gruppeId && !konfig.gruppeName.trim()) {
    throw new EntraSyncFehler('KEINE_GRUPPE', 'Bitte einen Entra-Gruppennamen oder eine Gruppen-ID hinterlegen.')
  }
  if (!GUID.test(gruppeId)) {
    // Kein GUID -> als Name behandeln (Feld "Gruppen-ID" leer oder Name eingegeben).
    gruppeId = await sucheGruppeId(token, konfig.gruppeName.trim() || konfig.gruppeId.trim())
  }

  const mitglieder = await holeGruppenMitglieder(token, gruppeId)
  const nurBenutzer = mitglieder.filter(istBenutzer)

  const { data, error } = await supabase.from('benutzer').select('*')
  if (error) throw new EntraSyncFehler('DB', `Bestehende Benutzer lesen fehlgeschlagen: ${error.message}`)
  const bestehend = (data as Benutzer[] | null) ?? []
  const byUpn = new Map(bestehend.filter((b) => b.upn).map((b) => [b.upn!.toLowerCase(), b]))
  const byEmail = new Map(bestehend.map((b) => [b.email.toLowerCase(), b]))

  const erg: SyncErgebnis = {
    mitglieder: mitglieder.length,
    benutzer: nurBenutzer.length,
    neu: 0,
    aktualisiert: 0,
    unveraendert: 0,
    fehler: [],
  }

  for (const m of nurBenutzer) {
    const upn = m.userPrincipalName!.trim()
    const email = (m.mail?.trim() || upn).toLowerCase()
    const name = m.displayName?.trim() || upn

    const treffer = byUpn.get(upn.toLowerCase()) || byEmail.get(email) || null
    try {
      if (treffer) {
        // Rolle/aktiv/Ausbildungsstart NIE überschreiben – nur Stammdaten pflegen.
        const patch: Record<string, unknown> = {}
        if (name && name !== treffer.name) patch.name = name
        if (upn !== treffer.upn) patch.upn = upn
        if (Object.keys(patch).length === 0) {
          erg.unveraendert++
          continue
        }
        const { error: upErr } = await supabase.from('benutzer').update(patch).eq('id', treffer.id)
        if (upErr) throw upErr
        erg.aktualisiert++
      } else {
        // Neuer Benutzer: OHNE Rolle. Der Berufsbildner weist sie in der App zu.
        const { error: insErr } = await supabase
          .from('benutzer')
          .insert({ email, name, upn, auth_typ: 'entra_id', rolle: null, aktiv: true })
        if (insErr) throw insErr
        erg.neu++
      }
    } catch (e) {
      erg.fehler.push(`${email}: ${(e as Error).message}`)
    }
  }

  return erg
}
