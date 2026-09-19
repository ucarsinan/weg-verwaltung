-- WEG-Verwaltung pgTAP regression tests for 0061 Zahlungen und offene Posten.
--
-- Scope:
--   - Katalog: Tabellen, RLS/FORCE RLS, security_invoker der View, Agent-Guards
--   - der offene Posten rechnet: ohne Zahlung, voll bezahlt, teilbezahlt
--   - eine Zahlung ueber mehrere Monate
--   - fail-closed: Ueberzuordnung je Zahlung, Ueberzahlung je Sollstellung,
--     WEG-fremde Zuordnung, Aenderung einer bereits zugeordneten Zahlung
--   - Agent-Writes bleiben blockiert
--
-- Laeuft in einer Transaktion und rollt alle Fixtures zurueck. Fasst keinen
-- Remote-/Cloud-Zustand an.

begin;

select plan(17);

-- ============================================================================
-- Katalog
-- ============================================================================

select is(
  (
    select count(*)::int
    from unnest(array['public.zahlung', 'public.zahlungszuordnung']) as t(name)
    where to_regclass(t.name) is not null
  ),
  2,
  'zahlung und zahlungszuordnung existieren'
);

select isnt(
  to_regclass('public.offener_posten')::text,
  null,
  'die View offener_posten existiert'
);

select is(
  (
    select count(*)::int
    from pg_catalog.pg_class c
    where c.oid = any(array['public.zahlung'::regclass, 'public.zahlungszuordnung'::regclass])
      and c.relrowsecurity
  ),
  2,
  'beide Tabellen haben RLS aktiviert'
);

select is(
  (
    select count(*)::int
    from pg_catalog.pg_class c
    where c.oid = any(array['public.zahlung'::regclass, 'public.zahlungszuordnung'::regclass])
      and c.relforcerowsecurity
  ),
  2,
  'beide Tabellen haben FORCE RLS aktiviert'
);

select ok(
  (
    select pg_catalog.array_to_string(c.reloptions, ',') like '%security_invoker=on%'
    from pg_catalog.pg_class c
    where c.oid = 'public.offener_posten'::regclass
  ),
  'die View laeuft mit security_invoker und erbt damit die RLS der Basistabellen'
);

select is(
  (
    select count(*)::int
    from pg_catalog.pg_trigger
    where tgname in ('zahlung_block_agent_writes', 'zahlungszuordnung_block_agent_writes')
      and not tgisinternal
  ),
  2,
  'Agent-Write-Guards sind auf beiden Tabellen gesetzt'
);

-- ============================================================================
-- Fixtures
-- ============================================================================

insert into public.tenant (id, name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa61'::uuid, '0061 Tenant')
on conflict (id) do update
set name = excluded.name;

-- WEG 1: eine Einheit mit MEA 400/1000 => 12000 * 0,4 / 12 = 400,00 je Monat.
insert into public.weg (id, tenant_id, name)
values (
  'c0000000-0000-4000-8000-000000000061'::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa61'::uuid,
  '0061 WEG Eins'
);

insert into public.unit (id, tenant_id, weg_id, bezeichnung, mea_zaehler, mea_nenner)
values (
  'c1000000-0000-4000-8000-000000000061'::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa61'::uuid,
  'c0000000-0000-4000-8000-000000000061'::uuid,
  'Whg 1', 400, 1000
);

-- WEG 2 fuer den WEG-fremden Zuordnungsversuch.
insert into public.weg (id, tenant_id, name)
values (
  'd0000000-0000-4000-8000-000000000061'::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa61'::uuid,
  '0061 WEG Zwei'
);

insert into public.unit (id, tenant_id, weg_id, bezeichnung, mea_zaehler, mea_nenner)
values (
  'd1000000-0000-4000-8000-000000000061'::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa61'::uuid,
  'd0000000-0000-4000-8000-000000000061'::uuid,
  'Fremde Whg', 500, 1000
);

insert into public.wirtschaftsplan (id, tenant_id, weg_id, jahr, bezeichnung, gesamtkosten)
values
  ('a1000000-0000-4000-8000-000000000061'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa61'::uuid, 'c0000000-0000-4000-8000-000000000061'::uuid, 2060, 'Plan WEG Eins', 12000.00),
  ('b1000000-0000-4000-8000-000000000061'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa61'::uuid, 'd0000000-0000-4000-8000-000000000061'::uuid, 2060, 'Plan WEG Zwei', 12000.00);

select private._generate_sollstellungen_for_plan('a1000000-0000-4000-8000-000000000061'::uuid, 1);
select private._generate_sollstellungen_for_plan('b1000000-0000-4000-8000-000000000061'::uuid, 1);

insert into public.zahlung (id, tenant_id, weg_id, betrag, wert_datum, zahler_referenz)
values
  ('e1000000-0000-4000-8000-000000000061'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa61'::uuid, 'c0000000-0000-4000-8000-000000000061'::uuid, 400.00, date '2060-01-05', 'Hausgeld Januar Muster'),
  ('e2000000-0000-4000-8000-000000000061'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa61'::uuid, 'c0000000-0000-4000-8000-000000000061'::uuid, 150.00, date '2060-02-05', 'Teilzahlung Februar'),
  ('e3000000-0000-4000-8000-000000000061'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa61'::uuid, 'c0000000-0000-4000-8000-000000000061'::uuid, 800.00, date '2060-03-05', 'Maerz und April zusammen'),
  ('e4000000-0000-4000-8000-000000000061'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa61'::uuid, 'c0000000-0000-4000-8000-000000000061'::uuid, 400.00, date '2060-05-05', 'Noch nicht zugeordnet');

-- ============================================================================
-- Der offene Posten rechnet
-- ============================================================================

select is(
  (
    select op.offen_betrag
    from public.offener_posten op
    where op.sollstellung_id = (
      select s.id from public.sollstellung s
       where s.wirtschaftsplan_id = 'a1000000-0000-4000-8000-000000000061'::uuid
         and s.monat = 1
    )
  ),
  400.00::numeric(12, 2),
  'ohne Zahlung ist der offene Betrag der volle Sollbetrag'
);

-- Vollzahlung Januar.
insert into public.zahlungszuordnung (tenant_id, zahlung_id, sollstellung_id, betrag)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa61'::uuid,
  'e1000000-0000-4000-8000-000000000061'::uuid,
  (select s.id from public.sollstellung s
    where s.wirtschaftsplan_id = 'a1000000-0000-4000-8000-000000000061'::uuid and s.monat = 1),
  400.00
);

select is(
  (
    select op.offen_betrag
    from public.offener_posten op
    where op.sollstellung_id = (
      select s.id from public.sollstellung s
       where s.wirtschaftsplan_id = 'a1000000-0000-4000-8000-000000000061'::uuid
         and s.monat = 1
    )
  ),
  0.00::numeric(12, 2),
  'eine Vollzahlung schliesst den offenen Posten'
);

-- Teilzahlung Februar: 150 von 400.
insert into public.zahlungszuordnung (tenant_id, zahlung_id, sollstellung_id, betrag)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa61'::uuid,
  'e2000000-0000-4000-8000-000000000061'::uuid,
  (select s.id from public.sollstellung s
    where s.wirtschaftsplan_id = 'a1000000-0000-4000-8000-000000000061'::uuid and s.monat = 2),
  150.00
);

select is(
  (
    select op.offen_betrag
    from public.offener_posten op
    where op.sollstellung_id = (
      select s.id from public.sollstellung s
       where s.wirtschaftsplan_id = 'a1000000-0000-4000-8000-000000000061'::uuid
         and s.monat = 2
    )
  ),
  250.00::numeric(12, 2),
  'eine Teilzahlung laesst den Rest offen'
);

-- Eine Zahlung ueber zwei Monate: 800 = 400 Maerz + 400 April.
insert into public.zahlungszuordnung (tenant_id, zahlung_id, sollstellung_id, betrag)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa61'::uuid, 'e3000000-0000-4000-8000-000000000061'::uuid,
   (select s.id from public.sollstellung s
     where s.wirtschaftsplan_id = 'a1000000-0000-4000-8000-000000000061'::uuid and s.monat = 3), 400.00),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa61'::uuid, 'e3000000-0000-4000-8000-000000000061'::uuid,
   (select s.id from public.sollstellung s
     where s.wirtschaftsplan_id = 'a1000000-0000-4000-8000-000000000061'::uuid and s.monat = 4), 400.00);

select is(
  (
    select count(*)::int
    from public.offener_posten op
    where op.weg_id = 'c0000000-0000-4000-8000-000000000061'::uuid
      and op.monat in (3, 4)
      and op.offen_betrag = 0
  ),
  2,
  'eine Zahlung kann mehrere Monate abdecken'
);

-- ============================================================================
-- Fail-closed
-- ============================================================================

select throws_ok(
  $$insert into public.zahlungszuordnung (tenant_id, zahlung_id, sollstellung_id, betrag)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa61'::uuid,
            'e3000000-0000-4000-8000-000000000061'::uuid,
            (select s.id from public.sollstellung s
              where s.wirtschaftsplan_id = 'a1000000-0000-4000-8000-000000000061'::uuid and s.monat = 5),
            1.00)$$,
  '23514',
  null,
  'eine Zahlung kann nicht mehr zuordnen, als sie betraegt'
);

select throws_ok(
  $$insert into public.zahlungszuordnung (tenant_id, zahlung_id, sollstellung_id, betrag)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa61'::uuid,
            'e4000000-0000-4000-8000-000000000061'::uuid,
            (select s.id from public.sollstellung s
              where s.wirtschaftsplan_id = 'a1000000-0000-4000-8000-000000000061'::uuid and s.monat = 2),
            300.00)$$,
  '23514',
  null,
  'eine Sollstellung kann nicht ueberzahlt werden'
);

select throws_ok(
  $$insert into public.zahlungszuordnung (tenant_id, zahlung_id, sollstellung_id, betrag)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa61'::uuid,
            'e4000000-0000-4000-8000-000000000061'::uuid,
            (select s.id from public.sollstellung s
              where s.wirtschaftsplan_id = 'b1000000-0000-4000-8000-000000000061'::uuid and s.monat = 1),
            100.00)$$,
  '23514',
  null,
  'eine Zahlung kann keiner Sollstellung einer fremden WEG zugeordnet werden'
);

select throws_ok(
  $$update public.zahlung set betrag = 500.00
     where id = 'e1000000-0000-4000-8000-000000000061'::uuid$$,
  '23514',
  null,
  'eine zugeordnete Zahlung kann nicht mehr geaendert werden'
);

select throws_ok(
  $$delete from public.zahlung
     where id = 'e1000000-0000-4000-8000-000000000061'::uuid$$,
  '23514',
  null,
  'eine zugeordnete Zahlung kann nicht mehr geloescht werden'
);

select lives_ok(
  $$update public.zahlung set notiz = 'korrigiert'
     where id = 'e4000000-0000-4000-8000-000000000061'::uuid$$,
  'eine noch nicht zugeordnete Zahlung bleibt korrigierbar'
);

-- ============================================================================
-- Agent-Guard
-- ============================================================================

-- set_config mit is_local = true gilt fuer den Rest der Transaktion, also auch
-- innerhalb der Subtransaktion, die throws_ok aufspannt. Kein DO-Block noetig —
-- verschachtelte Dollar-Quotes waeren hier nicht parsebar.
select pg_catalog.set_config('app.actor_type', 'agent', true);

select throws_ok(
  $q$insert into public.zahlung (tenant_id, weg_id, betrag, wert_datum, zahler_referenz)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa61'::uuid,
             'c0000000-0000-4000-8000-000000000061'::uuid,
             99.00, date '2060-06-01', 'Agent')$q$,
  '42501',
  null,
  'Agenten koennen keine Zahlungen buchen'
);

select pg_catalog.set_config('app.actor_type', 'user', true);

select * from finish();

rollback;
