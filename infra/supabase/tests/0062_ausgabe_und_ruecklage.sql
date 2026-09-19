-- WEG-Verwaltung pgTAP regression tests for 0062 Ausgaben und Erhaltungsruecklage.
--
-- Scope:
--   - Katalog: Tabellen, RLS/FORCE RLS, security_invoker, Agent-Guards,
--     Eindeutigkeit des Eroeffnungsbestands
--   - die vier Groessen aus § 28 Abs. 2 rechnen ueber mehrere Jahre
--   - der Anfangsbestand eines Jahres ist der Endbestand des Vorjahres
--   - fail-closed: Entnahme ueber den Bestand, Entnahme die erst durch eine
--     SPAETERE Zufuehrung gedeckt waere, zweiter Eroeffnungsbestand,
--     WEG-fremder Verteilungsschluessel, WEG-fremde verknuepfte Ausgabe
--   - Agent-Writes bleiben blockiert
--
-- Laeuft in einer Transaktion und rollt alle Fixtures zurueck.

begin;

select plan(17);

-- ============================================================================
-- Katalog
-- ============================================================================

select is(
  (
    select count(*)::int
    from unnest(array['public.ausgabe', 'public.ruecklage_bewegung']) as t(name)
    where to_regclass(t.name) is not null
  ),
  2,
  'ausgabe und ruecklage_bewegung existieren'
);

select is(
  (
    select count(*)::int
    from pg_catalog.pg_class c
    where c.oid = any(array['public.ausgabe'::regclass, 'public.ruecklage_bewegung'::regclass])
      and c.relrowsecurity
      and c.relforcerowsecurity
  ),
  2,
  'beide Tabellen haben RLS und FORCE RLS'
);

select ok(
  (
    select pg_catalog.array_to_string(c.reloptions, ',') like '%security_invoker=on%'
    from pg_catalog.pg_class c
    where c.oid = 'public.ruecklage_entwicklung'::regclass
  ),
  'die Entwicklungs-View laeuft mit security_invoker'
);

select is(
  (
    select count(*)::int
    from pg_catalog.pg_trigger
    where tgname in ('ausgabe_block_agent_writes', 'ruecklage_bewegung_block_agent_writes')
      and not tgisinternal
  ),
  2,
  'Agent-Write-Guards sind auf beiden Tabellen gesetzt'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'ruecklage_bewegung_eine_eroeffnung_idx'
  ),
  'ein partieller Unique-Index sichert genau einen Eroeffnungsbestand je WEG'
);

-- ============================================================================
-- Fixtures
-- ============================================================================

insert into public.tenant (id, name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa62'::uuid, '0062 Tenant')
on conflict (id) do update
set name = excluded.name;

insert into public.weg (id, tenant_id, name)
values
  ('c0000000-0000-4000-8000-000000000062'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa62'::uuid, '0062 WEG Eins'),
  ('d0000000-0000-4000-8000-000000000062'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa62'::uuid, '0062 WEG Zwei');

insert into public.unit (id, tenant_id, weg_id, bezeichnung, mea_zaehler, mea_nenner)
values
  ('c1000000-0000-4000-8000-000000000062'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa62'::uuid, 'c0000000-0000-4000-8000-000000000062'::uuid, 'Whg 1', 1000, 1000),
  ('d1000000-0000-4000-8000-000000000062'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa62'::uuid, 'd0000000-0000-4000-8000-000000000062'::uuid, 'Fremde Whg', 1000, 1000);

insert into public.verteilungsschluessel (id, tenant_id, weg_id, name)
values
  ('e1000000-0000-4000-8000-000000000062'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa62'::uuid, 'c0000000-0000-4000-8000-000000000062'::uuid, 'MEA'),
  ('f1000000-0000-4000-8000-000000000062'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa62'::uuid, 'd0000000-0000-4000-8000-000000000062'::uuid, 'MEA fremd');

insert into public.verteilungsschluessel_version (
  id, tenant_id, verteilungsschluessel_id, typ, quelle, gueltig_ab
)
values
  ('e1100000-0000-4000-8000-000000000062'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa62'::uuid, 'e1000000-0000-4000-8000-000000000062'::uuid, 'mea', 'gesetz', date '2000-01-01'),
  ('f1100000-0000-4000-8000-000000000062'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa62'::uuid, 'f1000000-0000-4000-8000-000000000062'::uuid, 'mea', 'gesetz', date '2000-01-01');

insert into public.ausgabe (
  id, tenant_id, weg_id, betrag, wert_datum, empfaenger, kostenart, verteilungsschluessel_version_id
)
values
  ('a1000000-0000-4000-8000-000000000062'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa62'::uuid, 'c0000000-0000-4000-8000-000000000062'::uuid, 500.00, date '2060-09-01', 'Dachdecker Meier', 'Instandhaltung', 'e1100000-0000-4000-8000-000000000062'::uuid),
  ('b1000000-0000-4000-8000-000000000062'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa62'::uuid, 'd0000000-0000-4000-8000-000000000062'::uuid, 100.00, date '2060-09-01', 'Fremd GmbH', 'Instandhaltung', 'f1100000-0000-4000-8000-000000000062'::uuid);

-- Ruecklage WEG 1: Eroeffnung 10.000; 2060 +2.000 / -500; 2061 +3.000.
insert into public.ruecklage_bewegung (tenant_id, weg_id, datum, betrag, richtung, ausgabe_id)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa62'::uuid, 'c0000000-0000-4000-8000-000000000062'::uuid, date '2060-01-01', 10000.00, 'anfangsbestand', null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa62'::uuid, 'c0000000-0000-4000-8000-000000000062'::uuid, date '2060-06-01', 2000.00, 'zufuehrung', null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa62'::uuid, 'c0000000-0000-4000-8000-000000000062'::uuid, date '2060-09-01', 500.00, 'entnahme', 'a1000000-0000-4000-8000-000000000062'::uuid),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa62'::uuid, 'c0000000-0000-4000-8000-000000000062'::uuid, date '2061-06-01', 3000.00, 'zufuehrung', null);

-- ============================================================================
-- Die vier Groessen aus § 28 Abs. 2
-- ============================================================================

select is(
  (
    select e.anfangsbestand
    from public.ruecklage_entwicklung e
    where e.weg_id = 'c0000000-0000-4000-8000-000000000062'::uuid and e.jahr = 2060
  ),
  10000.00::numeric(12, 2),
  'der Eroeffnungsbestand steht im Anfangsbestand seines eigenen Jahres, nicht in den Zufuehrungen'
);

select is(
  (
    select e.zufuehrungen
    from public.ruecklage_entwicklung e
    where e.weg_id = 'c0000000-0000-4000-8000-000000000062'::uuid and e.jahr = 2060
  ),
  2000.00::numeric(12, 2),
  'Zufuehrungen des Jahres werden getrennt ausgewiesen'
);

select is(
  (
    select e.entnahmen
    from public.ruecklage_entwicklung e
    where e.weg_id = 'c0000000-0000-4000-8000-000000000062'::uuid and e.jahr = 2060
  ),
  500.00::numeric(12, 2),
  'Entnahmen des Jahres werden getrennt ausgewiesen'
);

select is(
  (
    select e.endbestand
    from public.ruecklage_entwicklung e
    where e.weg_id = 'c0000000-0000-4000-8000-000000000062'::uuid and e.jahr = 2060
  ),
  11500.00::numeric(12, 2),
  'Endbestand 2060 = 10.000 + 2.000 - 500'
);

select is(
  (
    select e.anfangsbestand
    from public.ruecklage_entwicklung e
    where e.weg_id = 'c0000000-0000-4000-8000-000000000062'::uuid and e.jahr = 2061
  ),
  11500.00::numeric(12, 2),
  'der Anfangsbestand eines Jahres ist der Endbestand des Vorjahres'
);

select is(
  (
    select e.endbestand
    from public.ruecklage_entwicklung e
    where e.weg_id = 'c0000000-0000-4000-8000-000000000062'::uuid and e.jahr = 2061
  ),
  14500.00::numeric(12, 2),
  'Endbestand 2061 = 11.500 + 3.000'
);

-- ============================================================================
-- Fail-closed
-- ============================================================================

select throws_ok(
  $q$insert into public.ruecklage_bewegung (tenant_id, weg_id, datum, betrag, richtung)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa62'::uuid,
             'c0000000-0000-4000-8000-000000000062'::uuid,
             date '2061-07-01', 20000.00, 'entnahme')$q$,
  '23514',
  null,
  'eine Entnahme ueber den Bestand hinaus wird abgelehnt'
);

-- Der Gesamtbestand betraegt am Ende 14.500, zum 01.02.2060 aber erst 10.000.
-- Eine Entnahme von 11.000 zu diesem Stichtag waere nur durch spaetere
-- Zufuehrungen gedeckt — genau das darf nicht durchgehen.
select throws_ok(
  $q$insert into public.ruecklage_bewegung (tenant_id, weg_id, datum, betrag, richtung)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa62'::uuid,
             'c0000000-0000-4000-8000-000000000062'::uuid,
             date '2060-02-01', 11000.00, 'entnahme')$q$,
  '23514',
  null,
  'eine Entnahme darf nicht aus Mitteln gedeckt werden, die erst spaeter zugefuehrt wurden'
);

select throws_ok(
  $q$insert into public.ruecklage_bewegung (tenant_id, weg_id, datum, betrag, richtung)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa62'::uuid,
             'c0000000-0000-4000-8000-000000000062'::uuid,
             date '2062-01-01', 1.00, 'anfangsbestand')$q$,
  '23505',
  null,
  'ein zweiter Eroeffnungsbestand je WEG wird abgelehnt'
);

select throws_ok(
  $q$insert into public.ausgabe (tenant_id, weg_id, betrag, wert_datum, empfaenger, kostenart, verteilungsschluessel_version_id)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa62'::uuid,
             'c0000000-0000-4000-8000-000000000062'::uuid,
             99.00, date '2060-03-01', 'Irgendwer', 'Reinigung',
             'f1100000-0000-4000-8000-000000000062'::uuid)$q$,
  '23514',
  null,
  'eine Ausgabe kann keinen Verteilungsschluessel einer fremden WEG verwenden'
);

select throws_ok(
  $q$insert into public.ruecklage_bewegung (tenant_id, weg_id, datum, betrag, richtung, ausgabe_id)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa62'::uuid,
             'c0000000-0000-4000-8000-000000000062'::uuid,
             date '2061-08-01', 50.00, 'entnahme',
             'b1000000-0000-4000-8000-000000000062'::uuid)$q$,
  '23514',
  null,
  'eine Ruecklagen-Bewegung kann nicht auf eine Ausgabe einer fremden WEG verweisen'
);

-- ============================================================================
-- Agent-Guard
-- ============================================================================

select pg_catalog.set_config('app.actor_type', 'agent', true);

select throws_ok(
  $q$insert into public.ausgabe (tenant_id, weg_id, betrag, wert_datum, empfaenger, kostenart, verteilungsschluessel_version_id)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa62'::uuid,
             'c0000000-0000-4000-8000-000000000062'::uuid,
             10.00, date '2060-04-01', 'Agent', 'Reinigung',
             'e1100000-0000-4000-8000-000000000062'::uuid)$q$,
  '42501',
  null,
  'Agenten koennen keine Ausgaben buchen'
);

select pg_catalog.set_config('app.actor_type', 'user', true);

select * from finish();

rollback;
