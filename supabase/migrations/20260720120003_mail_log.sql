-- =====================================================================
-- Mail-Modul: Audit-/Anti-Doppelversand-Log + Ablösung des SMTP-Ansatzes.
--
-- mail_log protokolliert jeden Versand und dient dem Scheduler zur Deduplizierung
-- (offene Reminder nicht täglich neu, siehe planung/mailmodule.md). Geschrieben wird
-- ausschliesslich vom mailer-Dienst über eine privilegierte DB-Verbindung (umgeht RLS)
-- -> keine INSERT-Policy für App-Rollen. Berufsbildner dürfen das Log lesen.
--
-- Idempotent; auf laufender DB einmalig manuell einspielen (supabase/README.md).
-- =====================================================================

create table if not exists public.mail_log (
  id           uuid primary key default gen_random_uuid(),
  typ          text not null,           -- 'note_fehlt','semesterbericht_faellig','teamwechsel','ziel_zugewiesen','bericht_abgeschlossen','rolle_zugewiesen','test'
  empfaenger   text not null,           -- E-Mail-Adresse
  bezug_id     uuid,                    -- fachlicher Bezug (benutzer/bericht/zuteilung/team …)
  bezug_key    text,                    -- zusätzlicher Dedup-Schlüssel (z.B. Semester)
  betreff      text,
  status       text not null default 'gesendet',  -- 'gesendet' | 'fehler'
  fehler       text,
  gesendet_am  timestamptz not null default now()
);
create index if not exists mail_log_dedup_idx
  on public.mail_log (typ, empfaenger, bezug_id, gesendet_am desc);

alter table public.mail_log enable row level security;
grant select on public.mail_log to authenticated;
drop policy if exists mail_log_select on public.mail_log;
create policy mail_log_select on public.mail_log for select to authenticated
  using (app.ist_berufsbildner());

-- SMTP-Modul durch Microsoft Graph ersetzt (planung/mailmodule.md) -> Tabelle entfernen.
drop policy if exists smtp_all on public.smtp_einstellung;
drop table if exists public.smtp_einstellung;
