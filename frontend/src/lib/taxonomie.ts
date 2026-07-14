// Taxonomiestufen K1–K6 (Kompetenzstufen nach Bloom) aus dem Bildungsplan.
// Geben an, wie anspruchsvoll ein Leistungsziel kognitiv ist.

export const TAXONOMIE_STUFEN: { stufe: string; name: string; beschreibung: string }[] = [
  { stufe: 'K1', name: 'Wissen', beschreibung: 'Fakten wiedergeben (nennen, aufzählen)' },
  { stufe: 'K2', name: 'Verstehen', beschreibung: 'Zusammenhänge in eigenen Worten erklären' },
  { stufe: 'K3', name: 'Anwenden', beschreibung: 'Gelerntes in einer konkreten Situation umsetzen' },
  { stufe: 'K4', name: 'Analyse', beschreibung: 'Zerlegen, Zusammenhänge und Fehler erkennen' },
  { stufe: 'K5', name: 'Synthese', beschreibung: 'Neues entwickeln, kombinieren, konzipieren' },
  { stufe: 'K6', name: 'Beurteilen', beschreibung: 'Bewerten, kritisch beurteilen, entscheiden' },
]

export const TAXONOMIE_INFO: Record<string, { name: string; beschreibung: string }> =
  Object.fromEntries(TAXONOMIE_STUFEN.map((t) => [t.stufe, { name: t.name, beschreibung: t.beschreibung }]))

/** Tooltip-Text für ein Badge, z.B. "K3 – Anwenden: Gelerntes … umsetzen". */
export function taxonomieTooltip(stufe: string | null | undefined): string | undefined {
  if (!stufe) return undefined
  const info = TAXONOMIE_INFO[stufe]
  return info ? `${stufe} – ${info.name}: ${info.beschreibung}` : stufe
}
