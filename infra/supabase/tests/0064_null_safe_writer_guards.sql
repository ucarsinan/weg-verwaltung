-- WEG-Verwaltung pgTAP regression tests for 0064 NULL-safe writer guards.
--
-- Scope:
--   - public.tg_wirtschaftsplan_lifecycle_guard() blockt jeden Statuswechsel
--     und jeden Lifecycle-Timestamp an den RPCs vorbei (42501), laesst den
--     RPC-Pfad mit gesetztem GUC aber durch.
--   - public.tg_sollstellung_enforce_insert_only() blockt jeden INSERT ohne
--     vollstaendigen Generator-Kontext (42501) und jedes UPDATE/DELETE.
--
-- Warum dieser Vertrag existiert:
--   Beide Guards lasen ihre GUC per `nullif(current_setting(..., true), '')`
--   und verglichen danach mit `<>`. Im Normalbetrieb ist die Einstellung gar
--   nicht gesetzt, der Vergleich ergibt also NULL statt TRUE und der Guard
--   greift nie — er faellt OFFEN statt geschlossen. 0048 hat das fuer den
--   Wirtschaftsplan behoben, 0064 fuer die Sollstellung. Die alten Vertraege
--   pruefen nur Privilegien und Trigger-Bindung und haetten beides durchgelassen,
--   deshalb faehrt dieser Vertrag die Guards ueber echtes DML.
--
--   Jeder throws_ok prueft zusaetzlich die Fehlermeldung: 42501 allein wuerde
--   auch feuern, wenn ein voellig anderer Guard den Write ablehnt, und ein
--   INSERT mit status='aktiv' laeuft sonst in denselben 23514 wie der
--   Timestamp-CHECK. Der Test soll belegen, welcher Zweig gegriffen hat.
--
-- Laeuft in einer Transaktion und rollt alle Fixtures zurueck.

begin;

select plan(17);

-- ============================================================================
-- Fixtures
-- ============================================================================

insert into public.tenant (id, name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa64'::uuid, '0064 Tenant')
on conflict (id) do update
set name = excluded.name;

-- Die Guards und der Audit-Emitter lesen public.tenant_id() aus dem JWT-Claim.
select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub', '11111111-1111-4111-8111-111111111164',
    'role', 'authenticated',
    'app_metadata', pg_catalog.jsonb_build_object(
      'tenant_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa64',
      'role', 'tenant_admin'
    )
  )::text,
  true
);

insert into public.weg (id, tenant_id, name)
values (
  'c0000000-0000-4000-8000-000000000064'::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa64'::uuid,
  '0064 WEG'
);

insert into public.unit (id, tenant_id, weg_id, bezeichnung, mea_zaehler, mea_nenner)
values (
  'c1000000-0000-4000-8000-000000000064'::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa64'::uuid,
  'c0000000-0000-4000-8000-000000000064'::uuid,
  'Whg A', 1, 1
);

-- P1 bleibt Entwurf und dient den Negativtests.
insert into public.wirtschaftsplan (id, tenant_id, weg_id, jahr, bezeichnung, gesamtkosten)
values (
  'a1000000-0000-4000-8000-000000000064'::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa64'::uuid,
  'c0000000-0000-4000-8000-000000000064'::uuid,
  2094, 'Plan 2094', 1200.00
);

-- P2 dient dem Positivtest, damit P1 ueber alle Negativtests Entwurf bleibt.
insert into public.wirtschaftsplan (id, tenant_id, weg_id, jahr, bezeichnung, gesamtkosten)
values (
  'a2000000-0000-4000-8000-000000000064'::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa64'::uuid,
  'c0000000-0000-4000-8000-000000000064'::uuid,
  2095, 'Plan 2095', 1200.00
);

-- ============================================================================
-- A. Wirtschaftsplan-Lebenszyklus: nur ueber die RPCs
-- ============================================================================

select throws_ok(
  $q$update public.wirtschaftsplan set status = 'aktiv'
      where id = 'a1000000-0000-4000-8000-000000000064'::uuid$q$,
  '42501',
  'Wirtschaftsplan lifecycle transitions must use lifecycle RPCs.',
  'ein direkter Wechsel auf aktiv an activate_wirtschaftsplan() vorbei wird abgelehnt'
);

select throws_ok(
  $q$update public.wirtschaftsplan set status = 'abgeloest'
      where id = 'a1000000-0000-4000-8000-000000000064'::uuid$q$,
  '42501',
  'Wirtschaftsplan lifecycle transitions must use lifecycle RPCs.',
  'ein direkter Wechsel auf abgeloest wird abgelehnt'
);

select throws_ok(
  $q$update public.wirtschaftsplan set status = 'archiviert'
      where id = 'a1000000-0000-4000-8000-000000000064'::uuid$q$,
  '42501',
  'Wirtschaftsplan lifecycle transitions must use lifecycle RPCs.',
  'ein direkter Wechsel auf archiviert an archive_wirtschaftsplan() vorbei wird abgelehnt'
);

-- Der Guard haengt nicht nur am Status: auch die Lifecycle-Timestamps allein
-- duerfen nicht direkt gesetzt werden.
select throws_ok(
  $q$update public.wirtschaftsplan set aktiviert_am = now()
      where id = 'a1000000-0000-4000-8000-000000000064'::uuid$q$,
  '42501',
  'Wirtschaftsplan lifecycle transitions must use lifecycle RPCs.',
  'ein direkt gesetzter Lifecycle-Timestamp wird abgelehnt'
);

-- status und aktiviert_am zusammen, damit der Timestamp-CHECK erfuellt waere
-- und wirklich nur der Guard den INSERT ablehnen kann.
select throws_ok(
  $q$insert into public.wirtschaftsplan
       (tenant_id, weg_id, jahr, bezeichnung, gesamtkosten, status, aktiviert_am)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa64'::uuid,
             'c0000000-0000-4000-8000-000000000064'::uuid,
             2096, 'Plan 2096', 1200.00, 'aktiv', now())$q$,
  '23514',
  'Wirtschaftsplan must be inserted as entwurf.',
  'ein Wirtschaftsplan laesst sich nicht direkt als aktiv anlegen'
);

select is(
  (select status from public.wirtschaftsplan
    where id = 'a1000000-0000-4000-8000-000000000064'::uuid),
  'entwurf',
  'nach allen abgelehnten Versuchen steht P1 unveraendert auf entwurf'
);

-- Gegenprobe: der Guard blockt nicht pauschal, der RPC-Kontext kommt durch.
select pg_catalog.set_config('app.wirtschaftsplan_lifecycle_manager', '1', true);

select lives_ok(
  $q$update public.wirtschaftsplan set status = 'aktiv', aktiviert_am = now()
      where id = 'a2000000-0000-4000-8000-000000000064'::uuid$q$,
  'mit gesetztem Lifecycle-Manager-Kontext geht der Statuswechsel durch'
);

select pg_catalog.set_config('app.wirtschaftsplan_lifecycle_manager', '', true);

-- ============================================================================
-- B. Sollstellungen: nur aus dem Generator-Kontext
-- ============================================================================

select throws_ok(
  $q$insert into public.sollstellung
       (tenant_id, wirtschaftsplan_id, unit_id, monat, betrag)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa64'::uuid,
             'a1000000-0000-4000-8000-000000000064'::uuid,
             'c1000000-0000-4000-8000-000000000064'::uuid, 1, 100.00)$q$,
  '42501',
  'Direct writes to Sollstellungen are not allowed.',
  'ein INSERT ohne Generator-Kontext wird abgelehnt'
);

select pg_catalog.set_config('app.sollstellung_writer', '', true);

select throws_ok(
  $q$insert into public.sollstellung
       (tenant_id, wirtschaftsplan_id, unit_id, monat, betrag)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa64'::uuid,
             'a1000000-0000-4000-8000-000000000064'::uuid,
             'c1000000-0000-4000-8000-000000000064'::uuid, 2, 100.00)$q$,
  '42501',
  'Direct writes to Sollstellungen are not allowed.',
  'ein leerer Writer-Kontext zaehlt nicht als Generator'
);

-- Writer gesetzt, Tenant-Kontext fehlt: der zweite Vergleich lief in dieselbe
-- NULL-Falle und liess tenant-fremde Zeilen durch.
select pg_catalog.set_config('app.sollstellung_writer', 'generator', true);

select throws_ok(
  $q$insert into public.sollstellung
       (tenant_id, wirtschaftsplan_id, unit_id, monat, betrag)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa64'::uuid,
             'a1000000-0000-4000-8000-000000000064'::uuid,
             'c1000000-0000-4000-8000-000000000064'::uuid, 3, 100.00)$q$,
  '42501',
  'Sollstellung generator tenant context mismatch.',
  'ein INSERT ohne Tenant-Kontext wird abgelehnt'
);

select pg_catalog.set_config(
  'app.sollstellung_tenant_id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb64', true);

select throws_ok(
  $q$insert into public.sollstellung
       (tenant_id, wirtschaftsplan_id, unit_id, monat, betrag)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa64'::uuid,
             'a1000000-0000-4000-8000-000000000064'::uuid,
             'c1000000-0000-4000-8000-000000000064'::uuid, 4, 100.00)$q$,
  '42501',
  'Sollstellung generator tenant context mismatch.',
  'ein INSERT mit fremdem Tenant-Kontext wird abgelehnt'
);

-- Gegenprobe: der vollstaendige Generator-Kontext kommt durch.
select pg_catalog.set_config(
  'app.sollstellung_tenant_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa64', true);

select lives_ok(
  $q$insert into public.sollstellung
       (tenant_id, wirtschaftsplan_id, unit_id, monat, betrag)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa64'::uuid,
             'a1000000-0000-4000-8000-000000000064'::uuid,
             'c1000000-0000-4000-8000-000000000064'::uuid, 5, 100.00)$q$,
  'mit vollstaendigem Generator-Kontext geht der INSERT durch'
);

-- UPDATE/DELETE bleiben auch im Generator-Kontext verboten.
select throws_ok(
  $q$update public.sollstellung set betrag = 1.00
      where wirtschaftsplan_id = 'a1000000-0000-4000-8000-000000000064'::uuid$q$,
  '42501',
  'Sollstellungen are historical records and cannot be updated or deleted.',
  'eine Sollstellung laesst sich auch im Generator-Kontext nicht aendern'
);

select throws_ok(
  $q$delete from public.sollstellung
      where wirtschaftsplan_id = 'a1000000-0000-4000-8000-000000000064'::uuid$q$,
  '42501',
  'Sollstellungen are historical records and cannot be updated or deleted.',
  'eine Sollstellung laesst sich auch im Generator-Kontext nicht loeschen'
);

select is(
  (select count(*)::int from public.sollstellung
    where wirtschaftsplan_id = 'a1000000-0000-4000-8000-000000000064'::uuid),
  1,
  'genau die eine legitime Sollstellung ist entstanden, keine der abgelehnten'
);

select pg_catalog.set_config('app.sollstellung_writer', '', true);
select pg_catalog.set_config('app.sollstellung_tenant_id', '', true);

-- ============================================================================
-- C. Drift-Anker gegen das Rueckfallmuster
-- ============================================================================
-- Rein struktureller Zusatz zu den Verhaltenstests oben: ein Cloud-Objekt, das
-- auf die alte Fassung zurueckdriftet, faellt hier auf, auch wenn es die
-- Verhaltenstests durch eine andere Schicht bestehen wuerde.

select ok(
  (select prosrc not like '%<> ''generator''%'
     from pg_catalog.pg_proc
    where oid = 'public.tg_sollstellung_enforce_insert_only()'::regprocedure),
  'der Sollstellungs-Guard vergleicht nicht mehr mit <> gegen generator'
);

select ok(
  (select prosrc not like '%<> ''1''%'
     from pg_catalog.pg_proc
    where oid = 'public.tg_wirtschaftsplan_lifecycle_guard()'::regprocedure),
  'der Wirtschaftsplan-Guard vergleicht nicht mehr mit <> gegen 1'
);

select * from finish();

rollback;
