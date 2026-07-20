// Domänen-Typen, gespiegelt aus dem Postgres-Schema (supabase/migrations).
// Bewusst als Datenschicht-Typen gehalten; RLS bestimmt, welche Zeilen sichtbar sind.

export type Rolle = 'lernende' | 'teamowner' | 'berufsbildner' | 'admin'

export type Benutzer = {
  id: string
  auth_user_id: string | null
  email: string
  name: string
  rolle: Rolle | null
  auth_typ: 'entra_id' | 'lokal'
  upn: string | null
  ausbildungsstart: string | null
  macht_bm: boolean
  aktiv: boolean
}

export type KompetenzQuelle = 'kanton' | 'betrieblich'

export type Bereich = {
  code: string
  titel: string
  sortierung: number
}

export type Handlungskompetenz = {
  id: string
  code: string | null
  titel: string
  beschreibung: string | null
  bereich_code: string | null
  quelle: KompetenzQuelle
  aktiv: boolean
  sortierung: number
}

export type Leistungsziel = {
  id: string
  handlungskompetenz_id: string
  code: string | null
  text: string
  taxonomiestufe: string | null
  modulverweise_rohtext: string | null
  sortierung: number
}

export type EinschaetzungStufe = 'erklaert' | 'geuebt' | 'selbststaendig'

export type Selbsteinschaetzung = {
  id: string
  benutzer_id: string
  leistungsziel_id: string
  stufe: EinschaetzungStufe
  erreicht_am: string
  notiz: string | null
  erfasst_am: string
}

export type NotenKontext = 'EFZ' | 'BM'

export type Notenkomponente = {
  id: string
  code: string
  name: string
  kontext: NotenKontext
  parent_id: string | null
  gewicht: number
  ist_qualifikationsrelevant: boolean
  entfaellt_bei_bm: boolean
  sortierung: number
  aktiv: boolean
}

/** Einzelne Prüfungsnote (Leistungsbeurteilung) innerhalb eines Moduls/Fachs. */
export type Leistungsbeurteilung = {
  id: string
  benutzer_id: string
  fach_id: string
  titel: string
  gewicht: number
  wert: number
  datum: string
  semester: number | null
  erfasst_am: string
}

export type Fach = {
  id: string
  name: string
  modul_nr: string | null
  kontext: NotenKontext
  typ: string | null
  notenkomponente_id: string | null
  gewicht: number
  aktiv: boolean
  bemerkung: string | null
  sortierung: number
  /** Geplantes Schul-Semester 1-8, in dem das Modul unterrichtet wird (global). */
  semester: number | null
}

export type Note = {
  id: string
  benutzer_id: string
  fach_id: string | null
  notenkomponente_id: string | null
  semester: number | null
  wert: number
  art: string | null
  datum: string
  erfasst_am: string
}

export type BerichtStatus = 'entwurf' | 'abgeschlossen'
export type BerichtTyp = 'semester' | 'sonderbericht'

/** Eingefrorener Ausbildungsstand zum Zeitpunkt der Berichterstellung. */
export type BerichtKennzahlen = {
  hkErledigt: number
  hkTotal: number
  lzTotal: number
  lzErklaert: number
  lzGeuebt: number
  lzSelbststaendig: number
  vornoteEfz: number | null
  vornoteBm: number | null
  machtBm: boolean
}

export type Bildungsbericht = {
  id: string
  benutzer_id: string
  semester: number | null
  typ: BerichtTyp
  datum: string
  status: BerichtStatus
  inhalt: Record<string, unknown>
  kennzahlen: Partial<BerichtKennzahlen>
  erfasst_von: string | null
  erstellt_am: string
}

export type Team = {
  id: string
  name: string
  entra_gruppe_id: string | null
  upn: string | null
  aktiv: boolean
  verantwortlich_benutzer_id: string | null
}

export type TeamZuteilung = {
  id: string
  benutzer_id: string
  team_id: string
  von_datum: string
  bis_datum: string | null
  notiz: string | null
}

/** Zuweisung Berufsbildner -> Lernende (historisiert, mehrere BB pro Lernendem). */
export type Betreuung = {
  id: string
  berufsbildner_id: string
  lernende_id: string
  von_datum: string
  bis_datum: string | null
  notiz: string | null
}

export type TeamKompetenz = {
  id: string
  team_id: string
  handlungskompetenz_id: string
}

export type TeamLeistungsziel = {
  id: string
  team_id: string
  leistungsziel_id: string
}

export type HkStatus = 'offen' | 'in_arbeit' | 'erledigt'

export type KompetenzStatus = {
  id: string
  benutzer_id: string
  handlungskompetenz_id: string
  status: HkStatus
  notiz: string | null
  gesetzt_von: string | null
  gesetzt_am: string
}
