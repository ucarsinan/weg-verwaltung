-- WEG-Verwaltung pgTAP regression tests for 0075: Sichtbarkeit je WEG.
--
-- Scope:
--   - weg_zugang traegt RLS, FORCE RLS und Policies (sonst faellt 0000)
--   - Sichtbarkeit laesst sich nur an Mitglieder des Mandanten vergeben
--   - ein Eigentuemer sieht seine WEG, ihre Einheiten, Eigentuemerschaften und
--     Beschluss-Sammlung
--   - derselbe Eigentuemer sieht die Nachbar-WEG DESSELBEN Mandanten nicht
--   - der tenant_admin desselben Mandanten sieht weiterhin beide
--   - feststellen_resolution weist einen Eigentuemer ab
--
-- Dies ist der erste Vertrag des Projekts mit einer `eigentuemer`-Fixture.
-- Ohne ihn bliebe die Policy ungeprueft: alle bestehenden Verträge setzen
-- `tenant_admin` oder `verwalter_mitarbeiter`.
--
-- Beweisstandard, uebernommen aus e2e/rls.spec.ts:160-162 und aus dem
-- Kommentarkopf von tests/0001_rls_negative.sql: "blockiert" ist nicht dasselbe
-- wie "gab es nie". Deshalb prueft jeder Negativfall gegen eine Zeile, die
-- nachweislich existiert — belegt durch den Admin-Block am Ende.
--
-- SELECT und UPDATE werfen unter RLS NICHT, sie liefern null Zeilen. Nur INSERT
-- wirft 42501. Ein naiver throws_ok-Test wuerde hier also gruen sein, ohne
-- etwas zu belegen.
--
-- Laeuft in einer Transaktion und rollt alle Fixtures zurueck.

begin;

select plan(16);

-- ============================================================================
-- Katalog
-- ============================================================================

select has_table('public', 'weg_zugang', 'die Zuordnung existiert');

select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
     from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'weg_zugang'),
  'weg_zugang hat RLS und FORCE RLS'
);

select has_function(
  'public', 'sichtbare_weg_ids', array[]::text[],
  'der Helfer existiert'
);

-- STABLE ist die Voraussetzung fuer das InitPlan-Caching in (select ...).
select is(
  (select p.provolatile
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'sichtbare_weg_ids'),
  's'::"char",
  'der Helfer ist STABLE, nicht VOLATILE'
);

-- SECURITY INVOKER: prosecdef = false. Ein Definer haette die Policy von
-- weg_zugang umgangen und die FORCE-RLS-Falle geoeffnet.
select is(
  (select p.prosecdef
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'sichtbare_weg_ids'),
  false,
  'der Helfer laeuft als SECURITY INVOKER'
);

-- ============================================================================
-- Fixtures: ein Mandant, zwei WEGs, ein Admin, ein Eigentuemer
-- ============================================================================

insert into public.tenant (id, name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa75'::uuid, '0075 Tenant')
on conflict (id) do update set name = excluded.name;

-- Beide Nutzer sind Mitglieder desselben Mandanten. Das ist der Kern: Es geht
-- NICHT um Mandantentrennung (die ist belegt), sondern um Rollentrennung
-- innerhalb eines Mandanten.
insert into public.tenant_member (tenant_id, user_id, role)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa75'::uuid,
   '11111111-1111-4111-8111-111111111175'::uuid, 'tenant_admin'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa75'::uuid,
   '22222222-2222-4222-8222-222222222275'::uuid, 'eigentuemer');

insert into public.weg (id, tenant_id, name)
values
  ('c0000000-0000-4000-8000-000000000075'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa75'::uuid, '0075 Meine WEG'),
  ('d0000000-0000-4000-8000-000000000075'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa75'::uuid, '0075 Nachbar-WEG');

insert into public.unit (id, tenant_id, weg_id, bezeichnung, mea_zaehler, mea_nenner)
values
  ('c1000000-0000-4000-8000-000000000075'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa75'::uuid,
   'c0000000-0000-4000-8000-000000000075'::uuid, 'Meine Whg', 1000, 1000),
  ('d1000000-0000-4000-8000-000000000075'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa75'::uuid,
   'd0000000-0000-4000-8000-000000000075'::uuid, 'Fremde Whg', 1000, 1000);

insert into public.person (id, tenant_id, vorname, nachname)
values
  ('e1000000-0000-4000-8000-000000000075'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa75'::uuid, 'Mein', 'Eigentuemer'),
  ('e2000000-0000-4000-8000-000000000075'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa75'::uuid, 'Fremder', 'Eigentuemer');

insert into public.ownership (tenant_id, weg_id, unit_id, person_id, von)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa75'::uuid,
   'c0000000-0000-4000-8000-000000000075'::uuid,
   'c1000000-0000-4000-8000-000000000075'::uuid,
   'e1000000-0000-4000-8000-000000000075'::uuid, '2075-01-01'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa75'::uuid,
   'd0000000-0000-4000-8000-000000000075'::uuid,
   'd1000000-0000-4000-8000-000000000075'::uuid,
   'e2000000-0000-4000-8000-000000000075'::uuid, '2075-01-01');

insert into public.beschluss_sammlung_entry
  (tenant_id, weg_id, beschluss_text, datum, typ, erstellt_durch)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa75'::uuid,
   'c0000000-0000-4000-8000-000000000075'::uuid,
   'Beschluss der eigenen WEG.', '2075-02-01', 'positiv_beschluss',
   '11111111-1111-4111-8111-111111111175'::uuid),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa75'::uuid,
   'd0000000-0000-4000-8000-000000000075'::uuid,
   'Beschluss der Nachbar-WEG.', '2075-02-01', 'positiv_beschluss',
   '11111111-1111-4111-8111-111111111175'::uuid);

-- Zugang NUR fuer die eigene WEG.
insert into public.weg_zugang (tenant_id, user_id, weg_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa75'::uuid,
        '22222222-2222-4222-8222-222222222275'::uuid,
        'c0000000-0000-4000-8000-000000000075'::uuid);

-- ============================================================================
-- Der Eigentuemer
-- ============================================================================

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222275",'
  '"role":"authenticated",'
  '"app_metadata":{"tenant_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa75",'
  '"role":"eigentuemer"}}',
  true
);

-- Ohne den Rollenwechsel bleibt die Session Tabelleneigentümer mit BYPASSRLS,
-- fuer den FORCE ROW LEVEL SECURITY wirkungslos ist — der Vertrag waere still
-- gruen (Muster aus 0069:65-67).
set local role authenticated;

select is(
  (select pg_catalog.array_agg(w.name order by w.name)
     from public.weg w
    where w.tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa75'::uuid),
  array['0075 Meine WEG'],
  'der Eigentuemer sieht genau die WEG, fuer die er Zugang hat'
);

select is(
  (select pg_catalog.count(*)
     from public.unit u
    where u.weg_id = 'd0000000-0000-4000-8000-000000000075'::uuid),
  0::bigint,
  'die Einheiten der Nachbar-WEG bleiben unsichtbar'
);

select is(
  (select pg_catalog.count(*)
     from public.unit u
    where u.weg_id = 'c0000000-0000-4000-8000-000000000075'::uuid),
  1::bigint,
  'die eigene Einheit bleibt sichtbar'
);

select is(
  (select pg_catalog.count(*)
     from public.ownership o
    where o.weg_id = 'd0000000-0000-4000-8000-000000000075'::uuid),
  0::bigint,
  'die Eigentuemerschaften der Nachbar-WEG bleiben unsichtbar'
);

select is(
  (select pg_catalog.array_agg(b.beschluss_text)
     from public.beschluss_sammlung_entry b),
  array['Beschluss der eigenen WEG.'],
  'die Beschluss-Sammlung zeigt nur die eigene WEG'
);

-- Der Helfer selbst, gegengeprueft.
select is(
  (select pg_catalog.count(*) from public.sichtbare_weg_ids()),
  1::bigint,
  'sichtbare_weg_ids liefert genau eine WEG'
);

-- Der Riegel aus 0075. Er steht vor jedem Lookup, deshalb genuegt eine
-- beliebige ID: Wer die Rolle traegt, kommt gar nicht bis zur Resolution.
select throws_ok(
  $q$select public.feststellen_resolution(
       '99999999-9999-4999-8999-999999999975'::uuid)$q$,
  '42501',
  null,
  'ein Eigentuemer kann keinen Beschluss feststellen'
);

-- ============================================================================
-- Der Verwalter desselben Mandanten — die Haelfte, die vor Selbstaussperrung
-- schuetzt
-- ============================================================================

reset role;

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111175",'
  '"role":"authenticated",'
  '"app_metadata":{"tenant_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa75",'
  '"role":"tenant_admin"}}',
  true
);

set local role authenticated;

-- Beweist, dass die Zeilen oben wirklich existieren: Der Negativbefund des
-- Eigentuemers ist damit "blockiert", nicht "gab es nie".
select is(
  (select pg_catalog.count(*)
     from public.weg w
    where w.tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa75'::uuid),
  2::bigint,
  'der Verwalter sieht weiterhin BEIDE WEGs'
);

select is(
  (select pg_catalog.count(*)
     from public.beschluss_sammlung_entry b),
  2::bigint,
  'der Verwalter sieht weiterhin beide Beschluesse'
);

-- Der Verwalter hat selbst keinen weg_zugang-Eintrag — er braucht keinen.
select is(
  (select pg_catalog.count(*) from public.sichtbare_weg_ids()),
  0::bigint,
  'der Verwalter hat keinen Zugangseintrag und braucht keinen'
);

-- Der Kern der Konstruktion: Sichtbarkeit nur an Mitglieder. Ohne den
-- Fremdschluessel auf tenant_member koennte ein Admin Zugang an eine beliebige
-- fremde UUID vergeben — genau die Luecke, die person.user_id heute offen hat.
select throws_ok(
  $q$insert into public.weg_zugang (tenant_id, user_id, weg_id)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa75'::uuid,
             '88888888-8888-4888-8888-888888888875'::uuid,
             'c0000000-0000-4000-8000-000000000075'::uuid)$q$,
  '23503',
  null,
  'Zugang laesst sich nicht an einen Nicht-Mitglied vergeben'
);

reset role;

select * from finish();

rollback;
