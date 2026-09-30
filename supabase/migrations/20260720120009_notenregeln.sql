-- =====================================================================
-- Notenregeln als Daten: Rundung, Fallnoten (Bestehen), BM-Berechnung.
--
-- Quellen (recherchiert 09.2026, siehe planung/featurematrix.md "Notenregeln"):
--   * BiVo Informatiker/in EFZ 2021 (SR 412.101.220.10) Art. 19:
--       Gesamtnote = IPA 40 / Erfahrungsnote Informatikkompetenzen 30 / ABU 20 / EGK 10.
--       IK = 80% Schnitt BFS-Modulnoten (auf halbe gerundet) + 20% Schnitt ÜK-Noten
--       (auf halbe gerundet), auf eine Dezimalstelle gerundet. EGK auf halbe Note.
--       Bestanden, wenn IPA >= 4, IK >= 4 UND Gesamtnote >= 4 (Fallnoten).
--   * BMV 2009 (SR 412.103.1, für BM-Beginn vor 1.3.2026) Art. 16/17/24/25:
--       Fachnote = ½ Erfahrungsnote + ½ Prüfungsnote (Fächer mit Abschlussprüfung),
--       Ergänzungsfächer = Erfahrungsnote; Durchschnittsnoten auf halbe, Gesamtnote
--       auf Zehntel. Promotion/Bestehen: Gesamtnote >= 4, max. 2 ungenügende Noten,
--       Summe der Abweichungen unter 4 <= 2. IDAF zählt nicht für die Promotion.
--   Die neue BMV (in Kraft 1.3.2026) rundet Erfahrungsnoten auf Zehntel – dann nur
--   die notenregel-Zeile BM anpassen, kein Code.
--
-- Rundungswerte: 'halbe' | 'zehntel' | null (= ungerundet).
-- Idempotent. Auf frischer DB automatisch (Seed setzt dieselben Werte); auf laufender
-- DB einmalig manuell einspielen (supabase/README.md).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Notenkomponente: Rundung + Fallnote.
-- ---------------------------------------------------------------------
alter table public.notenkomponente
  add column if not exists rundung_einzelnote text
    check (rundung_einzelnote in ('halbe', 'zehntel')),
  add column if not exists rundung text
    check (rundung in ('halbe', 'zehntel')),
  add column if not exists mindestnote numeric(2,1)
    check (mindestnote between 1 and 6),
  add column if not exists promotionsrelevant boolean not null default true;

comment on column public.notenkomponente.rundung_einzelnote is
  'Rundung jeder einzelnen Fach-/Modulnote dieser Komponente, bevor gemittelt wird (z.B. Modulnote auf halbe).';
comment on column public.notenkomponente.rundung is
  'Rundung des Komponentenwerts selbst (z.B. Schnitt der Modulnoten auf halbe, IK auf Zehntel).';
comment on column public.notenkomponente.mindestnote is
  'Fallnote: Komponente muss mindestens diesen Wert erreichen, sonst nicht bestanden (null = keine Bedingung).';
comment on column public.notenkomponente.promotionsrelevant is
  'BM: zählt diese Komponente für die Semester-Promotion? (IDAF/IDPA nicht, BMV Art. 17).';

update public.notenkomponente set rundung = 'zehntel', mindestnote = 4.0 where code = 'IPA';
update public.notenkomponente set rundung = 'zehntel', mindestnote = 4.0 where code = 'INFORMATIK';
update public.notenkomponente set rundung_einzelnote = 'halbe', rundung = 'halbe'
 where code in ('INFORMATIK_BFS', 'INFORMATIK_UEK', 'EGK');
update public.notenkomponente set rundung = 'zehntel' where code = 'ABU';
update public.notenkomponente set promotionsrelevant = false where code = 'BM_IDPA';
update public.notenkomponente set name = 'BM-Fachnoten' where code = 'BM_FACHNOTE';
update public.notenkomponente set name = 'BM Interdisziplinäres Arbeiten (IDAF + IDPA)' where code = 'BM_IDPA';

-- ---------------------------------------------------------------------
-- 2) Fach: hat eine Abschlussprüfung (BM: Fachnote = ½ Erfahrung + ½ Prüfung).
-- ---------------------------------------------------------------------
alter table public.fach
  add column if not exists hat_abschlusspruefung boolean not null default false;
comment on column public.fach.hat_abschlusspruefung is
  'BM: Fach mit Abschlussprüfung (Grundlagen-/Schwerpunktfächer, IDPA). Prüfungsnote liegt append-only in note (art=pruefung).';

-- ---------------------------------------------------------------------
-- 3) Regeln pro Kontext (EFZ / BM).
-- ---------------------------------------------------------------------
create table if not exists public.notenregel (
  kontext                  public.noten_kontext primary key,
  bezeichnung              text not null,
  rundung_gesamt           text check (rundung_gesamt in ('halbe', 'zehntel')),
  mindestnote_gesamt       numeric(2,1) check (mindestnote_gesamt between 1 and 6),
  -- nur BM:
  rundung_semesternote     text check (rundung_semesternote in ('halbe', 'zehntel')),
  rundung_erfahrungsnote   text check (rundung_erfahrungsnote in ('halbe', 'zehntel')),
  rundung_pruefungsnote    text check (rundung_pruefungsnote in ('halbe', 'zehntel')),
  rundung_fachnote         text check (rundung_fachnote in ('halbe', 'zehntel')),
  anteil_pruefung          numeric(4,3) check (anteil_pruefung between 0 and 1),
  max_ungenuegend          int check (max_ungenuegend >= 0),
  max_notendefizit         numeric(3,1) check (max_notendefizit >= 0),
  quelle                   text
);
comment on table public.notenregel is
  'Berechnungs-/Bestehensregeln je Kontext als Daten (Rundung Gesamtnote, Fallnote, BM-Promotion). Änderbar ohne Code.';

grant select, update on public.notenregel to authenticated;
alter table public.notenregel enable row level security;
drop policy if exists notenregel_select on public.notenregel;
create policy notenregel_select on public.notenregel for select to authenticated using (true);
drop policy if exists notenregel_write on public.notenregel;
create policy notenregel_write on public.notenregel for update to authenticated
  using (app.ist_verwaltung()) with check (app.ist_verwaltung());

insert into public.notenregel (kontext, bezeichnung, rundung_gesamt, mindestnote_gesamt, quelle)
values ('EFZ', 'Informatiker/in EFZ, BiVo 2021', 'zehntel', 4.0,
        'SR 412.101.220.10 Art. 19; ICT-Berufsbildung Ausführungsbestimmungen QV (06.2024)')
on conflict (kontext) do nothing;

insert into public.notenregel (kontext, bezeichnung, rundung_gesamt, mindestnote_gesamt,
  rundung_semesternote, rundung_erfahrungsnote, rundung_pruefungsnote, rundung_fachnote,
  anteil_pruefung, max_ungenuegend, max_notendefizit, quelle)
values ('BM', 'BMV 2009 (BM-Beginn vor 1.3.2026)', 'zehntel', 4.0,
        'halbe', 'halbe', 'halbe', 'halbe', 0.5, 2, 2.0,
        'SR 412.103.1 (Fassung 2009) Art. 16, 17, 24, 25 – Schulpraxis bei der BM-Schule prüfen')
on conflict (kontext) do nothing;

-- ---------------------------------------------------------------------
-- 4) BM-Fächerliste TAL korrigieren (Rahmenlehrplan BM 2012):
--    Schwerpunkt = Mathematik + Naturwissenschaften (Physik/Chemie gemeinsam),
--    nicht Physik/Chemie/Biologie einzeln. Alte Zeilen nur deaktivieren (Historie).
--    Nur auf laufender DB relevant – auf frischer DB legt der Seed die Liste an.
-- ---------------------------------------------------------------------
do $$
declare
  nk uuid := (select id from public.notenkomponente where code = 'BM_FACHNOTE');
begin
  if nk is null or not exists (select 1 from public.fach where kontext = 'BM') then
    return;  -- frische DB: Seed übernimmt
  end if;
  update public.fach set aktiv = false
   where kontext = 'BM' and name in ('Physik', 'Chemie', 'Biologie');
  insert into public.fach (name, kontext, typ, notenkomponente_id, gewicht, aktiv, bemerkung, sortierung, hat_abschlusspruefung)
  select v.name, 'BM', 'BM-Schwerpunktfach', nk, 1, true, v.bemerkung, v.sortierung, true
    from (values
      ('Mathematik (Schwerpunkt)', 'Schwerpunktbereich TAL, Abschlussprüfung (Rahmenlehrplan BM 2012).', 5050),
      ('Naturwissenschaften', 'Schwerpunktbereich TAL: Physik und Chemie, gemeinsame Abschlussprüfung (Rahmenlehrplan BM 2012).', 5051)
    ) as v(name, bemerkung, sortierung)
   where not exists (select 1 from public.fach f where f.kontext = 'BM' and f.name = v.name);
  update public.fach set hat_abschlusspruefung = true
   where kontext = 'BM'
     and name in ('Deutsch (Erstsprache)', 'Franzoesisch (2. Landessprache)', 'Englisch (BM)',
                  'Mathematik (BM)', 'Interdisziplinaere Projektarbeit (IDPA)');
end $$;
