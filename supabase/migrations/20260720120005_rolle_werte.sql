-- =====================================================================
-- Neue Rollen-Werte: 'teamowner' und 'admin' (planung/roles.md, 4-Rollen-Modell).
--
-- WICHTIG: Eigene Migration, die AUSSCHLIESSLICH die Enum-Werte hinzufügt. Ein neu
-- hinzugefügter Enum-Wert darf in derselben Transaktion nicht verwendet werden
-- ("unsafe use of new value of enum"). Alles, was die Werte nutzt (Policies,
-- Funktionen, Bootstrap), steht daher in der Folge-Migration 20260720120006.
--
-- ADD VALUE IF NOT EXISTS ist idempotent (PG 12+) – die Migration darf mehrfach
-- laufen. Auf frischer DB automatisch; auf laufender DB einmalig manuell einspielen
-- (supabase/README.md), VOR 20260720120006.
-- =====================================================================

alter type public.rolle add value if not exists 'teamowner';
alter type public.rolle add value if not exists 'admin';
