-- WEG-Verwaltung pgTAP regression tests for 0056 finance allocation foundation.
--
-- Catalog-only: verifies table, RLS, grant, policy, trigger, and function
-- contracts without mutating tenant data.

begin;

select plan(32);

-- ============================================================================
-- New finance allocation tables
-- ============================================================================

select is(
  (
    select count(*)::int
    from unnest(array[
      'public.verteilungsschluessel',
      'public.verteilungsschluessel_version',
      'public.verteilungsschluessel_basiswert',
      'public.wirtschaftsplan_position'
    ]) as t(regclass_name)
    where to_regclass(t.regclass_name) is not null
  ),
  4,
  'all finance allocation foundation tables exist'
);

select is(
  (
    select count(*)::int
    from pg_catalog.pg_class as c
    where c.oid = any(array[
      'public.verteilungsschluessel'::regclass,
      'public.verteilungsschluessel_version'::regclass,
      'public.verteilungsschluessel_basiswert'::regclass,
      'public.wirtschaftsplan_position'::regclass
    ])
      and c.relrowsecurity
  ),
  4,
  'all finance allocation tables have RLS enabled'
);

select is(
  (
    select count(*)::int
    from pg_catalog.pg_class as c
    where c.oid = any(array[
      'public.verteilungsschluessel'::regclass,
      'public.verteilungsschluessel_version'::regclass,
      'public.verteilungsschluessel_basiswert'::regclass,
      'public.wirtschaftsplan_position'::regclass
    ])
      and c.relforcerowsecurity
  ),
  4,
  'all finance allocation tables have FORCE RLS enabled'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_policy as p
    where p.polrelid = any(array[
      'public.verteilungsschluessel'::regclass,
      'public.verteilungsschluessel_version'::regclass,
      'public.verteilungsschluessel_basiswert'::regclass,
      'public.wirtschaftsplan_position'::regclass
    ])
      and p.polcmd = '*'::"char"
  ),
  'finance allocation tables have no FOR ALL policies'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'public.verteilungsschluessel',
      'public.verteilungsschluessel_version',
      'public.verteilungsschluessel_basiswert',
      'public.wirtschaftsplan_position'
    ]) as t(regclass_name)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(privilege)
    where pg_catalog.has_table_privilege('anon', t.regclass_name, p.privilege)
  ),
  'anon has no table privileges on finance allocation tables'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'public.verteilungsschluessel',
      'public.verteilungsschluessel_version',
      'public.verteilungsschluessel_basiswert',
      'public.wirtschaftsplan_position'
    ]) as t(regclass_name)
    where (
      select coalesce(array_agg(privilege order by privilege), array[]::text[])
      from (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(privilege)
      where pg_catalog.has_table_privilege('authenticated', t.regclass_name, p.privilege)
    ) <> array['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[]
  ),
  'authenticated has expected SELECT/INSERT/UPDATE/DELETE grants on finance allocation tables'
);

-- ============================================================================
-- RLS policy contract
-- ============================================================================

select ok(
  (
    with expected(regclass_name, polname, polcmd) as (
      values
      ('public.verteilungsschluessel', 'verteilungsschluessel_select_own_tenant', 'r'::"char"),
      ('public.verteilungsschluessel', 'verteilungsschluessel_insert_own_tenant', 'a'::"char"),
      ('public.verteilungsschluessel', 'verteilungsschluessel_update_own_tenant', 'w'::"char"),
      ('public.verteilungsschluessel', 'verteilungsschluessel_delete_own_tenant', 'd'::"char"),
      ('public.verteilungsschluessel_version', 'verteilungsschluessel_version_select_own_tenant', 'r'::"char"),
      ('public.verteilungsschluessel_version', 'verteilungsschluessel_version_insert_own_tenant', 'a'::"char"),
      ('public.verteilungsschluessel_version', 'verteilungsschluessel_version_update_own_tenant', 'w'::"char"),
      ('public.verteilungsschluessel_version', 'verteilungsschluessel_version_delete_own_tenant', 'd'::"char"),
      ('public.verteilungsschluessel_basiswert', 'verteilungsschluessel_basiswert_select_own_tenant', 'r'::"char"),
      ('public.verteilungsschluessel_basiswert', 'verteilungsschluessel_basiswert_insert_own_tenant', 'a'::"char"),
      ('public.verteilungsschluessel_basiswert', 'verteilungsschluessel_basiswert_update_own_tenant', 'w'::"char"),
      ('public.verteilungsschluessel_basiswert', 'verteilungsschluessel_basiswert_delete_own_tenant', 'd'::"char"),
      ('public.wirtschaftsplan_position', 'wirtschaftsplan_position_select_own_tenant', 'r'::"char"),
      ('public.wirtschaftsplan_position', 'wirtschaftsplan_position_insert_own_tenant', 'a'::"char"),
      ('public.wirtschaftsplan_position', 'wirtschaftsplan_position_update_own_tenant', 'w'::"char"),
      ('public.wirtschaftsplan_position', 'wirtschaftsplan_position_delete_own_tenant', 'd'::"char")
    ),
    policy_scope(regclass_name) as (
      values
        ('public.verteilungsschluessel'),
        ('public.verteilungsschluessel_version'),
        ('public.verteilungsschluessel_basiswert'),
        ('public.wirtschaftsplan_position')
    )
    select (
      select count(*)::int
      from expected
      join pg_catalog.pg_policy as p
        on p.polrelid = expected.regclass_name::regclass
       and p.polname = expected.polname
       and p.polcmd = expected.polcmd
       and p.polroles = array[
         (select oid from pg_catalog.pg_roles where rolname = 'authenticated')
       ]::oid[]
    ) = 16
    and not exists (
      select 1
      from pg_catalog.pg_policy as p
      where exists (
        select 1
        from policy_scope
        where p.polrelid = policy_scope.regclass_name::regclass
      )
        and not exists (
          select 1
          from expected
          where p.polrelid = expected.regclass_name::regclass
            and p.polname = expected.polname
            and p.polcmd = expected.polcmd
            and p.polroles = array[
              (select oid from pg_catalog.pg_roles where rolname = 'authenticated')
            ]::oid[]
        )
    )
  ),
  'finance allocation tables have exactly the expected authenticated-only SELECT/INSERT/UPDATE/DELETE policies'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_policy as p
    where p.polrelid = any(array[
      'public.verteilungsschluessel'::regclass,
      'public.verteilungsschluessel_version'::regclass,
      'public.verteilungsschluessel_basiswert'::regclass,
      'public.wirtschaftsplan_position'::regclass
    ])
      and p.polcmd = 'r'::"char"
      and coalesce(lower(pg_catalog.pg_get_expr(p.polqual, p.polrelid)), '') not like '%select%tenant_id%'
  ),
  'all finance SELECT policies are SELECT-wrapped tenant-scoped'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_policy as p
    where p.polrelid = any(array[
      'public.verteilungsschluessel'::regclass,
      'public.verteilungsschluessel_version'::regclass,
      'public.verteilungsschluessel_basiswert'::regclass,
      'public.wirtschaftsplan_position'::regclass
    ])
      and p.polcmd = 'a'::"char"
      and (
        coalesce(lower(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)), '') not like '%select%tenant_id%'
        or coalesce(lower(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)), '') not like '%select%has_role%tenant_admin%'
        or coalesce(lower(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)), '') not like '%select%has_role%verwalter_mitarbeiter%'
      )
  ),
  'all finance INSERT policies require SELECT-wrapped tenant scope and manager role'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_policy as p
    where p.polrelid = any(array[
      'public.verteilungsschluessel'::regclass,
      'public.verteilungsschluessel_version'::regclass,
      'public.verteilungsschluessel_basiswert'::regclass,
      'public.wirtschaftsplan_position'::regclass
    ])
      and p.polcmd = 'w'::"char"
      and (
        coalesce(lower(pg_catalog.pg_get_expr(p.polqual, p.polrelid)), '') not like '%select%tenant_id%'
        or coalesce(lower(pg_catalog.pg_get_expr(p.polqual, p.polrelid)), '') not like '%select%has_role%tenant_admin%'
        or coalesce(lower(pg_catalog.pg_get_expr(p.polqual, p.polrelid)), '') not like '%select%has_role%verwalter_mitarbeiter%'
        or coalesce(lower(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)), '') not like '%select%tenant_id%'
        or coalesce(lower(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)), '') not like '%select%has_role%tenant_admin%'
        or coalesce(lower(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)), '') not like '%select%has_role%verwalter_mitarbeiter%'
      )
  ),
  'all finance UPDATE policies require SELECT-wrapped tenant scope and manager role in USING and WITH CHECK'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_policy as p
    where p.polrelid = any(array[
      'public.verteilungsschluessel'::regclass,
      'public.verteilungsschluessel_version'::regclass,
      'public.verteilungsschluessel_basiswert'::regclass,
      'public.wirtschaftsplan_position'::regclass
    ])
      and p.polcmd = 'd'::"char"
      and (
        coalesce(lower(pg_catalog.pg_get_expr(p.polqual, p.polrelid)), '') not like '%select%tenant_id%'
        or coalesce(lower(pg_catalog.pg_get_expr(p.polqual, p.polrelid)), '') not like '%select%has_role%tenant_admin%'
        or coalesce(lower(pg_catalog.pg_get_expr(p.polqual, p.polrelid)), '') not like '%select%has_role%verwalter_mitarbeiter%'
      )
  ),
  'all finance DELETE policies require SELECT-wrapped tenant scope and manager role'
);

-- ============================================================================
-- Tenant-scoped relational boundaries
-- ============================================================================

select is(
  (
    select count(*)::int
    from (values
      ('verteilungsschluessel_weg_fk', 'public.verteilungsschluessel', 'public.weg'),
      ('verteilungsschluessel_version_key_fk', 'public.verteilungsschluessel_version', 'public.verteilungsschluessel'),
      ('verteilungsschluessel_version_resolution_fk', 'public.verteilungsschluessel_version', 'public.resolution'),
      ('verteilungsschluessel_basiswert_version_fk', 'public.verteilungsschluessel_basiswert', 'public.verteilungsschluessel_version'),
      ('verteilungsschluessel_basiswert_unit_fk', 'public.verteilungsschluessel_basiswert', 'public.unit'),
      ('wirtschaftsplan_position_plan_fk', 'public.wirtschaftsplan_position', 'public.wirtschaftsplan'),
      ('wirtschaftsplan_position_version_fk', 'public.wirtschaftsplan_position', 'public.verteilungsschluessel_version')
    ) as expected(conname, conrelid_name, confrelid_name)
    join pg_catalog.pg_constraint as c
      on c.conname = expected.conname
     and c.conrelid = expected.conrelid_name::regclass
     and c.confrelid = expected.confrelid_name::regclass
     and c.contype = 'f'
  ),
  7,
  'all finance allocation foreign keys exist'
);

select ok(
  not exists (
    select 1
    from (values
      (
        'verteilungsschluessel_weg_fk',
        'public.verteilungsschluessel',
        'public.weg',
        array['tenant_id', 'weg_id']::text[],
        array['tenant_id', 'id']::text[]
      ),
      (
        'verteilungsschluessel_version_key_fk',
        'public.verteilungsschluessel_version',
        'public.verteilungsschluessel',
        array['tenant_id', 'verteilungsschluessel_id']::text[],
        array['tenant_id', 'id']::text[]
      ),
      (
        'verteilungsschluessel_version_resolution_fk',
        'public.verteilungsschluessel_version',
        'public.resolution',
        array['tenant_id', 'resolution_id']::text[],
        array['tenant_id', 'id']::text[]
      ),
      (
        'verteilungsschluessel_basiswert_version_fk',
        'public.verteilungsschluessel_basiswert',
        'public.verteilungsschluessel_version',
        array['tenant_id', 'verteilungsschluessel_version_id']::text[],
        array['tenant_id', 'id']::text[]
      ),
      (
        'verteilungsschluessel_basiswert_unit_fk',
        'public.verteilungsschluessel_basiswert',
        'public.unit',
        array['tenant_id', 'unit_id']::text[],
        array['tenant_id', 'id']::text[]
      ),
      (
        'wirtschaftsplan_position_plan_fk',
        'public.wirtschaftsplan_position',
        'public.wirtschaftsplan',
        array['tenant_id', 'wirtschaftsplan_id']::text[],
        array['tenant_id', 'id']::text[]
      ),
      (
        'wirtschaftsplan_position_version_fk',
        'public.wirtschaftsplan_position',
        'public.verteilungsschluessel_version',
        array['tenant_id', 'verteilungsschluessel_version_id']::text[],
        array['tenant_id', 'id']::text[]
      )
    ) as expected(conname, conrelid_name, confrelid_name, concols, confcols)
    left join pg_catalog.pg_constraint as c
      on c.conname = expected.conname
     and c.conrelid = expected.conrelid_name::regclass
     and c.confrelid = expected.confrelid_name::regclass
     and c.contype = 'f'
    where c.oid is null
      or c.confdeltype <> 'r'::"char"
      or c.conkey is distinct from (
        select array_agg(a.attnum order by col.ord)::smallint[]
        from unnest(expected.concols) with ordinality as col(attname, ord)
        join pg_catalog.pg_attribute as a
          on a.attrelid = expected.conrelid_name::regclass
         and a.attname = col.attname
      )
      or c.confkey is distinct from (
        select array_agg(a.attnum order by col.ord)::smallint[]
        from unnest(expected.confcols) with ordinality as col(attname, ord)
        join pg_catalog.pg_attribute as a
          on a.attrelid = expected.confrelid_name::regclass
         and a.attname = col.attname
      )
  ),
  'all finance allocation foreign keys have expected tenant-scoped columns and ON DELETE RESTRICT'
);

-- ============================================================================
-- Trigger-only functions
-- ============================================================================

select is(
  (
    select count(*)::int
    from unnest(array[
      'public.tg_finance_allocation_block_agent_writes()',
      'public.tg_verteilungsschluessel_version_validate_weg()',
      'public.tg_verteilungsschluessel_basiswert_validate_weg()',
      'public.tg_wirtschaftsplan_position_validate()'
    ]) as expected(regprocedure_name)
    where to_regprocedure(expected.regprocedure_name) is not null
  ),
  4,
  'all finance trigger-only functions exist'
);

select is(
  (
    select count(*)::int
    from unnest(array[
      'public.tg_finance_allocation_block_agent_writes()',
      'public.tg_verteilungsschluessel_version_validate_weg()',
      'public.tg_verteilungsschluessel_basiswert_validate_weg()',
      'public.tg_wirtschaftsplan_position_validate()'
    ]) as expected(regprocedure_name)
    join pg_catalog.pg_proc as p
      on p.oid = to_regprocedure(expected.regprocedure_name)
    where p.prosecdef
  ),
  4,
  'all finance trigger-only functions are SECURITY DEFINER'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'public.tg_finance_allocation_block_agent_writes()',
      'public.tg_verteilungsschluessel_version_validate_weg()',
      'public.tg_verteilungsschluessel_basiswert_validate_weg()',
      'public.tg_wirtschaftsplan_position_validate()'
    ]) as expected(regprocedure_name)
    left join pg_catalog.pg_proc as p
      on p.oid = to_regprocedure(expected.regprocedure_name)
    where p.oid is null
      or not exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) as cfg(value)
        where cfg.value in ('search_path=', 'search_path=""')
      )
  ),
  'all finance trigger-only functions pin an empty search_path'
);

select ok(
  not has_function_privilege('anon', 'public.tg_finance_allocation_block_agent_writes()', 'execute')
  and not has_function_privilege('anon', 'public.tg_verteilungsschluessel_version_validate_weg()', 'execute')
  and not has_function_privilege('anon', 'public.tg_verteilungsschluessel_basiswert_validate_weg()', 'execute')
  and not has_function_privilege('anon', 'public.tg_wirtschaftsplan_position_validate()', 'execute'),
  'anon cannot execute finance trigger-only functions directly'
);

select ok(
  not has_function_privilege('authenticated', 'public.tg_finance_allocation_block_agent_writes()', 'execute')
  and not has_function_privilege('authenticated', 'public.tg_verteilungsschluessel_version_validate_weg()', 'execute')
  and not has_function_privilege('authenticated', 'public.tg_verteilungsschluessel_basiswert_validate_weg()', 'execute')
  and not has_function_privilege('authenticated', 'public.tg_wirtschaftsplan_position_validate()', 'execute'),
  'authenticated cannot execute finance trigger-only functions directly'
);

select ok(
  not has_function_privilege('service_role', 'public.tg_finance_allocation_block_agent_writes()', 'execute')
  and not has_function_privilege('service_role', 'public.tg_verteilungsschluessel_version_validate_weg()', 'execute')
  and not has_function_privilege('service_role', 'public.tg_verteilungsschluessel_basiswert_validate_weg()', 'execute')
  and not has_function_privilege('service_role', 'public.tg_wirtschaftsplan_position_validate()', 'execute'),
  'service_role cannot execute finance trigger-only functions directly'
);

-- ============================================================================
-- Trigger wiring
-- ============================================================================

select is(
  (
    select count(*)::int
    from pg_catalog.pg_trigger as t
    where t.tgrelid = any(array[
      'public.verteilungsschluessel'::regclass,
      'public.verteilungsschluessel_version'::regclass,
      'public.verteilungsschluessel_basiswert'::regclass,
      'public.wirtschaftsplan_position'::regclass
    ])
      and t.tgfoid = 'public.tg_finance_allocation_block_agent_writes()'::regprocedure
      and t.tgenabled <> 'D'::"char"
      and not t.tgisinternal
  ),
  4,
  'all finance allocation tables have the agent-write guard trigger'
);

select ok(
  not exists (
    select expected.tgname
    from (values
      ('public.verteilungsschluessel', 'verteilungsschluessel_block_agent_writes'),
      ('public.verteilungsschluessel_version', 'verteilungsschluessel_version_block_agent_writes'),
      ('public.verteilungsschluessel_basiswert', 'verteilungsschluessel_basiswert_block_agent_writes'),
      ('public.wirtschaftsplan_position', 'wirtschaftsplan_position_block_agent_writes')
    ) as expected(regclass_name, tgname)
    where not exists (
      select 1
      from pg_catalog.pg_trigger as t
      where t.tgname = expected.tgname
        and t.tgrelid = expected.regclass_name::regclass
        and t.tgfoid = 'public.tg_finance_allocation_block_agent_writes()'::regprocedure
        and t.tgenabled <> 'D'::"char"
        and not t.tgisinternal
    )
  ),
  'all expected finance agent-write guard trigger names exist'
);

select is(
  (
    select count(*)::int
    from (values
      (
        'public.verteilungsschluessel_version',
        'verteilungsschluessel_version_validate_weg',
        'public.tg_verteilungsschluessel_version_validate_weg()'
      ),
      (
        'public.verteilungsschluessel_basiswert',
        'verteilungsschluessel_basiswert_validate_weg',
        'public.tg_verteilungsschluessel_basiswert_validate_weg()'
      ),
      (
        'public.wirtschaftsplan_position',
        'wirtschaftsplan_position_validate',
        'public.tg_wirtschaftsplan_position_validate()'
      )
    ) as expected(regclass_name, tgname, regprocedure_name)
    join pg_catalog.pg_trigger as t
      on t.tgrelid = expected.regclass_name::regclass
     and t.tgname = expected.tgname
     and t.tgfoid = to_regprocedure(expected.regprocedure_name)
     and t.tgenabled <> 'D'::"char"
     and not t.tgisinternal
  ),
  3,
  'same-WEG and draft-only validation triggers are wired to expected functions'
);

select ok(
  coalesce((
    select p.prosrc like '%Allocation key versions must not have overlapping validity periods.%'
      and p.prosrc like '%from public.verteilungsschluessel_version existing%'
      and p.prosrc like '%existing.gueltig_ab <= coalesce(new.gueltig_bis%'
      and p.prosrc like '%new.gueltig_ab <= coalesce(existing.gueltig_bis%'
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'tg_verteilungsschluessel_version_validate_weg'
  ), false)
  and coalesce((
    select p.prosrc like '%Allocation basis values must not have overlapping validity periods per unit.%'
      and p.prosrc like '%from public.verteilungsschluessel_basiswert existing%'
      and p.prosrc like '%existing.gueltig_ab <= coalesce(new.gueltig_bis%'
      and p.prosrc like '%new.gueltig_ab <= coalesce(existing.gueltig_bis%'
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'tg_verteilungsschluessel_basiswert_validate_weg'
  ), false),
  'allocation version and basis value validators block overlapping validity periods'
);

select ok(
  not exists (
    select 1
    from (values
      (
        'public.verteilungsschluessel_version',
        'verteilungsschluessel_version_validate_weg'
      ),
      (
        'public.verteilungsschluessel_basiswert',
        'verteilungsschluessel_basiswert_validate_weg'
      )
    ) as expected(regclass_name, tgname)
    join pg_catalog.pg_trigger as t
      on t.tgrelid = expected.regclass_name::regclass
     and t.tgname = expected.tgname
     and t.tgenabled <> 'D'::"char"
     and not t.tgisinternal
    where lower(pg_catalog.pg_get_triggerdef(t.oid)) not like '%update of%'
      or lower(pg_catalog.pg_get_triggerdef(t.oid)) not like '%gueltig_ab%'
      or lower(pg_catalog.pg_get_triggerdef(t.oid)) not like '%gueltig_bis%'
  ),
  'allocation validity validators fire when validity bounds change'
);

select is(
  (
    select count(*)::int
    from (values
      ('public.verteilungsschluessel', 'verteilungsschluessel_audit_emit'),
      ('public.verteilungsschluessel_version', 'verteilungsschluessel_version_audit_emit'),
      ('public.verteilungsschluessel_basiswert', 'verteilungsschluessel_basiswert_audit_emit'),
      ('public.wirtschaftsplan_position', 'wirtschaftsplan_position_audit_emit')
    ) as expected(regclass_name, tgname)
    join pg_catalog.pg_trigger as t
      on t.tgrelid = expected.regclass_name::regclass
     and t.tgname = expected.tgname
     and t.tgfoid = 'audit_writer.tg_emit_audit_event()'::regprocedure
     and t.tgenabled <> 'D'::"char"
     and not t.tgisinternal
  ),
  4,
  'all finance allocation tables emit audit events'
);

-- ============================================================================
-- Existing immutable Sollstellung lifecycle remains closed
-- ============================================================================

select is(
  (
    select coalesce(array_agg(privilege order by privilege), array[]::text[])
    from (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(privilege)
    where pg_catalog.has_table_privilege(
      'authenticated',
      'public.sollstellung',
      p.privilege
    )
  ),
  array['SELECT']::text[],
  'authenticated still has SELECT-only table privileges on sollstellung'
);

select ok(
  coalesce((
    select lower(pg_get_expr(polwithcheck, polrelid)) like '%app.sollstellung_writer%'
      and lower(pg_get_expr(polwithcheck, polrelid)) like '%app.sollstellung_tenant_id%'
    from pg_catalog.pg_policy
    where polrelid = 'public.sollstellung'::regclass
      and polname = 'sollstellung_insert_generated'
  ), false),
  'sollstellung_insert_generated remains generator-GUC scoped'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = 'public.sollstellung'::regclass
      and tgname = 'sollstellung_enforce_insert_only'
      and tgfoid = 'public.tg_sollstellung_enforce_insert_only()'::regprocedure
      and not tgisinternal
  ),
  'sollstellung insert-only trigger remains present'
);

select ok(
  not has_function_privilege('anon', 'public.generate_sollstellungen(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.generate_sollstellungen(uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.generate_sollstellungen(uuid)', 'execute'),
  'deprecated generate_sollstellungen RPC remains closed to API roles'
);

select ok(
  has_function_privilege('authenticated', 'public.activate_wirtschaftsplan(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.activate_wirtschaftsplan(uuid)', 'execute'),
  'activate_wirtschaftsplan remains authenticated-only'
);

select ok(
  coalesce((
    select p.prosrc like '%app.actor_type%'
      and p.prosrc like '%agent%'
      and p.prosrc like '%private._generate_sollstellungen_for_plan%'
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'activate_wirtschaftsplan'
  ), false),
  'activate_wirtschaftsplan keeps agent guard and internal Sollstellung generation'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_depend as d
    join pg_catalog.pg_rewrite as r on r.oid = d.objid
    where d.refobjid = 'public.sollstellung'::regclass
      and r.ev_class = any(array[
        'public.verteilungsschluessel'::regclass,
        'public.verteilungsschluessel_version'::regclass,
        'public.verteilungsschluessel_basiswert'::regclass,
        'public.wirtschaftsplan_position'::regclass
      ])
  ),
  'new finance allocation tables do not create rewrite dependencies on sollstellung'
);

select * from finish();

rollback;
