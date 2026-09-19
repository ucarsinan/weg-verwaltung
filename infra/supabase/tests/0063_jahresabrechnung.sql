-- WEG-Verwaltung pgTAP regression tests for 0063 Jahresabrechnung.
--
-- Scope:
--   - Katalog: drei Tabellen, RLS/FORCE RLS, security_invoker der Spitzen-View
--   - erstelle_abrechnung snapshottet je Kostenart UND Schluessel und verteilt
--     ueber dieselbe Funktion wie der Sollstellungs-Generator
--   - die Spitze rechnet gegen das SOLL, nicht gegen geleistete Zahlungen
--   - Zweitbeschluss loest den Erstbeschluss ab; nur einer bleibt beschlossen
--   - eine beschlossene Abrechnung ist gesperrt
--   - Statuswechsel nur ueber die RPC, Agent-Writes blockiert, gemischt 0A000
--
-- Laeuft in einer Transaktion und rollt alle Fixtures zurueck.

begin;

select plan(20);

-- ============================================================================
-- Katalog
-- ============================================================================

select is(
  (
    select count(*)::int
    from unnest(array[
      'public.abrechnung',
      'public.abrechnung_kostenposition',
      'public.abrechnung_anteil'
    ]) as t(name)
    where to_regclass(t.name) is not null
  ),
  3,
  'alle drei Abrechnungstabellen existieren'
);

select is(
  (
    select count(*)::int
    from pg_catalog.pg_class c
    where c.oid = any(array[
      'public.abrechnung'::regclass,
      'public.abrechnung_kostenposition'::regclass,
      'public.abrechnung_anteil'::regclass
    ])
      and c.relrowsecurity
      and c.relforcerowsecurity
  ),
  3,
  'alle drei Tabellen haben RLS und FORCE RLS'
);

select ok(
  (
    select pg_catalog.array_to_string(c.reloptions, ',') like '%security_invoker=on%'
    from pg_catalog.pg_class c
    where c.oid = 'public.abrechnung_spitze'::regclass
  ),
  'die Spitzen-View laeuft mit security_invoker'
);

-- ============================================================================
-- Fixtures
-- ============================================================================

insert into public.tenant (id, name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa63'::uuid, '0063 Tenant')
on conflict (id) do update
set name = excluded.name;

-- erstelle_abrechnung/beschliesse_abrechnung lesen public.tenant_id() aus dem
-- JWT-Claim — im Test also einmal setzen.
select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub', '11111111-1111-4111-8111-111111111163',
    'role', 'authenticated',
    'app_metadata', pg_catalog.jsonb_build_object(
      'tenant_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa63',
      'role', 'tenant_admin'
    )
  )::text,
  true
);

insert into public.weg (id, tenant_id, name)
values (
  'c0000000-0000-4000-8000-000000000063'::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa63'::uuid,
  '0063 WEG'
);

-- MEA 400/1000 und 600/1000 — summieren sich auf 1.
insert into public.unit (id, tenant_id, weg_id, bezeichnung, mea_zaehler, mea_nenner)
values
  ('c1000000-0000-4000-8000-000000000063'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa63'::uuid, 'c0000000-0000-4000-8000-000000000063'::uuid, 'Whg A', 400, 1000),
  ('c2000000-0000-4000-8000-000000000063'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa63'::uuid, 'c0000000-0000-4000-8000-000000000063'::uuid, 'Whg B', 600, 1000);

insert into public.verteilungsschluessel (id, tenant_id, weg_id, name)
values
  ('e1000000-0000-4000-8000-000000000063'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa63'::uuid, 'c0000000-0000-4000-8000-000000000063'::uuid, 'MEA'),
  ('e2000000-0000-4000-8000-000000000063'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa63'::uuid, 'c0000000-0000-4000-8000-000000000063'::uuid, 'Pro Einheit'),
  ('e3000000-0000-4000-8000-000000000063'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa63'::uuid, 'c0000000-0000-4000-8000-000000000063'::uuid, 'Heizung gemischt');

insert into public.verteilungsschluessel_version (
  id, tenant_id, verteilungsschluessel_id, typ, quelle, gueltig_ab, parameter
)
values
  ('e1100000-0000-4000-8000-000000000063'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa63'::uuid, 'e1000000-0000-4000-8000-000000000063'::uuid, 'mea', 'gesetz', date '2000-01-01', '{}'::jsonb),
  ('e2100000-0000-4000-8000-000000000063'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa63'::uuid, 'e2000000-0000-4000-8000-000000000063'::uuid, 'einheit', 'beschluss', date '2000-01-01', '{}'::jsonb),
  ('e3100000-0000-4000-8000-000000000063'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa63'::uuid, 'e3000000-0000-4000-8000-000000000063'::uuid, 'gemischt', 'gesetz', date '2000-01-01', '{"parts":[{"typ":"verbrauch","gewicht":70}]}'::jsonb);

-- Wirtschaftsplan 2090: 12.000 => Soll A 4.800, Soll B 7.200 im Jahr.
insert into public.wirtschaftsplan (id, tenant_id, weg_id, jahr, bezeichnung, gesamtkosten)
values (
  'a1000000-0000-4000-8000-000000000063'::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa63'::uuid,
  'c0000000-0000-4000-8000-000000000063'::uuid,
  2090, 'Plan 2090', 12000.00
);

select pg_catalog.set_config('app.wirtschaftsplan_lifecycle_manager', '1', true);
update public.wirtschaftsplan
   set status = 'aktiv', aktiviert_am = now()
 where id = 'a1000000-0000-4000-8000-000000000063'::uuid;
select pg_catalog.set_config('app.wirtschaftsplan_lifecycle_manager', '', true);

select private._generate_sollstellungen_for_plan('a1000000-0000-4000-8000-000000000063'::uuid, 1);

-- Ausgaben 2090: 10.000 nach MEA (A 4.000 / B 6.000) und 2.000 pro Einheit
-- (je 1.000). Zusammen A 5.000, B 7.000.
insert into public.ausgabe (
  tenant_id, weg_id, betrag, wert_datum, empfaenger, kostenart, verteilungsschluessel_version_id
)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa63'::uuid, 'c0000000-0000-4000-8000-000000000063'::uuid, 10000.00, date '2090-05-01', 'Verwalter', 'Verwaltung', 'e1100000-0000-4000-8000-000000000063'::uuid),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa63'::uuid, 'c0000000-0000-4000-8000-000000000063'::uuid, 2000.00, date '2090-07-01', 'Kabel AG', 'Kabel', 'e2100000-0000-4000-8000-000000000063'::uuid);

-- Eine Zahlung, die nur den Januar von Whg A deckt. Wuerde die Spitze gegen
-- Ist-Zahlungen rechnen, saehe man das sofort.
insert into public.zahlung (id, tenant_id, weg_id, betrag, wert_datum, zahler_referenz)
values (
  'f1000000-0000-4000-8000-000000000063'::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa63'::uuid,
  'c0000000-0000-4000-8000-000000000063'::uuid,
  400.00, date '2090-01-05', 'Whg A Januar'
);

insert into public.zahlungszuordnung (tenant_id, zahlung_id, sollstellung_id, betrag)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa63'::uuid,
  'f1000000-0000-4000-8000-000000000063'::uuid,
  (select s.id from public.sollstellung s
    where s.wirtschaftsplan_id = 'a1000000-0000-4000-8000-000000000063'::uuid
      and s.unit_id = 'c1000000-0000-4000-8000-000000000063'::uuid
      and s.monat = 1),
  400.00
);

-- ============================================================================
-- Erstellung
-- ============================================================================

select lives_ok(
  $q$select public.erstelle_abrechnung(
       'c0000000-0000-4000-8000-000000000063'::uuid, 2090)$q$,
  'die Abrechnung laesst sich erstellen'
);

select is(
  (
    select count(*)::int
    from public.abrechnung_kostenposition k
    join public.abrechnung a on a.id = k.abrechnung_id
   where a.weg_id = 'c0000000-0000-4000-8000-000000000063'::uuid
  ),
  2,
  'je Kostenart und Schluessel entsteht eine Kostenposition'
);

select is(
  (
    select an.betrag
    from public.abrechnung_anteil an
    join public.abrechnung_kostenposition k on k.id = an.abrechnung_kostenposition_id
   where k.kostenart = 'Verwaltung'
     and an.unit_id = 'c1000000-0000-4000-8000-000000000063'::uuid
  ),
  4000.00::numeric(12, 2),
  'die MEA-Position verteilt wie der Sollstellungs-Generator (0,4 von 10.000)'
);

select is(
  (
    select an.betrag
    from public.abrechnung_anteil an
    join public.abrechnung_kostenposition k on k.id = an.abrechnung_kostenposition_id
   where k.kostenart = 'Kabel'
     and an.unit_id = 'c1000000-0000-4000-8000-000000000063'::uuid
  ),
  1000.00::numeric(12, 2),
  'die Einheiten-Position verteilt gleichmaessig (2.000 / 2)'
);

-- ============================================================================
-- Die Spitze
-- ============================================================================

select is(
  (
    select sp.kostenanteil
    from public.abrechnung_spitze sp
   where sp.unit_id = 'c1000000-0000-4000-8000-000000000063'::uuid
  ),
  5000.00::numeric(12, 2),
  'der Kostenanteil summiert alle Positionen einer Einheit (4.000 + 1.000)'
);

select is(
  (
    select sp.soll_vorschuesse
    from public.abrechnung_spitze sp
   where sp.unit_id = 'c1000000-0000-4000-8000-000000000063'::uuid
  ),
  4800.00::numeric(12, 2),
  'die Vorschuesse zaehlen das SOLL des Jahres (12 x 400), nicht die eine geleistete Zahlung von 400'
);

select is(
  (
    select sp.spitze
    from public.abrechnung_spitze sp
   where sp.unit_id = 'c1000000-0000-4000-8000-000000000063'::uuid
  ),
  200.00::numeric(12, 2),
  'positive Spitze = Nachschuss (5.000 - 4.800)'
);

select is(
  (
    select sp.spitze
    from public.abrechnung_spitze sp
   where sp.unit_id = 'c2000000-0000-4000-8000-000000000063'::uuid
  ),
  -200.00::numeric(12, 2),
  'negative Spitze = Guthaben (7.000 - 7.200)'
);

-- ============================================================================
-- Beschluss und Zweitbeschluss
-- ============================================================================

select lives_ok(
  $q$select public.beschliesse_abrechnung(
       (select id from public.abrechnung
         where weg_id = 'c0000000-0000-4000-8000-000000000063'::uuid
           and status = 'entwurf'),
       date '2091-03-15')$q$,
  'ein Entwurf laesst sich beschliessen'
);

select throws_ok(
  $q$update public.abrechnung_kostenposition set betrag_gesamt = 1.00
      where kostenart = 'Verwaltung'$q$,
  '23514',
  null,
  'eine beschlossene Abrechnung ist gegen Aenderungen gesperrt'
);

select throws_ok(
  $q$update public.abrechnung set status = 'abgeloest'
      where weg_id = 'c0000000-0000-4000-8000-000000000063'::uuid$q$,
  '42501',
  null,
  'ein Statuswechsel an der RPC vorbei wird abgelehnt'
);

-- Zweitbeschluss: neuer Entwurf fuer dasselbe Jahr, dann beschliessen.
select lives_ok(
  $q$select public.erstelle_abrechnung(
       'c0000000-0000-4000-8000-000000000063'::uuid, 2090)$q$,
  'fuer einen Zweitbeschluss laesst sich ein neuer Entwurf anlegen'
);

select throws_ok(
  $q$select public.erstelle_abrechnung(
       'c0000000-0000-4000-8000-000000000063'::uuid, 2090)$q$,
  '23505',
  null,
  'ein zweiter gleichzeitiger Entwurf desselben Jahres wird abgelehnt'
);

select lives_ok(
  $q$select public.beschliesse_abrechnung(
       (select id from public.abrechnung
         where weg_id = 'c0000000-0000-4000-8000-000000000063'::uuid
           and status = 'entwurf'),
       date '2091-09-20')$q$,
  'der Zweitbeschluss ist zulaessig und loest den Erstbeschluss ab'
);

select is(
  (
    select pg_catalog.concat(
      count(*) filter (where status = 'beschlossen'), '/',
      count(*) filter (where status = 'abgeloest'), '/',
      max(version_nr) filter (where status = 'beschlossen')
    )
    from public.abrechnung
   where weg_id = 'c0000000-0000-4000-8000-000000000063'::uuid
  ),
  '1/1/2',
  'nach dem Zweitbeschluss ist genau eine beschlossen, eine abgeloest, Version 2'
);

-- ============================================================================
-- gemischt und Agent-Guard
-- ============================================================================

insert into public.ausgabe (
  tenant_id, weg_id, betrag, wert_datum, empfaenger, kostenart, verteilungsschluessel_version_id
)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa63'::uuid,
  'c0000000-0000-4000-8000-000000000063'::uuid,
  3000.00, date '2091-02-01', 'Waermedienst', 'Heizung',
  'e3100000-0000-4000-8000-000000000063'::uuid
);

select throws_ok(
  $q$select public.erstelle_abrechnung(
       'c0000000-0000-4000-8000-000000000063'::uuid, 2091)$q$,
  '0A000',
  null,
  'ein gemischter Schluessel scheitert auch in der Abrechnung fail-closed'
);

select pg_catalog.set_config('app.actor_type', 'agent', true);

select throws_ok(
  $q$select public.erstelle_abrechnung(
       'c0000000-0000-4000-8000-000000000063'::uuid, 2092)$q$,
  '42501',
  null,
  'Agenten koennen keine Jahresabrechnung erstellen'
);

select pg_catalog.set_config('app.actor_type', 'user', true);

select * from finish();

rollback;
