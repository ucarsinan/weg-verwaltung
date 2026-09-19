-- WEG-Verwaltung pgTAP regression tests for 0060 Wirtschaftsplan position allocation.
--
-- Scope:
--   - the no-positions branch still produces the pre-0060 MEA/gesamtkosten result
--   - each supported allocation key type (mea, einheit, flaeche) allocates as specified
--   - mea shares are normalized by the WEG total, so a position is always fully allocated
--   - several positions with different keys sum per unit
--   - typ = 'gemischt' fails closed with 0A000, missing basis values with 23514
--   - partial-year plans keep the monthly rate and only post fewer months
--   - the generator stays idempotent and outside the public RPC surface
--
-- Runs in one transaction and rolls back all fixture rows. Does not touch any
-- remote/cloud project state by itself.

begin;

select plan(18);

-- ============================================================================
-- Catalogue contract
-- ============================================================================

select has_function(
  'private',
  '_verteilungsschluessel_version_unit_shares',
  array['uuid', 'uuid', 'uuid', 'date'],
  'allocation share helper exists'
);

select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'private._verteilungsschluessel_version_unit_shares(uuid, uuid, uuid, date)',
    'execute'
  ),
  'allocation share helper is not executable by authenticated'
);

-- ============================================================================
-- Runtime fixtures
-- ============================================================================

insert into public.tenant (id, name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, '0060 Tenant')
on conflict (id) do update
set name = excluded.name;

-- WEG 1: MEA add up to exactly 1 (400/1000 + 600/1000).
insert into public.weg (id, tenant_id, name)
values (
  'c0000000-0000-4000-8000-000000000060'::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid,
  '0060 WEG Eins'
);

insert into public.unit (id, tenant_id, weg_id, bezeichnung, mea_zaehler, mea_nenner)
values
  (
    'c1000000-0000-4000-8000-000000000060'::uuid,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid,
    'c0000000-0000-4000-8000-000000000060'::uuid,
    'Whg 1', 400, 1000
  ),
  (
    'c2000000-0000-4000-8000-000000000060'::uuid,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid,
    'c0000000-0000-4000-8000-000000000060'::uuid,
    'Whg 2', 600, 1000
  );

-- WEG 2: MEA deliberately do NOT add up to 1 (300/1000 + 300/1000 = 0.6).
insert into public.weg (id, tenant_id, name)
values (
  'd0000000-0000-4000-8000-000000000060'::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid,
  '0060 WEG Zwei'
);

insert into public.unit (id, tenant_id, weg_id, bezeichnung, mea_zaehler, mea_nenner)
values
  (
    'd1000000-0000-4000-8000-000000000060'::uuid,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid,
    'd0000000-0000-4000-8000-000000000060'::uuid,
    'Whg 1', 300, 1000
  ),
  (
    'd2000000-0000-4000-8000-000000000060'::uuid,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid,
    'd0000000-0000-4000-8000-000000000060'::uuid,
    'Whg 2', 300, 1000
  );

-- Allocation keys for WEG 1.
insert into public.verteilungsschluessel (id, tenant_id, weg_id, name)
values
  ('e1000000-0000-4000-8000-000000000060'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'c0000000-0000-4000-8000-000000000060'::uuid, 'MEA'),
  ('e2000000-0000-4000-8000-000000000060'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'c0000000-0000-4000-8000-000000000060'::uuid, 'Pro Einheit'),
  ('e3000000-0000-4000-8000-000000000060'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'c0000000-0000-4000-8000-000000000060'::uuid, 'Wohnflaeche'),
  ('e4000000-0000-4000-8000-000000000060'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'c0000000-0000-4000-8000-000000000060'::uuid, 'Heizung gemischt'),
  ('e5000000-0000-4000-8000-000000000060'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'c0000000-0000-4000-8000-000000000060'::uuid, 'Flaeche unvollstaendig');

-- Allocation key for WEG 2.
insert into public.verteilungsschluessel (id, tenant_id, weg_id, name)
values ('f1000000-0000-4000-8000-000000000060'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'd0000000-0000-4000-8000-000000000060'::uuid, 'MEA');

insert into public.verteilungsschluessel_version (
  id, tenant_id, verteilungsschluessel_id, typ, quelle, gueltig_ab, parameter
)
values
  ('e1100000-0000-4000-8000-000000000060'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'e1000000-0000-4000-8000-000000000060'::uuid, 'mea', 'gesetz', date '2000-01-01', '{}'::jsonb),
  ('e2100000-0000-4000-8000-000000000060'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'e2000000-0000-4000-8000-000000000060'::uuid, 'einheit', 'beschluss', date '2000-01-01', '{}'::jsonb),
  ('e3100000-0000-4000-8000-000000000060'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'e3000000-0000-4000-8000-000000000060'::uuid, 'flaeche', 'teilungserklaerung', date '2000-01-01', '{}'::jsonb),
  ('e4100000-0000-4000-8000-000000000060'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'e4000000-0000-4000-8000-000000000060'::uuid, 'gemischt', 'gesetz', date '2000-01-01', '{"parts":[{"typ":"verbrauch","gewicht":70},{"typ":"flaeche","gewicht":30}]}'::jsonb),
  ('e5100000-0000-4000-8000-000000000060'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'e5000000-0000-4000-8000-000000000060'::uuid, 'flaeche', 'manuell', date '2000-01-01', '{}'::jsonb),
  ('f1100000-0000-4000-8000-000000000060'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'f1000000-0000-4000-8000-000000000060'::uuid, 'mea', 'gesetz', date '2000-01-01', '{}'::jsonb);

-- Area basis values for WEG 1: 75 / 25 => shares 0.75 / 0.25.
insert into public.verteilungsschluessel_basiswert (
  tenant_id, verteilungsschluessel_version_id, unit_id, wert, einheit, gueltig_ab
)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'e3100000-0000-4000-8000-000000000060'::uuid, 'c1000000-0000-4000-8000-000000000060'::uuid, 75, 'm2', date '2000-01-01'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'e3100000-0000-4000-8000-000000000060'::uuid, 'c2000000-0000-4000-8000-000000000060'::uuid, 25, 'm2', date '2000-01-01');

-- Deliberately incomplete: only one of the two units has a basis value.
insert into public.verteilungsschluessel_basiswert (
  tenant_id, verteilungsschluessel_version_id, unit_id, wert, einheit, gueltig_ab
)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'e5100000-0000-4000-8000-000000000060'::uuid, 'c1000000-0000-4000-8000-000000000060'::uuid, 75, 'm2', date '2000-01-01');

-- Plans. gesamtkosten is deliberately far away from the position totals so the
-- assertions prove which of the two inputs the generator actually used.
insert into public.wirtschaftsplan (id, tenant_id, weg_id, jahr, bezeichnung, gesamtkosten)
values
  ('a1000000-0000-4000-8000-000000000060'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'c0000000-0000-4000-8000-000000000060'::uuid, 2030, 'Ohne Positionen', 12000.00),
  ('a2000000-0000-4000-8000-000000000060'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'c0000000-0000-4000-8000-000000000060'::uuid, 2031, 'MEA-Position', 99999.00),
  ('a3000000-0000-4000-8000-000000000060'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'c0000000-0000-4000-8000-000000000060'::uuid, 2032, 'Einheit-Position', 99999.00),
  ('a4000000-0000-4000-8000-000000000060'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'c0000000-0000-4000-8000-000000000060'::uuid, 2033, 'Flaeche-Position', 99999.00),
  ('a5000000-0000-4000-8000-000000000060'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'c0000000-0000-4000-8000-000000000060'::uuid, 2034, 'Gemischt-Position', 99999.00),
  ('a6000000-0000-4000-8000-000000000060'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'c0000000-0000-4000-8000-000000000060'::uuid, 2035, 'Luecke-Position', 99999.00),
  ('a7000000-0000-4000-8000-000000000060'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'c0000000-0000-4000-8000-000000000060'::uuid, 2036, 'Zwei Positionen', 99999.00),
  ('a8000000-0000-4000-8000-000000000060'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'c0000000-0000-4000-8000-000000000060'::uuid, 2037, 'Rumpfjahr', 99999.00),
  ('b1000000-0000-4000-8000-000000000060'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'd0000000-0000-4000-8000-000000000060'::uuid, 2030, 'MEA-Normalisierung', 99999.00);

insert into public.wirtschaftsplan_position (
  tenant_id, wirtschaftsplan_id, position, kostenart, jahresbetrag, verteilungsschluessel_version_id
)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'a2000000-0000-4000-8000-000000000060'::uuid, 1, 'Verwaltung', 12000.00, 'e1100000-0000-4000-8000-000000000060'::uuid),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'a3000000-0000-4000-8000-000000000060'::uuid, 1, 'Kabel', 12000.00, 'e2100000-0000-4000-8000-000000000060'::uuid),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'a4000000-0000-4000-8000-000000000060'::uuid, 1, 'Reinigung', 12000.00, 'e3100000-0000-4000-8000-000000000060'::uuid),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'a5000000-0000-4000-8000-000000000060'::uuid, 1, 'Heizung', 12000.00, 'e4100000-0000-4000-8000-000000000060'::uuid),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'a6000000-0000-4000-8000-000000000060'::uuid, 1, 'Reinigung', 12000.00, 'e5100000-0000-4000-8000-000000000060'::uuid),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'a7000000-0000-4000-8000-000000000060'::uuid, 1, 'Verwaltung', 12000.00, 'e1100000-0000-4000-8000-000000000060'::uuid),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'a7000000-0000-4000-8000-000000000060'::uuid, 2, 'Kabel', 12000.00, 'e2100000-0000-4000-8000-000000000060'::uuid),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'a8000000-0000-4000-8000-000000000060'::uuid, 1, 'Verwaltung', 12000.00, 'e1100000-0000-4000-8000-000000000060'::uuid),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa60'::uuid, 'b1000000-0000-4000-8000-000000000060'::uuid, 1, 'Verwaltung', 12000.00, 'f1100000-0000-4000-8000-000000000060'::uuid);

-- ============================================================================
-- No positions: unchanged pre-0060 behaviour
-- ============================================================================

select lives_ok(
  $$select private._generate_sollstellungen_for_plan('a1000000-0000-4000-8000-000000000060'::uuid, 1)$$,
  'generator runs for a plan without positions'
);

select is(
  (
    select count(*)::int
    from public.sollstellung
    where wirtschaftsplan_id = 'a1000000-0000-4000-8000-000000000060'::uuid
  ),
  24,
  'plan without positions posts 12 months for each of the 2 units'
);

select is(
  (
    select distinct betrag
    from public.sollstellung
    where wirtschaftsplan_id = 'a1000000-0000-4000-8000-000000000060'::uuid
      and unit_id = 'c1000000-0000-4000-8000-000000000060'::uuid
  ),
  400.00::numeric(12, 2),
  'plan without positions keeps the pre-0060 MEA/gesamtkosten amount (0.4 * 12000 / 12)'
);

-- Second run must not duplicate rows.
select private._generate_sollstellungen_for_plan('a1000000-0000-4000-8000-000000000060'::uuid, 1);

select is(
  (
    select count(*)::int
    from public.sollstellung
    where wirtschaftsplan_id = 'a1000000-0000-4000-8000-000000000060'::uuid
  ),
  24,
  'generator is idempotent for a plan without positions'
);

-- ============================================================================
-- Positions drive the allocation
-- ============================================================================

select lives_ok(
  $$select private._generate_sollstellungen_for_plan('a2000000-0000-4000-8000-000000000060'::uuid, 1)$$,
  'generator runs for a plan with an mea position'
);

select is(
  (
    select distinct betrag
    from public.sollstellung
    where wirtschaftsplan_id = 'a2000000-0000-4000-8000-000000000060'::uuid
      and unit_id = 'c2000000-0000-4000-8000-000000000060'::uuid
  ),
  600.00::numeric(12, 2),
  'mea position allocates by MEA and ignores gesamtkosten (0.6 * 12000 / 12)'
);

select lives_ok(
  $$select private._generate_sollstellungen_for_plan('a3000000-0000-4000-8000-000000000060'::uuid, 1)$$,
  'generator runs for a plan with an einheit position'
);

select is(
  (
    select distinct betrag
    from public.sollstellung
    where wirtschaftsplan_id = 'a3000000-0000-4000-8000-000000000060'::uuid
  ),
  500.00::numeric(12, 2),
  'einheit position splits equally across units (12000 / 2 / 12)'
);

select lives_ok(
  $$select private._generate_sollstellungen_for_plan('a4000000-0000-4000-8000-000000000060'::uuid, 1)$$,
  'generator runs for a plan with a flaeche position'
);

select is(
  (
    select distinct betrag
    from public.sollstellung
    where wirtschaftsplan_id = 'a4000000-0000-4000-8000-000000000060'::uuid
      and unit_id = 'c1000000-0000-4000-8000-000000000060'::uuid
  ),
  750.00::numeric(12, 2),
  'flaeche position allocates by basis values (75/100 * 12000 / 12)'
);

-- ============================================================================
-- mea normalization: a position is always fully allocated
-- ============================================================================

select private._generate_sollstellungen_for_plan('b1000000-0000-4000-8000-000000000060'::uuid, 1);

select is(
  (
    select distinct betrag
    from public.sollstellung
    where wirtschaftsplan_id = 'b1000000-0000-4000-8000-000000000060'::uuid
  ),
  500.00::numeric(12, 2),
  'mea shares are normalized by the WEG total, so MEA summing to 0.6 still allocates the full position'
);

-- ============================================================================
-- Several positions sum per unit
-- ============================================================================

select private._generate_sollstellungen_for_plan('a7000000-0000-4000-8000-000000000060'::uuid, 1);

select is(
  (
    select distinct betrag
    from public.sollstellung
    where wirtschaftsplan_id = 'a7000000-0000-4000-8000-000000000060'::uuid
      and unit_id = 'c1000000-0000-4000-8000-000000000060'::uuid
  ),
  900.00::numeric(12, 2),
  'two positions with different keys sum per unit ((0.4 + 0.5) * 12000 / 12)'
);

-- ============================================================================
-- Partial-year plan keeps the monthly rate
-- ============================================================================

select private._generate_sollstellungen_for_plan('a8000000-0000-4000-8000-000000000060'::uuid, 7);

select is(
  (
    select count(*)::int
    from public.sollstellung
    where wirtschaftsplan_id = 'a8000000-0000-4000-8000-000000000060'::uuid
  ),
  12,
  'a plan effective from July posts 6 months for each of the 2 units'
);

select is(
  (
    select distinct betrag
    from public.sollstellung
    where wirtschaftsplan_id = 'a8000000-0000-4000-8000-000000000060'::uuid
      and unit_id = 'c1000000-0000-4000-8000-000000000060'::uuid
  ),
  400.00::numeric(12, 2),
  'a partial-year plan keeps the full monthly rate (annual budget / 12)'
);

-- ============================================================================
-- Fail-closed paths
-- ============================================================================

select throws_ok(
  $$select private._generate_sollstellungen_for_plan('a5000000-0000-4000-8000-000000000060'::uuid, 1)$$,
  '0A000',
  null,
  'typ = gemischt fails closed instead of guessing a mixed allocation'
);

select throws_ok(
  $$select private._generate_sollstellungen_for_plan('a6000000-0000-4000-8000-000000000060'::uuid, 1)$$,
  '23514',
  null,
  'missing basis-value coverage fails closed instead of allocating a partial total'
);

select * from finish();

rollback;
