-- WEG-Verwaltung pgTAP regression tests for 0060 Wirtschaftsplan position
-- allocation.
--
-- Data-driven: builds a tenant/WEG/unit fixture directly (as the connecting
-- superuser, which bypasses RLS same as 0057's fixture inserts), then drives
-- activate_wirtschaftsplan() as an authenticated tenant_admin to verify the
-- generated Sollstellung amounts.

begin;

select plan(11);

-- ============================================================================
-- Catalog contract for the new internal helper
-- ============================================================================

select has_function(
  'private',
  '_verteilungsschluessel_version_unit_shares',
  array['uuid', 'uuid', 'uuid', 'date'],
  'per-unit allocation share helper exists'
);

select ok(
  coalesce((
    select p.prosecdef
      and exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) as cfg(value)
        where cfg.value in ('search_path=', 'search_path=""')
      )
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = '_verteilungsschluessel_version_unit_shares'
  ), false)
  and not has_function_privilege(
    'authenticated',
    'private._verteilungsschluessel_version_unit_shares(uuid,uuid,uuid,date)',
    'execute'
  ),
  'allocation share helper is SECURITY DEFINER, pins empty search_path, and stays internal-only'
);

-- ============================================================================
-- Fixture: one tenant, one WEG, three units with unequal MEA shares.
-- ============================================================================

insert into public.tenant (id, name) values
  ('f0600000-0000-4000-8000-000000000001'::uuid, 'Test Tenant 0060');

insert into public.weg (id, tenant_id, name) values
  ('f0600000-0000-4000-8000-000000000002'::uuid, 'f0600000-0000-4000-8000-000000000001'::uuid, 'WEG Test 0060');

insert into public.unit (id, tenant_id, weg_id, bezeichnung, mea_zaehler, mea_nenner) values
  ('f0600000-0000-4000-8000-000000000011'::uuid, 'f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000002'::uuid, 'Whg 1', 500, 1000),
  ('f0600000-0000-4000-8000-000000000012'::uuid, 'f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000002'::uuid, 'Whg 2', 300, 1000),
  ('f0600000-0000-4000-8000-000000000013'::uuid, 'f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000002'::uuid, 'Whg 3', 200, 1000);

-- ============================================================================
-- Regression: a plan with zero positions keeps the exact pre-0060 MEA path.
-- ============================================================================

insert into public.wirtschaftsplan (id, tenant_id, weg_id, jahr, bezeichnung, gesamtkosten) values
  ('f0600000-0000-4000-8000-000000000021'::uuid, 'f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000002'::uuid, 2030, 'WP 2030 (MEA-only)', 12000.00);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'f0600000-0000-4000-8000-0000000000f1',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'tenant_id', 'f0600000-0000-4000-8000-000000000001',
      'role', 'tenant_admin'
    )
  )::text,
  true
);

select lives_ok(
  $$select public.activate_wirtschaftsplan('f0600000-0000-4000-8000-000000000021'::uuid)$$,
  'activating a plan without positions succeeds unchanged'
);

reset role;

select is(
  (
    select betrag from public.sollstellung
    where wirtschaftsplan_id = 'f0600000-0000-4000-8000-000000000021'::uuid
      and unit_id = 'f0600000-0000-4000-8000-000000000011'::uuid
      and monat = 1
  ),
  500.00::numeric(12, 2),
  'MEA-only fallback keeps the original per-unit monthly amount (Whg 1)'
);

-- ============================================================================
-- Mixed-key plan: three positions, three different key types, summed per
-- unit. Verteilungsschlüssel: MEA, Gleichverteilung (einheit), Fläche.
-- ============================================================================

insert into public.verteilungsschluessel (id, tenant_id, weg_id, name) values
  ('f0600000-0000-4000-8000-000000000031'::uuid, 'f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000002'::uuid, 'MEA'),
  ('f0600000-0000-4000-8000-000000000032'::uuid, 'f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000002'::uuid, 'Gleichverteilung'),
  ('f0600000-0000-4000-8000-000000000033'::uuid, 'f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000002'::uuid, 'Fläche');

insert into public.verteilungsschluessel_version (id, tenant_id, verteilungsschluessel_id, typ, quelle, gueltig_ab) values
  ('f0600000-0000-4000-8000-000000000041'::uuid, 'f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000031'::uuid, 'mea', 'gesetz', '2020-01-01'),
  ('f0600000-0000-4000-8000-000000000042'::uuid, 'f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000032'::uuid, 'einheit', 'gemeinschaftsordnung', '2020-01-01'),
  ('f0600000-0000-4000-8000-000000000043'::uuid, 'f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000033'::uuid, 'flaeche', 'teilungserklaerung', '2020-01-01');

insert into public.verteilungsschluessel_basiswert (tenant_id, verteilungsschluessel_version_id, unit_id, wert, einheit, gueltig_ab) values
  ('f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000043'::uuid, 'f0600000-0000-4000-8000-000000000011'::uuid, 50, 'm2', '2020-01-01'),
  ('f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000043'::uuid, 'f0600000-0000-4000-8000-000000000012'::uuid, 30, 'm2', '2020-01-01'),
  ('f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000043'::uuid, 'f0600000-0000-4000-8000-000000000013'::uuid, 20, 'm2', '2020-01-01');

insert into public.wirtschaftsplan (id, tenant_id, weg_id, jahr, bezeichnung, gesamtkosten) values
  ('f0600000-0000-4000-8000-000000000022'::uuid, 'f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000002'::uuid, 2031, 'WP 2031 (mixed-key)', 10000.00);

insert into public.wirtschaftsplan_position (tenant_id, wirtschaftsplan_id, position, kostenart, jahresbetrag, verteilungsschluessel_version_id) values
  ('f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000022'::uuid, 1, 'Verwaltung', 6000.00, 'f0600000-0000-4000-8000-000000000041'::uuid),
  ('f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000022'::uuid, 2, 'Hausmeister', 3000.00, 'f0600000-0000-4000-8000-000000000042'::uuid),
  ('f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000022'::uuid, 3, 'Gartenpflege', 1000.00, 'f0600000-0000-4000-8000-000000000043'::uuid);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'f0600000-0000-4000-8000-0000000000f1',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'tenant_id', 'f0600000-0000-4000-8000-000000000001',
      'role', 'tenant_admin'
    )
  )::text,
  true
);

select lives_ok(
  $$select public.activate_wirtschaftsplan('f0600000-0000-4000-8000-000000000022'::uuid)$$,
  'activating a mixed-key plan (mea + einheit + flaeche positions) succeeds'
);

reset role;

select is(
  (
    select betrag from public.sollstellung
    where wirtschaftsplan_id = 'f0600000-0000-4000-8000-000000000022'::uuid
      and unit_id = 'f0600000-0000-4000-8000-000000000011'::uuid
      and monat = 1
  ),
  375.00::numeric(12, 2),
  'mixed-key allocation sums correctly per unit (Whg 1: 50% MEA + 1/3 + 50% Fläche)'
);

select is(
  (
    select betrag from public.sollstellung
    where wirtschaftsplan_id = 'f0600000-0000-4000-8000-000000000022'::uuid
      and unit_id = 'f0600000-0000-4000-8000-000000000012'::uuid
      and monat = 1
  ),
  258.33::numeric(12, 2),
  'mixed-key allocation sums correctly per unit (Whg 2: 30% MEA + 1/3 + 30% Fläche)'
);

select is(
  (
    select betrag from public.sollstellung
    where wirtschaftsplan_id = 'f0600000-0000-4000-8000-000000000022'::uuid
      and unit_id = 'f0600000-0000-4000-8000-000000000013'::uuid
      and monat = 1
  ),
  200.00::numeric(12, 2),
  'mixed-key allocation sums correctly per unit (Whg 3: 20% MEA + 1/3 + 20% Fläche)'
);

-- ============================================================================
-- Fail-closed: a Fläche-keyed position where one unit has no basis value.
-- ============================================================================

insert into public.verteilungsschluessel (id, tenant_id, weg_id, name) values
  ('f0600000-0000-4000-8000-000000000034'::uuid, 'f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000002'::uuid, 'Fläche unvollständig');

insert into public.verteilungsschluessel_version (id, tenant_id, verteilungsschluessel_id, typ, quelle, gueltig_ab) values
  ('f0600000-0000-4000-8000-000000000044'::uuid, 'f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000034'::uuid, 'flaeche', 'manuell', '2020-01-01');

-- Only two of three units get a basis value.
insert into public.verteilungsschluessel_basiswert (tenant_id, verteilungsschluessel_version_id, unit_id, wert, einheit, gueltig_ab) values
  ('f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000044'::uuid, 'f0600000-0000-4000-8000-000000000011'::uuid, 50, 'm2', '2020-01-01'),
  ('f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000044'::uuid, 'f0600000-0000-4000-8000-000000000012'::uuid, 30, 'm2', '2020-01-01');

insert into public.wirtschaftsplan (id, tenant_id, weg_id, jahr, bezeichnung, gesamtkosten) values
  ('f0600000-0000-4000-8000-000000000023'::uuid, 'f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000002'::uuid, 2032, 'WP 2032 (unvollstaendige Basiswerte)', 1000.00);

insert into public.wirtschaftsplan_position (tenant_id, wirtschaftsplan_id, position, kostenart, jahresbetrag, verteilungsschluessel_version_id) values
  ('f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000023'::uuid, 1, 'Gartenpflege', 1000.00, 'f0600000-0000-4000-8000-000000000044'::uuid);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'f0600000-0000-4000-8000-0000000000f1',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'tenant_id', 'f0600000-0000-4000-8000-000000000001',
      'role', 'tenant_admin'
    )
  )::text,
  true
);

select throws_ok(
  $$select public.activate_wirtschaftsplan('f0600000-0000-4000-8000-000000000023'::uuid)$$,
  '23514',
  'activation fails closed when a unit has no basis value for a value-based key'
);

reset role;

-- ============================================================================
-- Fail-closed: typ = 'gemischt' is not yet supported by the generator.
-- ============================================================================

insert into public.verteilungsschluessel (id, tenant_id, weg_id, name) values
  ('f0600000-0000-4000-8000-000000000035'::uuid, 'f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000002'::uuid, 'Heizkosten');

insert into public.verteilungsschluessel_version (id, tenant_id, verteilungsschluessel_id, typ, quelle, gueltig_ab, parameter) values
  (
    'f0600000-0000-4000-8000-000000000045'::uuid,
    'f0600000-0000-4000-8000-000000000001'::uuid,
    'f0600000-0000-4000-8000-000000000035'::uuid,
    'gemischt',
    'gesetz',
    '2020-01-01',
    '{"parts":[{"typ":"verbrauch","gewicht":70},{"typ":"flaeche","gewicht":30}]}'::jsonb
  );

insert into public.wirtschaftsplan (id, tenant_id, weg_id, jahr, bezeichnung, gesamtkosten) values
  ('f0600000-0000-4000-8000-000000000024'::uuid, 'f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000002'::uuid, 2033, 'WP 2033 (Heizkosten gemischt)', 1000.00);

insert into public.wirtschaftsplan_position (tenant_id, wirtschaftsplan_id, position, kostenart, jahresbetrag, verteilungsschluessel_version_id) values
  ('f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000024'::uuid, 1, 'Heizkosten', 1000.00, 'f0600000-0000-4000-8000-000000000045'::uuid);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'f0600000-0000-4000-8000-0000000000f1',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'tenant_id', 'f0600000-0000-4000-8000-000000000001',
      'role', 'tenant_admin'
    )
  )::text,
  true
);

select throws_ok(
  $$select public.activate_wirtschaftsplan('f0600000-0000-4000-8000-000000000024'::uuid)$$,
  '0A000',
  'activation fails closed for typ=gemischt instead of guessing a split'
);

reset role;

-- ============================================================================
-- Agent guard still fires for a plan that has positions.
-- ============================================================================

insert into public.wirtschaftsplan (id, tenant_id, weg_id, jahr, bezeichnung, gesamtkosten) values
  ('f0600000-0000-4000-8000-000000000025'::uuid, 'f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000002'::uuid, 2034, 'WP 2034 (agent guard)', 1200.00);

insert into public.wirtschaftsplan_position (tenant_id, wirtschaftsplan_id, position, kostenart, jahresbetrag, verteilungsschluessel_version_id) values
  ('f0600000-0000-4000-8000-000000000001'::uuid, 'f0600000-0000-4000-8000-000000000025'::uuid, 1, 'Verwaltung', 1200.00, 'f0600000-0000-4000-8000-000000000041'::uuid);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', 'f0600000-0000-4000-8000-0000000000f1',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'tenant_id', 'f0600000-0000-4000-8000-000000000001',
      'role', 'tenant_admin'
    )
  )::text,
  true
);
select set_config('app.actor_type', 'agent', true);

select throws_ok(
  $$select public.activate_wirtschaftsplan('f0600000-0000-4000-8000-000000000025'::uuid)$$,
  '42501',
  'agents still cannot activate a Wirtschaftsplan that has positions'
);

reset role;

select * from finish();

rollback;
