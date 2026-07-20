-- =====================================================================
-- Benachrichtigungs-Einstellungen: pro Mail-Typ an/aus, in der App pflegbar
-- (Einstellungen > Benachrichtigungen). Der mailer liest die Tabelle und
-- überspringt deaktivierte Typen; fehlt eine Zeile, gilt "aktiv" (default an).
--
-- Idempotent; auf laufender DB einmalig manuell einspielen (supabase/README.md).
-- =====================================================================

create table if not exists public.benachrichtigung_einstellung (
  typ             text primary key,   -- Mail-Typ (siehe planung/mailmodule.md)
  aktiv           boolean not null default true,
  aktualisiert_von uuid references public.benutzer (id),
  aktualisiert_am timestamptz not null default now()
);

-- Standard-Typen anlegen (alle zunächst aktiv).
insert into public.benachrichtigung_einstellung (typ) values
  ('note_fehlt'),
  ('semesterbericht_faellig'),
  ('teamwechsel'),
  ('ziel_zugewiesen'),
  ('bericht_abgeschlossen'),
  ('rolle_zugewiesen')
on conflict (typ) do nothing;

alter table public.benachrichtigung_einstellung enable row level security;
grant select, insert, update on public.benachrichtigung_einstellung to authenticated;

drop policy if exists benachr_select on public.benachrichtigung_einstellung;
create policy benachr_select on public.benachrichtigung_einstellung for select to authenticated
  using (app.ist_berufsbildner());

drop policy if exists benachr_write on public.benachrichtigung_einstellung;
create policy benachr_write on public.benachrichtigung_einstellung for all to authenticated
  using (app.ist_berufsbildner()) with check (app.ist_berufsbildner());
