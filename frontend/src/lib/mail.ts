import { supabase } from './supabase.ts'

/**
 * Löst eine Ereignis-Mail über den mailer-Dienst aus (nginx: /mail/send).
 * Best-effort: Fehler werden geloggt, brechen die auslösende Aktion NIE ab –
 * der Mailversand ist eine Nebenwirkung, kein Teil der Kernaktion.
 *
 * Die eigentliche Empfänger-Auflösung + das Template macht der mailer; hier wird
 * nur das Ereignis mit seiner Bezug-ID signalisiert. Autorisiert per Supabase-JWT.
 */
export async function sendeMailEreignis(
  event: 'ziel_zugewiesen' | 'bericht_abgeschlossen' | 'rolle_zugewiesen',
  bezugId: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) {
      console.warn('[mail] keine Session – Ereignis übersprungen:', event)
      return
    }
    const res = await fetch('/mail/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event, bezug_id: bezugId, ...extra }),
    })
    if (!res.ok) {
      console.warn(`[mail] ${event} fehlgeschlagen (${res.status}):`, await res.text().catch(() => ''))
    }
  } catch (e) {
    console.warn(`[mail] ${event} Fehler:`, (e as Error).message)
  }
}
