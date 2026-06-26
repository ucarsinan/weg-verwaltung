-- WEG-Verwaltung pgTAP regression tests for 0046 least privilege.
--
-- Scope:
--   - audit_writer.audit_chain_repair_checkpoint ownership and grants
--   - audit repair RPC exposure for anon/authenticated/service_role/audit_writer
--   - audit_writer column grants on public.audit_event
--   - audit_event RLS/FORCE RLS, including partitions
--   - agent privilege model: agent is an actor_type/GUC, not a DB role
--
-- Run with `supabase test db` against a database that has migrations through
-- 0046 applied. The suite is catalog-only and does not mutate tenant data.

begin;

select plan(42);

-- ============================================================================
-- Object and role model
-- ============================================================================

select ok(
  to_regclass('audit_writer.audit_chain_repair_checkpoint') is not null,
  '0046 checkpoint table exists'
);

select is(
  (
    select pg_catalog.pg_get_userbyid(c.relowner)
    from pg_catalog.pg_class as c
    where c.oid = 'audit_writer.audit_chain_repair_checkpoint'::regclass
  ),
  'postgres',
  'checkpoint table is owned by postgres, not audit_writer'
);

select is(
  (
    select n.nspname
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where c.oid = 'audit_writer.audit_chain_repair_checkpoint'::regclass
  ),
  'audit_writer',
  'checkpoint table stays outside the public API schema'
);

select ok(
  exists (select 1 from pg_catalog.pg_roles where rolname = 'audit_writer'),
  'audit_writer role exists'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'audit_writer'
      and not rolcanlogin
  ),
  'audit_writer is a nologin runtime role'
);

select ok(
  not exists (select 1 from pg_catalog.pg_roles where rolname = 'agent'),
  'agent is not a DB role; agent authority is represented by actor_type/GUC'
);

-- ============================================================================
-- RLS and FORCE RLS
-- ============================================================================

select ok(
  (
    select c.relrowsecurity
    from pg_catalog.pg_class as c
    where c.oid = 'public.audit_event'::regclass
  ),
  'audit_event parent has RLS enabled'
);

select ok(
  (
    select c.relforcerowsecurity
    from pg_catalog.pg_class as c
    where c.oid = 'public.audit_event'::regclass
  ),
  'audit_event parent has FORCE RLS enabled'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_inherits as i
    join pg_catalog.pg_class as child on child.oid = i.inhrelid
    where i.inhparent = 'public.audit_event'::regclass
      and not child.relrowsecurity
  ),
  'all audit_event partitions have RLS enabled'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_inherits as i
    join pg_catalog.pg_class as child on child.oid = i.inhrelid
    where i.inhparent = 'public.audit_event'::regclass
      and not child.relforcerowsecurity
  ),
  'all audit_event partitions have FORCE RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_policy as p
    where p.polrelid = 'public.audit_event'::regclass
      and p.polname = 'audit_event_chain_read_for_audit_writer'
  ),
  'tenant-bound audit_writer chain-read policy exists'
);

select is(
  (
    select p.polcmd
    from pg_catalog.pg_policy as p
    where p.polrelid = 'public.audit_event'::regclass
      and p.polname = 'audit_event_chain_read_for_audit_writer'
  ),
  'r'::"char",
  'audit_writer chain-read policy is SELECT-only'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_policy as p
    join pg_catalog.pg_roles as r on r.oid = any(p.polroles)
    where p.polrelid = 'public.audit_event'::regclass
      and p.polname = 'audit_event_chain_read_for_audit_writer'
      and r.rolname = 'audit_writer'
  ),
  'audit_writer chain-read policy is granted only through the audit_writer role'
);

select is(
  (
    select coalesce(array_agg(r.rolname::text order by r.rolname), array[]::text[])
    from pg_catalog.pg_policy as p
    join pg_catalog.pg_roles as r on r.oid = any(p.polroles)
    where p.polrelid = 'public.audit_event'::regclass
      and p.polname = 'audit_event_chain_read_for_audit_writer'
  ),
  array['audit_writer']::text[],
  'audit_writer chain-read policy has no extra roles'
);

select ok(
  (
    select pg_catalog.pg_get_expr(p.polqual, p.polrelid)
    from pg_catalog.pg_policy as p
    where p.polrelid = 'public.audit_event'::regclass
      and p.polname = 'audit_event_chain_read_for_audit_writer'
  ) like '%app.audit_chain_tenant_id%',
  'audit_writer chain-read policy is scoped by app.audit_chain_tenant_id'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_policy as p
    where p.polrelid = 'public.audit_event'::regclass
      and p.polcmd in ('w'::"char", 'd'::"char", '*'::"char")
  ),
  'audit_event has no UPDATE, DELETE, or FOR ALL policies'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_inherits as i
    join pg_catalog.pg_policy as p on p.polrelid = i.inhrelid
    where i.inhparent = 'public.audit_event'::regclass
  ),
  'audit_event partitions remain deny-by-default with no partition policies'
);

-- ============================================================================
-- Checkpoint table grants
-- ============================================================================

select is(
  (
    select coalesce(array_agg(privilege order by privilege), array[]::text[])
    from (
      values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    ) as p(privilege)
    where pg_catalog.has_table_privilege(
      'anon',
      'audit_writer.audit_chain_repair_checkpoint',
      p.privilege
    )
  ),
  array[]::text[],
  'anon has no privileges on checkpoint table'
);

select is(
  (
    select coalesce(array_agg(privilege order by privilege), array[]::text[])
    from (
      values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    ) as p(privilege)
    where pg_catalog.has_table_privilege(
      'authenticated',
      'audit_writer.audit_chain_repair_checkpoint',
      p.privilege
    )
  ),
  array[]::text[],
  'authenticated has no privileges on checkpoint table'
);

select is(
  (
    select coalesce(array_agg(privilege order by privilege), array[]::text[])
    from (
      values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    ) as p(privilege)
    where pg_catalog.has_table_privilege(
      'service_role',
      'audit_writer.audit_chain_repair_checkpoint',
      p.privilege
    )
  ),
  array[]::text[],
  'service_role has no privileges on checkpoint table'
);

select is(
  (
    select coalesce(array_agg(privilege order by privilege), array[]::text[])
    from (
      values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    ) as p(privilege)
    where pg_catalog.has_table_privilege(
      'audit_writer',
      'audit_writer.audit_chain_repair_checkpoint',
      p.privilege
    )
  ),
  array['INSERT', 'SELECT']::text[],
  'audit_writer has only INSERT and SELECT on checkpoint table'
);

select ok(
  not pg_catalog.has_table_privilege(
    'audit_writer',
    'audit_writer.audit_chain_repair_checkpoint',
    'UPDATE WITH GRANT OPTION'
  ),
  'audit_writer cannot grant UPDATE on checkpoint table'
);

-- ============================================================================
-- RPC exposure for audit repair internals
-- ============================================================================

select ok(
  to_regprocedure('audit_writer.hash_audit_event_v2(bytea,uuid,bigint,timestamptz,text,uuid,text,text,uuid,text,jsonb)') is not null,
  'hash_audit_event_v2 exists with the expected signature'
);

select ok(
  to_regprocedure('audit_writer.audit_event_before_insert()') is not null,
  'audit_event_before_insert trigger function exists'
);

select ok(
  to_regprocedure('audit_writer.verify_chain_repaired(uuid)') is not null,
  'verify_chain_repaired exists'
);

select ok(
  to_regprocedure('audit_writer.verify_chain(uuid)') is not null,
  'verify_chain compatibility wrapper exists'
);

select ok(
  pg_catalog.has_function_privilege(
    'audit_writer',
    to_regprocedure('audit_writer.hash_audit_event_v2(bytea,uuid,bigint,timestamptz,text,uuid,text,text,uuid,text,jsonb)'),
    'EXECUTE'
  ),
  'audit_writer can execute hash_audit_event_v2'
);

select ok(
  pg_catalog.has_function_privilege(
    'audit_writer',
    to_regprocedure('audit_writer.audit_event_before_insert()'),
    'EXECUTE'
  ),
  'audit_writer can execute audit_event_before_insert'
);

select ok(
  pg_catalog.has_function_privilege(
    'audit_writer',
    to_regprocedure('audit_writer.verify_chain_repaired(uuid)'),
    'EXECUTE'
  ),
  'audit_writer can execute verify_chain_repaired'
);

select ok(
  pg_catalog.has_function_privilege(
    'audit_writer',
    to_regprocedure('audit_writer.verify_chain(uuid)'),
    'EXECUTE'
  ),
  'audit_writer can execute verify_chain'
);

select is(
  (
    select coalesce(array_agg(function_name order by function_name), array[]::text[])
    from (
      values
        ('hash_audit_event_v2', to_regprocedure('audit_writer.hash_audit_event_v2(bytea,uuid,bigint,timestamptz,text,uuid,text,text,uuid,text,jsonb)')),
        ('audit_event_before_insert', to_regprocedure('audit_writer.audit_event_before_insert()')),
        ('verify_chain_repaired', to_regprocedure('audit_writer.verify_chain_repaired(uuid)')),
        ('verify_chain', to_regprocedure('audit_writer.verify_chain(uuid)'))
    ) as f(function_name, function_oid)
    where pg_catalog.has_function_privilege('anon', f.function_oid, 'EXECUTE')
  ),
  array[]::text[],
  'anon cannot execute audit repair internals via RPC'
);

select is(
  (
    select coalesce(array_agg(function_name order by function_name), array[]::text[])
    from (
      values
        ('hash_audit_event_v2', to_regprocedure('audit_writer.hash_audit_event_v2(bytea,uuid,bigint,timestamptz,text,uuid,text,text,uuid,text,jsonb)')),
        ('audit_event_before_insert', to_regprocedure('audit_writer.audit_event_before_insert()')),
        ('verify_chain_repaired', to_regprocedure('audit_writer.verify_chain_repaired(uuid)')),
        ('verify_chain', to_regprocedure('audit_writer.verify_chain(uuid)'))
    ) as f(function_name, function_oid)
    where pg_catalog.has_function_privilege('authenticated', f.function_oid, 'EXECUTE')
  ),
  array[]::text[],
  'authenticated cannot execute audit repair internals via RPC'
);

select is(
  (
    select coalesce(array_agg(function_name order by function_name), array[]::text[])
    from (
      values
        ('hash_audit_event_v2', to_regprocedure('audit_writer.hash_audit_event_v2(bytea,uuid,bigint,timestamptz,text,uuid,text,text,uuid,text,jsonb)')),
        ('audit_event_before_insert', to_regprocedure('audit_writer.audit_event_before_insert()')),
        ('verify_chain_repaired', to_regprocedure('audit_writer.verify_chain_repaired(uuid)')),
        ('verify_chain', to_regprocedure('audit_writer.verify_chain(uuid)'))
    ) as f(function_name, function_oid)
    where pg_catalog.has_function_privilege('service_role', f.function_oid, 'EXECUTE')
  ),
  array[]::text[],
  'service_role cannot execute audit repair internals via RPC'
);

-- ============================================================================
-- Column grants and audit_event table privileges
-- ============================================================================

select is(
  (
    select coalesce(array_agg(a.attname::text order by a.attname), array[]::text[])
    from pg_catalog.pg_attribute as a
    where a.attrelid = 'public.audit_event'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and pg_catalog.has_column_privilege('audit_writer', 'public.audit_event', a.attname, 'SELECT')
  ),
  array[
    'action',
    'actor_type',
    'actor_user_id',
    'created_at',
    'db_role',
    'entity_id',
    'entity_typ',
    'id',
    'payload',
    'prev_hash',
    'row_hash',
    'seq',
    'tenant_id'
  ]::text[],
  'audit_writer SELECT column grant on audit_event is limited to the verifier envelope'
);

select is(
  (
    select coalesce(array_agg(a.attname::text order by a.attname), array[]::text[])
    from pg_catalog.pg_attribute as a
    where a.attrelid = 'public.audit_event'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and pg_catalog.has_column_privilege('audit_writer', 'public.audit_event', a.attname, 'UPDATE')
  ),
  array[]::text[],
  'audit_writer has no UPDATE column grants on audit_event'
);

select is(
  (
    select coalesce(array_agg(privilege order by privilege), array[]::text[])
    from (
      values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    ) as p(privilege)
    where pg_catalog.has_table_privilege('audit_writer', 'public.audit_event', p.privilege)
  ),
  array['INSERT']::text[],
  'audit_writer table privileges on audit_event are limited to INSERT'
);

select is(
  (
    select coalesce(array_agg(privilege order by privilege), array[]::text[])
    from (
      values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    ) as p(privilege)
    where pg_catalog.has_table_privilege('authenticated', 'public.audit_event', p.privilege)
  ),
  array['SELECT']::text[],
  'authenticated table privileges on audit_event are limited to SELECT'
);

select is(
  (
    select coalesce(array_agg(privilege order by privilege), array[]::text[])
    from (
      values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    ) as p(privilege)
    where pg_catalog.has_table_privilege('anon', 'public.audit_event', p.privilege)
  ),
  array[]::text[],
  'anon has no table privileges on audit_event'
);

select is(
  (
    select coalesce(array_agg(privilege order by privilege), array[]::text[])
    from (
      values ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    ) as p(privilege)
    where pg_catalog.has_table_privilege('service_role', 'public.audit_event', p.privilege)
  ),
  array[]::text[],
  'service_role has no mutable table privileges on audit_event'
);

select ok(
  (
    select not r.rolbypassrls
    from pg_catalog.pg_roles as r
    where r.rolname = 'audit_writer'
  ),
  'audit_writer cannot bypass RLS'
);

select ok(
  not pg_catalog.has_table_privilege(
    'audit_writer',
    'public.audit_event',
    'UPDATE WITH GRANT OPTION'
  ),
  'audit_writer cannot grant UPDATE on audit_event'
);

select ok(
  not pg_catalog.has_table_privilege(
    'authenticated',
    'public.audit_event',
    'INSERT WITH GRANT OPTION'
  ),
  'authenticated cannot grant INSERT on audit_event'
);

select * from finish();

rollback;
