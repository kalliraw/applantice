// =====================================================================
// Mail-Sender-Dienst des Ausbildungsplans.
//
//  * Versand via Microsoft Graph `sendMail` aus der Shared-Mailbox
//    (App-only, Client-Credentials; Berechtigung per Exchange-RBAC auf genau
//    diese Mailbox begrenzt – siehe README/authconcept.md).
//  * Ereignis-Mails über POST /send (nginx: /mail/send), abgesichert per Supabase-JWT.
//  * Zeitgesteuerte Reminder über einen einfachen täglichen Scheduler.
//  * Templates aus ./mail-templates (per Compose-Volume gemountet).
//
// Alle Mail-Logik (Empfänger-Auflösung, Template, Dedup) liegt hier – Aufrufer
// signalisieren nur ein Ereignis mit Bezug-ID. Siehe planung/mailmodule.md.
// =====================================================================
import http from 'node:http'
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const HIER = dirname(fileURLToPath(import.meta.url))
const TPL_DIR = process.env.MAIL_TEMPLATE_DIR || join(HIER, 'mail-templates')

const {
  GRAPH_MAIL_TENANT_ID,
  GRAPH_MAIL_CLIENT_ID,
  GRAPH_MAIL_CLIENT_SECRET,
  GRAPH_MAIL_SENDER,
  JWT_SECRET,
  PUBLIC_URL = 'http://localhost:8080',
  PGHOST = 'db',
  PGPORT = '5432',
  PGUSER = 'supabase_admin',
  PGPASSWORD,
  PGDATABASE = 'postgres',
  MAILER_PORT = '8025',
  MAIL_ENABLED = 'true',
  MAIL_TEAMWECHSEL_VORLAUF_TAGE = '7',
  MAIL_RESEND_TAGE = '7',
  MAIL_SCHEDULER = 'true',
} = process.env

const pool = new pg.Pool({ host: PGHOST, port: +PGPORT, user: PGUSER, password: PGPASSWORD, database: PGDATABASE, max: 4 })

// ---------------------------------------------------------------- Helfer
const ROLLE_LABEL = { lernende: 'Lernende(r)', berufsbildner: 'Berufsbildner' }
function fmtDatum(d) {
  if (!d) return ''
  const dt = d instanceof Date ? d : new Date(d)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(dt.getDate())}.${p(dt.getMonth() + 1)}.${dt.getFullYear()}`
}
const log = (...a) => console.log('[mailer]', ...a)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const alsListe = (arr) => arr.filter(Boolean).map(esc).join('<br>')

// ---------------------------------------------------------------- Graph
let tokenCache = { token: null, exp: 0 }
async function graphToken() {
  if (tokenCache.token && Date.now() < tokenCache.exp - 60_000) return tokenCache.token
  const body = new URLSearchParams({
    client_id: GRAPH_MAIL_CLIENT_ID,
    client_secret: GRAPH_MAIL_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })
  const res = await fetch(`https://login.microsoftonline.com/${GRAPH_MAIL_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`Token ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const j = await res.json()
  tokenCache = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 }
  return tokenCache.token
}

async function graphSend({ to, subject, html, attachments = [] }) {
  const empfaenger = (Array.isArray(to) ? to : [to]).filter(Boolean)
  if (!empfaenger.length) return
  const token = await graphToken()
  const message = {
    subject,
    body: { contentType: 'HTML', content: html },
    toRecipients: empfaenger.map((a) => ({ emailAddress: { address: a } })),
  }
  if (attachments.length) {
    message.attachments = attachments.map((a) => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.name,
      contentType: a.contentType || 'application/octet-stream',
      contentBytes: a.contentBytes,
    }))
  }
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(GRAPH_MAIL_SENDER)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: true }),
  })
  if (!res.ok) throw new Error(`sendMail ${res.status}: ${(await res.text()).slice(0, 300)}`)
}

// ---------------------------------------------------------------- Templates
function render(name, data) {
  const layout = readFileSync(join(TPL_DIR, 'layout.html'), 'utf8')
  const raw = readFileSync(join(TPL_DIR, `${name}.html`), 'utf8')
  const m = raw.match(/<!--\s*subject:\s*([\s\S]*?)-->/i)
  const subjectTpl = (m ? m[1] : 'Ausbildungsplan Informatik EFZ').trim()
  const bodyTpl = raw.replace(/<!--\s*subject:[\s\S]*?-->/i, '').trim()
  // Erst die Platzhalter der Vorlage füllen, DANN in das Layout injizieren. Die
  // Funktions-Ersetzung (() => …) verhindert, dass '$'-Sequenzen im Inhalt als
  // Replace-Muster interpretiert werden. Global (/g), damit auch bei mehrfachem
  // Vorkommen sauber ersetzt wird.
  const fuellen = (str) => str.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => String(data[k] ?? ''))
  const subject = fuellen(subjectTpl)
  const body = fuellen(bodyTpl)
  const html = layout
    .replace(/\{\{\s*subject\s*\}\}/g, () => subject)
    .replace(/\{\{\s*body\s*\}\}/g, () => body)
  return { subject, html }
}

async function logMail(row) {
  const { typ, empfaenger, bezug_id = null, bezug_key = null, betreff = null, status = 'gesendet', fehler = null } = row
  await pool.query(
    `insert into public.mail_log (typ, empfaenger, bezug_id, bezug_key, betreff, status, fehler)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [typ, empfaenger, bezug_id, bezug_key, betreff, status, fehler],
  )
}

// Pro Mail-Typ an/aus (Einstellungen > Benachrichtigungen), kurz gecacht.
const typCache = { at: 0, map: null }
async function typAktiv(typ) {
  if (!typCache.map || Date.now() - typCache.at > 30_000) {
    try {
      const r = await pool.query('select typ, aktiv from public.benachrichtigung_einstellung')
      typCache.map = new Map(r.rows.map((x) => [x.typ, x.aktiv]))
      typCache.at = Date.now()
    } catch {
      return true // Tabelle fehlt/Fehler -> nicht blockieren
    }
  }
  const v = typCache.map.get(typ)
  return v === undefined ? true : v // ohne Eintrag: default an ('test' immer)
}

/** Rendert + versendet an alle Empfänger und protokolliert jeden einzeln. */
async function sendTemplate({ typ, to, template, data, bezug_id = null, bezug_key = null, attachments }) {
  const recips = [...new Set((Array.isArray(to) ? to : [to]).filter(Boolean))]
  if (!recips.length) return
  if (!(await typAktiv(typ))) {
    log(`${typ} deaktiviert -> übersprungen`)
    return
  }
  const { subject, html } = render(template, { ...data, link: data.link ?? PUBLIC_URL })
  for (const r of recips) {
    try {
      if (MAIL_ENABLED === 'true') await graphSend({ to: r, subject, html, attachments })
      await logMail({ typ, empfaenger: r, bezug_id, bezug_key, betreff: subject })
      log(`gesendet: ${typ} -> ${r}`)
    } catch (e) {
      await logMail({ typ, empfaenger: r, bezug_id, bezug_key, betreff: subject, status: 'fehler', fehler: String(e.message).slice(0, 500) })
      log(`FEHLER: ${typ} -> ${r}: ${e.message}`)
    }
  }
}

async function bereitsGesendet(typ, empfaenger, bezug_id, tage) {
  const r = await pool.query(
    `select 1 from public.mail_log
      where typ = $1 and empfaenger = $2 and (bezug_id is not distinct from $3)
        and status = 'gesendet' and gesendet_am > now() - make_interval(days => $4)
      limit 1`,
    [typ, empfaenger, bezug_id, +tage],
  )
  return r.rowCount > 0
}

// ---------------------------------------------------------------- Auth (Supabase-JWT)
function verifyJwt(token) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [h, p, s] = parts
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url')
    const a = Buffer.from(s)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'))
    if (payload.exp && Date.now() / 1000 > payload.exp) return null
    return payload
  } catch {
    return null
  }
}
async function istBerufsbildner(authUserId) {
  if (!authUserId) return false
  const r = await pool.query(
    `select 1 from public.benutzer where auth_user_id = $1 and rolle = 'berufsbildner' and aktiv limit 1`,
    [authUserId],
  )
  return r.rowCount > 0
}

// ---------------------------------------------------------------- Ereignis-Mails
async function handleZielZugewiesen(teamId) {
  const { rows } = await pool.query(
    `select t.name as teamname, b.email, b.name as vname,
            coalesce(string_agg(coalesce(lz.code,'') || ' ' || lz.text, E'\n' order by lz.sortierung), '') as ziele,
            count(lz.id)::int as anzahl
       from team t
       left join benutzer b on b.id = t.verantwortlich_benutzer_id
       left join team_leistungsziel tlz on tlz.team_id = t.id
       left join leistungsziel lz on lz.id = tlz.leistungsziel_id
      where t.id = $1
      group by t.name, b.email, b.name`,
    [teamId],
  )
  const t = rows[0]
  if (!t || !t.email) return { skipped: 'kein Empfänger/Team' }
  await sendTemplate({
    typ: 'ziel_zugewiesen',
    to: t.email,
    template: 'ziel-zugewiesen',
    bezug_id: teamId,
    data: { name: t.vname ?? '', teamname: t.teamname, anzahl: t.anzahl, ziele: alsListe((t.ziele || '').split('\n')) },
  })
  return { ok: true }
}

async function handleBerichtAbgeschlossen(berichtId, pdfBase64) {
  const { rows } = await pool.query(
    `select bb.semester, bb.typ, bb.datum,
            erf.email as bb_email, erf.name as bb_name,
            ler.name as lernende_name
       from bildungsbericht bb
       left join benutzer erf on erf.id = bb.erfasst_von
       left join benutzer ler on ler.id = bb.benutzer_id
      where bb.id = $1`,
    [berichtId],
  )
  const b = rows[0]
  if (!b || !b.bb_email) return { skipped: 'kein Empfänger' }
  const bezeichnung = b.typ === 'sonderbericht' ? 'Sonderbericht' : `Semesterbericht ${b.semester ?? ''}`.trim()
  const attachments = pdfBase64
    ? [{ name: `Bildungsbericht_${(b.lernende_name || 'lernende').replace(/\s+/g, '_')}_${bezeichnung.replace(/\s+/g, '_')}.pdf`, contentType: 'application/pdf', contentBytes: pdfBase64 }]
    : []
  await sendTemplate({
    typ: 'bericht_abgeschlossen',
    to: b.bb_email,
    template: 'bericht-abgeschlossen',
    bezug_id: berichtId,
    data: { bb_name: b.bb_name ?? '', lernende_name: b.lernende_name ?? '', bezeichnung, datum: fmtDatum(b.datum) },
    attachments,
  })
  return { ok: true }
}

async function handleRolleZugewiesen(benutzerId) {
  const { rows } = await pool.query(
    `select email, name, rolle from benutzer where id = $1 and aktiv`,
    [benutzerId],
  )
  const u = rows[0]
  if (!u || !u.email || !u.rolle) return { skipped: 'kein Empfänger/Rolle' }
  await sendTemplate({
    typ: 'rolle_zugewiesen',
    to: u.email,
    template: 'rolle-zugewiesen',
    bezug_id: benutzerId,
    data: { name: u.name ?? '', rolle: ROLLE_LABEL[u.rolle] ?? u.rolle },
  })
  return { ok: true }
}

async function handleTest(empfaenger) {
  await sendTemplate({
    typ: 'test',
    to: empfaenger,
    template: 'test',
    data: { datum: fmtDatum(new Date()), sender: GRAPH_MAIL_SENDER },
  })
  return { ok: true }
}

// ---------------------------------------------------------------- Reminder (Scheduler)
async function reminderNoteFehlt() {
  const { rows } = await pool.query(
    `select b.id as benutzer_id, b.email, b.name,
            f.modul_nr, f.name as fach_name, f.semester
       from benutzer b
       join fach f
         on f.aktiv and f.semester is not null
        and (f.kontext = 'EFZ' or (f.kontext = 'BM' and b.macht_bm))
      where b.aktiv and b.rolle = 'lernende' and b.email is not null
        and b.ausbildungsstart is not null
        and (b.ausbildungsstart + make_interval(months => f.semester * 6)) < current_date
        and not exists (select 1 from note n where n.benutzer_id = b.id and n.fach_id = f.id)
      order by b.id, f.semester, f.modul_nr`,
  )
  const proLernende = new Map()
  for (const r of rows) {
    if (!proLernende.has(r.benutzer_id)) proLernende.set(r.benutzer_id, { email: r.email, name: r.name, module: [] })
    proLernende.get(r.benutzer_id).module.push(`${r.modul_nr ? r.modul_nr + ' ' : ''}${r.fach_name} (Sem. ${r.semester})`)
  }
  for (const [benutzerId, v] of proLernende) {
    if (await bereitsGesendet('note_fehlt', v.email, benutzerId, MAIL_RESEND_TAGE)) continue
    await sendTemplate({
      typ: 'note_fehlt',
      to: v.email,
      template: 'note-fehlt',
      bezug_id: benutzerId,
      data: { name: v.name ?? '', anzahl: v.module.length, module: alsListe(v.module) },
    })
  }
}

async function reminderSemesterbericht() {
  const { rows } = await pool.query(
    `select b.id as benutzer_id, b.name, max(s.semester)::int as semester
       from benutzer b
       cross join generate_series(1, 8) as s(semester)
      where b.aktiv and b.rolle = 'lernende' and b.ausbildungsstart is not null
        and (b.ausbildungsstart + make_interval(months => s.semester * 6)) < current_date
        and not exists (
          select 1 from bildungsbericht bb
           where bb.benutzer_id = b.id and bb.typ = 'semester'
             and bb.status = 'abgeschlossen' and bb.semester = s.semester)
      group by b.id, b.name`,
  )
  if (!rows.length) return
  const bb = await pool.query(`select email, name from benutzer where aktiv and rolle = 'berufsbildner' and email is not null`)
  const empfaenger = bb.rows
  for (const r of rows) {
    for (const e of empfaenger) {
      if (await bereitsGesendet('semesterbericht_faellig', e.email, r.benutzer_id, MAIL_RESEND_TAGE)) continue
      await sendTemplate({
        typ: 'semesterbericht_faellig',
        to: e.email,
        template: 'semesterbericht-faellig',
        bezug_id: r.benutzer_id,
        bezug_key: String(r.semester),
        data: { name: e.name ?? '', lernende_name: r.name, semester: r.semester },
      })
    }
  }
}

async function reminderTeamwechsel() {
  const { rows } = await pool.query(
    `select tz.id as zuteilung_id, tz.von_datum, t.name as teamname,
            ler.name as lernende_name, ler.email as lernende_email,
            resp.name as resp_name, resp.email as resp_email
       from team_zuteilung tz
       join team t on t.id = tz.team_id
       join benutzer ler on ler.id = tz.benutzer_id
       left join benutzer resp on resp.id = t.verantwortlich_benutzer_id
      where ler.aktiv
        and tz.von_datum > current_date
        and tz.von_datum <= current_date + make_interval(days => $1)`,
    [+MAIL_TEAMWECHSEL_VORLAUF_TAGE],
  )
  for (const r of rows) {
    const basis = { teamname: r.teamname, lernende_name: r.lernende_name, resp_name: r.resp_name ?? '', von_datum: fmtDatum(r.von_datum) }
    for (const email of [r.resp_email, r.lernende_email]) {
      if (!email) continue
      if (await bereitsGesendet('teamwechsel', email, r.zuteilung_id, MAIL_RESEND_TAGE)) continue
      const name = email === r.resp_email ? r.resp_name ?? '' : r.lernende_name ?? ''
      await sendTemplate({ typ: 'teamwechsel', to: email, template: 'teamwechsel', bezug_id: r.zuteilung_id, data: { ...basis, name } })
    }
  }
}

async function runReminders() {
  log('Reminder-Lauf startet …')
  for (const fn of [reminderNoteFehlt, reminderSemesterbericht, reminderTeamwechsel]) {
    try {
      await fn()
    } catch (e) {
      log(`Reminder-Fehler (${fn.name}):`, e.message)
    }
  }
  log('Reminder-Lauf fertig.')
}

// ---------------------------------------------------------------- HTTP-API
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(obj))
}
function leseBody(req, maxBytes = 30 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > maxBytes) {
        reject(new Error('Body zu gross'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true })

    if (req.method === 'POST' && (req.url === '/send' || req.url === '/test')) {
      const auth = req.headers.authorization || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
      const payload = token && verifyJwt(token)
      if (!payload) return json(res, 401, { error: 'Ungültiges Token' })
      if (!(await istBerufsbildner(payload.sub))) return json(res, 403, { error: 'Nur Berufsbildner' })

      const body = JSON.parse((await leseBody(req)) || '{}')

      if (req.url === '/test') {
        const ziel = body.to || null
        if (!ziel) return json(res, 400, { error: 'Feld "to" fehlt' })
        return json(res, 200, await handleTest(ziel))
      }

      const { event, bezug_id, pdfBase64 } = body
      if (!event || !bezug_id) return json(res, 400, { error: 'event und bezug_id erforderlich' })
      let result
      switch (event) {
        case 'ziel_zugewiesen': result = await handleZielZugewiesen(bezug_id); break
        case 'bericht_abgeschlossen': result = await handleBerichtAbgeschlossen(bezug_id, pdfBase64); break
        case 'rolle_zugewiesen': result = await handleRolleZugewiesen(bezug_id); break
        default: return json(res, 400, { error: `Unbekanntes event: ${event}` })
      }
      return json(res, 200, result)
    }

    json(res, 404, { error: 'not found' })
  } catch (e) {
    log('HTTP-Fehler:', e.message)
    json(res, 500, { error: e.message })
  }
})

server.listen(+MAILER_PORT, () => {
  log(`läuft auf Port ${MAILER_PORT}; Absender ${GRAPH_MAIL_SENDER}; Versand ${MAIL_ENABLED === 'true' ? 'AN' : 'AUS'}`)
})

// Täglicher Reminder-Scheduler (30s nach Start, danach alle 24h).
if (MAIL_SCHEDULER === 'true') {
  setTimeout(() => { void runReminders() }, 30_000)
  setInterval(() => { void runReminders() }, 24 * 3600 * 1000)
}
