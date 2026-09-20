-- WEG-Verwaltung pgTAP regression tests for 0067 gemischte Verteilungsschluessel.
--
-- Scope:
--   - eine 70/30-Regel verteilt auf die von Hand nachgerechneten Anteile
--   - ein Teil mit fehlenden Basiswerten reisst die GANZE Regel mit (23514) —
--     nie wird still auf dem verbleibenden Teil allein verteilt
--   - Summe der Gewichte = 100, je Anweisung geprueft
--   - der HeizKV-Korridor 50–70 und der Pflichtfall von genau 70
--   - der nicht verbrauchsabhaengige Teil muss nach Flaeche gehen
--   - keine Verschachtelung, kein Teil aus fremder WEG, keine Teile an einem
--     nicht gemischten Schluessel
--   - eine freie gemischte Regel darf ausserhalb des Korridors liegen
--   - der Sollstellungs-Generator laeuft ueber einen gemischten Schluessel durch
--
-- Laeuft in einer Transaktion und rollt alle Fixtures zurueck.

begin;

select plan(24);

-- ============================================================================
-- Katalog
-- ============================================================================

select ok(
  to_regclass('public.verteilungsschluessel_teil') is not null,
  'die Teil-Tabelle existiert'
);

select ok(
  (
    select c.relrowsecurity and c.relforcerowsecurity
    from pg_catalog.pg_class c
    where c.oid = 'public.verteilungsschluessel_teil'::regclass
  ),
  'die Teil-Tabelle hat RLS und FORCE RLS'
);

-- ============================================================================
-- Fixtures
-- ============================================================================

insert into public.tenant (id, name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, '0067 Tenant')
on conflict (id) do update
set name = excluded.name;

select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub', '11111111-1111-4111-8111-111111111167',
    'role', 'authenticated',
    'app_metadata', pg_catalog.jsonb_build_object(
      'tenant_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67',
      'role', 'tenant_admin'
    )
  )::text,
  true
);

insert into public.weg (id, tenant_id, name)
values
  ('c0000000-0000-4000-8000-000000000067'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, '0067 WEG'),
  ('d0000000-0000-4000-8000-000000000067'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, '0067 Fremde WEG');

insert into public.unit (id, tenant_id, weg_id, bezeichnung, mea_zaehler, mea_nenner)
values
  ('c1000000-0000-4000-8000-000000000067'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'c0000000-0000-4000-8000-000000000067'::uuid, 'Whg A', 50, 100),
  ('c2000000-0000-4000-8000-000000000067'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'c0000000-0000-4000-8000-000000000067'::uuid, 'Whg B', 50, 100),
  ('d1000000-0000-4000-8000-000000000067'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'd0000000-0000-4000-8000-000000000067'::uuid, 'Fremd', 100, 100);

insert into public.verteilungsschluessel (id, tenant_id, weg_id, name)
values
  ('e1000000-0000-4000-8000-000000000067'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'c0000000-0000-4000-8000-000000000067'::uuid, 'Heizverbrauch'),
  ('e2000000-0000-4000-8000-000000000067'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'c0000000-0000-4000-8000-000000000067'::uuid, 'Wohnflaeche'),
  ('e3000000-0000-4000-8000-000000000067'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'c0000000-0000-4000-8000-000000000067'::uuid, 'Heizung 70/30'),
  ('e4000000-0000-4000-8000-000000000067'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'c0000000-0000-4000-8000-000000000067'::uuid, 'Frei gemischt'),
  ('e5000000-0000-4000-8000-000000000067'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'c0000000-0000-4000-8000-000000000067'::uuid, 'Pflicht 70'),
  ('e6000000-0000-4000-8000-000000000067'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'c0000000-0000-4000-8000-000000000067'::uuid, 'Pro Einheit'),
  ('e7000000-0000-4000-8000-000000000067'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'c0000000-0000-4000-8000-000000000067'::uuid, 'Verbrauch ohne Basiswerte'),
  ('e8000000-0000-4000-8000-000000000067'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'c0000000-0000-4000-8000-000000000067'::uuid, 'Gemischt ohne Teile'),
  ('e9000000-0000-4000-8000-000000000067'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'c0000000-0000-4000-8000-000000000067'::uuid, 'Heizung kaputt'),
  ('f1000000-0000-4000-8000-000000000067'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'd0000000-0000-4000-8000-000000000067'::uuid, 'Fremde Flaeche');

insert into public.verteilungsschluessel_version (
  id, tenant_id, verteilungsschluessel_id, typ, quelle, gueltig_ab, parameter
)
values
  ('e1100000-0000-4000-8000-000000000067'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e1000000-0000-4000-8000-000000000067'::uuid, 'verbrauch', 'gesetz', date '2000-01-01', '{}'::jsonb),
  ('e2100000-0000-4000-8000-000000000067'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e2000000-0000-4000-8000-000000000067'::uuid, 'flaeche', 'gesetz', date '2000-01-01', '{}'::jsonb),
  ('e3100000-0000-4000-8000-000000000067'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e3000000-0000-4000-8000-000000000067'::uuid, 'gemischt', 'gesetz', date '2000-01-01', '{"regelwerk":"heizkv_waerme"}'::jsonb),
  ('e4100000-0000-4000-8000-000000000067'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e4000000-0000-4000-8000-000000000067'::uuid, 'gemischt', 'beschluss', date '2000-01-01', '{}'::jsonb),
  ('e5100000-0000-4000-8000-000000000067'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e5000000-0000-4000-8000-000000000067'::uuid, 'gemischt', 'gesetz', date '2000-01-01', '{"regelwerk":"heizkv_waerme_70"}'::jsonb),
  ('e6100000-0000-4000-8000-000000000067'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e6000000-0000-4000-8000-000000000067'::uuid, 'einheit', 'beschluss', date '2000-01-01', '{}'::jsonb),
  ('e7100000-0000-4000-8000-000000000067'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e7000000-0000-4000-8000-000000000067'::uuid, 'verbrauch', 'gesetz', date '2000-01-01', '{}'::jsonb),
  ('e8100000-0000-4000-8000-000000000067'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e8000000-0000-4000-8000-000000000067'::uuid, 'gemischt', 'gesetz', date '2000-01-01', '{}'::jsonb),
  ('e9100000-0000-4000-8000-000000000067'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e9000000-0000-4000-8000-000000000067'::uuid, 'gemischt', 'gesetz', date '2000-01-01', '{}'::jsonb),
  ('f1100000-0000-4000-8000-000000000067'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'f1000000-0000-4000-8000-000000000067'::uuid, 'flaeche', 'gesetz', date '2000-01-01', '{}'::jsonb);

-- Verbrauch A 1.400 / B 600 (Summe 2.000), Flaeche A 60 / B 40 (Summe 100).
insert into public.verteilungsschluessel_basiswert (
  tenant_id, verteilungsschluessel_version_id, unit_id, wert, einheit, gueltig_ab
)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e1100000-0000-4000-8000-000000000067'::uuid, 'c1000000-0000-4000-8000-000000000067'::uuid, 1400, 'kWh', date '2000-01-01'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e1100000-0000-4000-8000-000000000067'::uuid, 'c2000000-0000-4000-8000-000000000067'::uuid,  600, 'kWh', date '2000-01-01'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e2100000-0000-4000-8000-000000000067'::uuid, 'c1000000-0000-4000-8000-000000000067'::uuid,   60, 'm2',  date '2000-01-01'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e2100000-0000-4000-8000-000000000067'::uuid, 'c2000000-0000-4000-8000-000000000067'::uuid,   40, 'm2',  date '2000-01-01');

-- ============================================================================
-- Die Verteilung selbst
-- ============================================================================

select lives_ok(
  $q$insert into public.verteilungsschluessel_teil (
       tenant_id, verteilungsschluessel_version_id, teil_version_id, gewicht
     )
     values
       ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e3100000-0000-4000-8000-000000000067'::uuid, 'e1100000-0000-4000-8000-000000000067'::uuid, 70),
       ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e3100000-0000-4000-8000-000000000067'::uuid, 'e2100000-0000-4000-8000-000000000067'::uuid, 30)$q$,
  'eine 70/30-Regel laesst sich in einer Anweisung anlegen'
);

-- A = 0,7 · (1400/2000) + 0,3 · (60/100) = 0,49 + 0,18 = 0,67
select is(
  (
    select round(s.anteil, 6)
    from private._verteilungsschluessel_version_unit_shares(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid,
      'e3100000-0000-4000-8000-000000000067'::uuid,
      'c0000000-0000-4000-8000-000000000067'::uuid,
      date '2030-01-01') as s
   where s.unit_id = 'c1000000-0000-4000-8000-000000000067'::uuid
  ),
  0.670000::numeric,
  'Whg A traegt 0,67 — 70 Prozent Verbrauch plus 30 Prozent Flaeche'
);

-- B = 0,7 · (600/2000) + 0,3 · (40/100) = 0,21 + 0,12 = 0,33
select is(
  (
    select round(s.anteil, 6)
    from private._verteilungsschluessel_version_unit_shares(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid,
      'e3100000-0000-4000-8000-000000000067'::uuid,
      'c0000000-0000-4000-8000-000000000067'::uuid,
      date '2030-01-01') as s
   where s.unit_id = 'c2000000-0000-4000-8000-000000000067'::uuid
  ),
  0.330000::numeric,
  'Whg B traegt 0,33'
);

select is(
  (
    select round(sum(s.anteil), 6)
    from private._verteilungsschluessel_version_unit_shares(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid,
      'e3100000-0000-4000-8000-000000000067'::uuid,
      'c0000000-0000-4000-8000-000000000067'::uuid,
      date '2030-01-01') as s
  ),
  1.000000::numeric,
  'die Anteile summieren auf 1 — es bleibt nichts unverteilt'
);

-- ============================================================================
-- Fail closed
-- ============================================================================

-- "Heizung kaputt": ein Teil ohne Basiswerte. Das Anlegen geht — die Basiswerte
-- koennen ja spaeter kommen. Die Verteilung darf dann aber NICHT still auf dem
-- Flaechenteil allein landen.
insert into public.verteilungsschluessel_teil (
  tenant_id, verteilungsschluessel_version_id, teil_version_id, gewicht
)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e9100000-0000-4000-8000-000000000067'::uuid, 'e7100000-0000-4000-8000-000000000067'::uuid, 70),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e9100000-0000-4000-8000-000000000067'::uuid, 'e2100000-0000-4000-8000-000000000067'::uuid, 30);

select throws_ok(
  $q$select * from private._verteilungsschluessel_version_unit_shares(
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid,
       'e9100000-0000-4000-8000-000000000067'::uuid,
       'c0000000-0000-4000-8000-000000000067'::uuid,
       date '2030-01-01')$q$,
  '23514',
  null,
  'fehlt einem Teil ein Basiswert, scheitert die ganze Regel — nicht nur der Teil'
);

select throws_ok(
  $q$select * from private._verteilungsschluessel_version_unit_shares(
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid,
       'e8100000-0000-4000-8000-000000000067'::uuid,
       'c0000000-0000-4000-8000-000000000067'::uuid,
       date '2030-01-01')$q$,
  '23514',
  null,
  'ein gemischter Schluessel ohne Teile verteilt nichts, statt zu raten'
);

-- ============================================================================
-- Summe und Struktur
-- ============================================================================

select throws_ok(
  $q$insert into public.verteilungsschluessel_teil (
       tenant_id, verteilungsschluessel_version_id, teil_version_id, gewicht
     )
     values
       ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e4100000-0000-4000-8000-000000000067'::uuid, 'e1100000-0000-4000-8000-000000000067'::uuid, 60),
       ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e4100000-0000-4000-8000-000000000067'::uuid, 'e2100000-0000-4000-8000-000000000067'::uuid, 30)$q$,
  '23514',
  null,
  'Gewichte, die nicht 100 ergeben, werden abgelehnt'
);

select throws_ok(
  $q$insert into public.verteilungsschluessel_teil (
       tenant_id, verteilungsschluessel_version_id, teil_version_id, gewicht
     )
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e3100000-0000-4000-8000-000000000067'::uuid, 'e4100000-0000-4000-8000-000000000067'::uuid, 10)$q$,
  '23514',
  null,
  'ein gemischter Schluessel kann nicht Teil eines anderen sein'
);

select throws_ok(
  $q$insert into public.verteilungsschluessel_teil (
       tenant_id, verteilungsschluessel_version_id, teil_version_id, gewicht
     )
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e1100000-0000-4000-8000-000000000067'::uuid, 'e2100000-0000-4000-8000-000000000067'::uuid, 100)$q$,
  '23514',
  null,
  'ein nicht gemischter Schluessel kann keine Teile haben'
);

select throws_ok(
  $q$insert into public.verteilungsschluessel_teil (
       tenant_id, verteilungsschluessel_version_id, teil_version_id, gewicht
     )
     values
       ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e4100000-0000-4000-8000-000000000067'::uuid, 'f1100000-0000-4000-8000-000000000067'::uuid, 50),
       ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e4100000-0000-4000-8000-000000000067'::uuid, 'e2100000-0000-4000-8000-000000000067'::uuid, 50)$q$,
  '23514',
  null,
  'ein Teil aus einer fremden WEG wird abgelehnt'
);

-- ============================================================================
-- Der HeizKV-Korridor
-- ============================================================================

select throws_ok(
  $q$update public.verteilungsschluessel_teil
        set gewicht = case when gewicht = 70 then 80 else 20 end
      where verteilungsschluessel_version_id = 'e3100000-0000-4000-8000-000000000067'::uuid$q$,
  '23514',
  null,
  '80 Prozent nach Verbrauch verletzen den Korridor des § 7 Abs. 1 HeizkostenV'
);

select throws_ok(
  $q$insert into public.verteilungsschluessel_teil (
       tenant_id, verteilungsschluessel_version_id, teil_version_id, gewicht
     )
     values
       ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e5100000-0000-4000-8000-000000000067'::uuid, 'e1100000-0000-4000-8000-000000000067'::uuid, 65),
       ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e5100000-0000-4000-8000-000000000067'::uuid, 'e2100000-0000-4000-8000-000000000067'::uuid, 35)$q$,
  '23514',
  null,
  'im Pflichtfall des § 7 Abs. 1 Satz 2 sind 65 Prozent zu wenig'
);

select lives_ok(
  $q$insert into public.verteilungsschluessel_teil (
       tenant_id, verteilungsschluessel_version_id, teil_version_id, gewicht
     )
     values
       ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e5100000-0000-4000-8000-000000000067'::uuid, 'e1100000-0000-4000-8000-000000000067'::uuid, 70),
       ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e5100000-0000-4000-8000-000000000067'::uuid, 'e2100000-0000-4000-8000-000000000067'::uuid, 30)$q$,
  'im Pflichtfall gehen genau 70 Prozent durch'
);

select throws_ok(
  $q$insert into public.verteilungsschluessel_teil (
       tenant_id, verteilungsschluessel_version_id, teil_version_id, gewicht
     )
     values
       ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e9100000-0000-4000-8000-000000000067'::uuid, 'e6100000-0000-4000-8000-000000000067'::uuid, 100)$q$,
  '23514',
  null,
  'ein dritter Teil sprengt die Summe — und damit die Regel'
);

-- Eine freie gemischte Regel darf 50/50 sein: der Korridor gilt fuer
-- Heizkosten, nicht fuer gemischte Regeln ueberhaupt.
select lives_ok(
  $q$insert into public.verteilungsschluessel_teil (
       tenant_id, verteilungsschluessel_version_id, teil_version_id, gewicht
     )
     values
       ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e4100000-0000-4000-8000-000000000067'::uuid, 'e2100000-0000-4000-8000-000000000067'::uuid, 50),
       ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e4100000-0000-4000-8000-000000000067'::uuid, 'e6100000-0000-4000-8000-000000000067'::uuid, 50)$q$,
  'eine Regel ohne Regelwerk darf 50/50 aus Flaeche und Einheit bestehen'
);

-- Flaeche A 0,6 / B 0,4 und je Einheit 0,5 / 0,5 => A 0,55 / B 0,45.
select is(
  (
    select round(s.anteil, 6)
    from private._verteilungsschluessel_version_unit_shares(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid,
      'e4100000-0000-4000-8000-000000000067'::uuid,
      'c0000000-0000-4000-8000-000000000067'::uuid,
      date '2030-01-01') as s
   where s.unit_id = 'c1000000-0000-4000-8000-000000000067'::uuid
  ),
  0.550000::numeric,
  'die freie Regel mischt Flaeche und Gleichverteilung korrekt'
);

-- ============================================================================
-- Aufraeumen muss moeglich bleiben
-- ============================================================================

select lives_ok(
  $q$delete from public.verteilungsschluessel_teil
      where verteilungsschluessel_version_id = 'e4100000-0000-4000-8000-000000000067'::uuid$q$,
  'alle Teile einer Regel lassen sich loeschen — sonst waere kein Neuanfang moeglich'
);

select lives_ok(
  $q$delete from public.verteilungsschluessel_version
      where id = 'e4100000-0000-4000-8000-000000000067'::uuid$q$,
  'eine Version mit Teilen laesst sich loeschen, die Kaskade blockiert nicht'
);

-- ============================================================================
-- Der Generator laeuft durch
-- ============================================================================

insert into public.wirtschaftsplan (id, tenant_id, weg_id, jahr, bezeichnung, gesamtkosten)
values (
  'a1000000-0000-4000-8000-000000000067'::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid,
  'c0000000-0000-4000-8000-000000000067'::uuid,
  2095, 'Plan 2095', 12000.00
);

insert into public.wirtschaftsplan_position (
  tenant_id, wirtschaftsplan_id, position, kostenart, jahresbetrag,
  verteilungsschluessel_version_id
)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid,
  'a1000000-0000-4000-8000-000000000067'::uuid,
  1, 'Heizung', 12000.00,
  'e3100000-0000-4000-8000-000000000067'::uuid
);

select lives_ok(
  $q$select private._generate_sollstellungen_for_plan(
       'a1000000-0000-4000-8000-000000000067'::uuid, 1)$q$,
  'der Sollstellungs-Generator laeuft ueber einen gemischten Schluessel durch'
);

-- 12.000 · 0,67 / 12 = 670,00 im Monat.
select is(
  (
    select distinct s.betrag
    from public.sollstellung s
   where s.wirtschaftsplan_id = 'a1000000-0000-4000-8000-000000000067'::uuid
     and s.unit_id = 'c1000000-0000-4000-8000-000000000067'::uuid
  ),
  670.00::numeric(12, 2),
  'Whg A zahlt monatlich 670,00 — 0,67 von 12.000 auf zwoelf Monate'
);

select is(
  (
    select distinct s.betrag
    from public.sollstellung s
   where s.wirtschaftsplan_id = 'a1000000-0000-4000-8000-000000000067'::uuid
     and s.unit_id = 'c2000000-0000-4000-8000-000000000067'::uuid
  ),
  330.00::numeric(12, 2),
  'Whg B zahlt monatlich 330,00'
);

-- ============================================================================
-- Agent-Guard
-- ============================================================================

select pg_catalog.set_config('app.actor_type', 'agent', true);

select throws_ok(
  $q$insert into public.verteilungsschluessel_teil (
       tenant_id, verteilungsschluessel_version_id, teil_version_id, gewicht
     )
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa67'::uuid, 'e8100000-0000-4000-8000-000000000067'::uuid, 'e2100000-0000-4000-8000-000000000067'::uuid, 100)$q$,
  '42501',
  null,
  'Agenten koennen keine Teile schreiben'
);

select pg_catalog.set_config('app.actor_type', 'user', true);

select * from finish();

rollback;
