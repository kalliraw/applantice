-- =====================================================================
-- Benutzer löschen (nur Berufsbildner).
--
-- Ergänzt die benutzer-Policies aus 20260713090002_rls.sql um DELETE. Ohne diese
-- Policy verweigert RLS jedes DELETE stillschweigend (0 Zeilen, kein Fehler).
--
-- Bewusst KEIN Cascade: die FK-Beziehungen der Verlaufsdaten (selbsteinschaetzung,
-- note, bildungsbericht, team_zuteilung, kompetenz_status, leistungsbeurteilung …)
-- haben kein ON DELETE CASCADE. Ein Benutzer mit Historie lässt sich daher nicht
-- löschen (FK-Verletzung 23503) – für ihn gilt weiterhin "inaktiv statt löschen"
-- (roles.md). Löschen ist damit faktisch nur für frische/irrtümliche Konten möglich
-- (z.B. per Entra-Sync angelegte, noch ungenutzte oder manuell falsch erfasste).
--
-- Idempotent (drop policy if exists) – darf mehrfach laufen. Wird auf einer frischen
-- DB automatisch angewandt; auf einer laufenden DB einmalig manuell (siehe
-- supabase/README.md).
-- =====================================================================

drop policy if exists benutzer_delete on public.benutzer;
create policy benutzer_delete on public.benutzer for delete to authenticated
  using (app.ist_berufsbildner());
