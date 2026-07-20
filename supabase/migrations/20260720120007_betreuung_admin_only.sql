-- =====================================================================
-- Betreuungs-Zuweisung ausschliesslich durch Admin (Sicherheit).
--
-- Zuvor durfte "Verwaltung" (Berufsbildner ODER Admin) betreuung schreiben. Damit
-- könnte sich ein Berufsbildner selbst Lernende zuweisen und so deren Noten/Berichte
-- einsehen (Selbst-Elevierung). Betreuungen legt daher nur noch ein Admin an/ändert
-- sie. Lesen bleibt wie gehabt (Verwaltung + eigene Zeilen, siehe 20260720120006).
--
-- Idempotent (drop policy if exists). Auf frischer DB automatisch; auf laufender DB
-- einmalig manuell einspielen (supabase/README.md).
-- =====================================================================

drop policy if exists betr_write on public.betreuung;
create policy betr_write on public.betreuung for all to authenticated
  using (app.ist_admin()) with check (app.ist_admin());
