-- =====================================================================
-- Löschen betrieblicher Handlungskompetenzen soll abhängige Verlaufsdaten
-- mitentfernen (Kanton-Kompetenzen sind per RLS ohnehin nicht löschbar).
-- Daher ON DELETE CASCADE auf den FKs, die auf handlungskompetenz bzw. deren
-- leistungsziel zeigen.
-- =====================================================================

alter table public.kompetenz_status
  drop constraint kompetenz_status_handlungskompetenz_id_fkey,
  add constraint kompetenz_status_handlungskompetenz_id_fkey
    foreign key (handlungskompetenz_id) references public.handlungskompetenz (id) on delete cascade;

alter table public.selbsteinschaetzung
  drop constraint selbsteinschaetzung_leistungsziel_id_fkey,
  add constraint selbsteinschaetzung_leistungsziel_id_fkey
    foreign key (leistungsziel_id) references public.leistungsziel (id) on delete cascade;
