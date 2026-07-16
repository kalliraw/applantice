-- =====================================================================
-- Modul→Semester-Planung darf auch der Lernende pflegen (globaler Schulplan,
-- für alle gleich). Es soll aber NUR die Spalte fach.semester änderbar sein –
-- nicht Name, Gewicht, Notenkomponente usw. Da RLS keine Spalten einschränkt,
-- kapseln wir das in einer SECURITY DEFINER-Funktion. Die fach_update-Policy
-- (Berufsbildner, alle Spalten) bleibt unverändert bestehen.
-- =====================================================================

create or replace function public.modul_semester_setzen(p_fach_id uuid, p_semester int)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
begin
  -- Nur eingeloggte Rollen (Lernende oder Berufsbildner); rollenlose Konten nicht.
  if app.rolle() is null then
    raise exception 'Kein Zugriff: keine Rolle zugewiesen';
  end if;
  if p_semester is not null and (p_semester < 1 or p_semester > 8) then
    raise exception 'Semester muss zwischen 1 und 8 liegen (oder NULL)';
  end if;
  update public.fach set semester = p_semester where id = p_fach_id;
end;
$$;

comment on function public.modul_semester_setzen(uuid, int) is
  'Setzt fach.semester (globale Modul→Semester-Planung). Für Lernende und Berufsbildner, kapselt die Spalten-Einschränkung (nur semester).';

revoke all on function public.modul_semester_setzen(uuid, int) from public;
grant execute on function public.modul_semester_setzen(uuid, int) to authenticated;
