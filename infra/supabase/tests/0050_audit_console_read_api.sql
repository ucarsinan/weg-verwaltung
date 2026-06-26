-- WEG-Verwaltung pgTAP regression tests for 0050 Audit Console read API.
--
-- Scope:
--   - public RPC surface exists with expected grants
--   - reveal/integrity tables have RLS/FORCE RLS
--   - audit_event remains immutable from API roles
--   - audit_writer verifier remains hidden behind public wrapper
--
-- Catalog-only: does not mutate tenant audit data.

begin;

select plan(54);

select ok(
  to_regprocedure('public.audit_mask_payload(jsonb)') is not null,
  'audit_mask_payload(jsonb) exists'
);

select ok(
  to_regprocedure('public.audit_event_summary(text,text,jsonb)') is not null,
  'audit_event_summary helper exists'
);

select ok(
  to_regprocedure('public.audit_entity_label(text,jsonb,uuid)') is not null,
  'audit_entity_label helper exists'
);

select ok(
  to_regprocedure('public.audit_actor_label(text,uuid)') is not null,
  'audit_actor_label helper exists'
);

select ok(
  to_regprocedure('public.audit_risk_flags(text,text,jsonb)') is not null,
  'audit_risk_flags helper exists'
);

select ok(
  to_regprocedure('public.audit_event_feed(timestamptz,timestamptz,text,text,text,text,text,timestamptz,bigint,integer)') is not null,
  'audit_event_feed RPC exists'
);

select ok(
  to_regprocedure('public.audit_reveal_event_payload(uuid,timestamptz)') is not null,
  'audit_reveal_event_payload RPC exists'
);

select ok(
  to_regprocedure('public.audit_integrity_status()') is not null,
  'audit_integrity_status RPC exists'
);

select ok(
  to_regprocedure('public.audit_verify_chain()') is not null,
  'audit_verify_chain RPC exists'
);

select ok(
  to_regclass('public.audit_payload_reveal') is not null,
  'audit_payload_reveal table exists'
);

select ok(
  to_regclass('public.audit_integrity_check') is not null,
  'audit_integrity_check table exists'
);

select is(
  public.audit_mask_payload(
    '{"email":"ada@example.test","nested":{"phone":"+49 30","items":[{"name":"Ada","entity_id":"22222222-2222-4222-8222-222222222222"}]},"entity_id":"11111111-1111-4111-8111-111111111111"}'::jsonb
  )::text,
  '{"email":"[masked]","nested":"[masked]","entity_id":"11111111-1111-4111-8111-111111111111"}'::jsonb::text,
  'audit_mask_payload masks domain payload values and keeps explicit entity IDs'
);

select is(
  public.audit_event_summary('weg', 'insert', '{}'::jsonb),
  'WEG angelegt',
  'audit_event_summary maps WEG insert'
);

select is(
  public.audit_event_summary('wirtschaftsplan', 'update', '{}'::jsonb),
  'Wirtschaftsplan aktualisiert',
  'audit_event_summary maps Wirtschaftsplan update'
);

select is(
  public.audit_event_summary(
    'weg',
    'insert',
    '{"bezeichnung":"Lindenstr. 12","name":"Ada Lovelace","email":"ada@example.test"}'::jsonb
  ),
  'WEG angelegt',
  'audit_event_summary does not expose payload labels'
);

select is(
  public.audit_entity_label(
    'weg',
    '{"name":"Lindenstr. 12"}'::jsonb,
    '11111111-1111-4111-8111-111111111111'::uuid
  ),
  'WEG #11111111',
  'audit_entity_label uses localized entity type and short event reference'
);

select is(
  public.audit_actor_label('agent', null),
  'KI-Agent',
  'audit_actor_label maps agent actor'
);

select is(
  public.audit_risk_flags(
    'agent',
    'service_role',
    '{"email":"ada@example.test","status":"warning"}'::jsonb
  )::text,
  '{service_role,agent,masked,integrity_warning}',
  'audit_risk_flags returns deterministic service_role, agent, masked, and integrity flags'
);

select ok(
  (
    select c.relrowsecurity
    from pg_catalog.pg_class as c
    where c.oid = 'public.audit_payload_reveal'::regclass
  ),
  'audit_payload_reveal has RLS enabled'
);

select ok(
  (
    select c.relforcerowsecurity
    from pg_catalog.pg_class as c
    where c.oid = 'public.audit_payload_reveal'::regclass
  ),
  'audit_payload_reveal has FORCE RLS enabled'
);

select ok(
  (
    select c.relrowsecurity
    from pg_catalog.pg_class as c
    where c.oid = 'public.audit_integrity_check'::regclass
  ),
  'audit_integrity_check has RLS enabled'
);

select ok(
  (
    select c.relforcerowsecurity
    from pg_catalog.pg_class as c
    where c.oid = 'public.audit_integrity_check'::regclass
  ),
  'audit_integrity_check has FORCE RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.audit_payload_reveal'::regclass
      and conname = 'audit_payload_reveal_event_fk'
  ),
  'audit_payload_reveal stores a composite FK to audit_event'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.audit_payload_reveal'::regclass
      and attname = 'audit_event_created_at'
      and not attisdropped
  ),
  'audit_payload_reveal stores audit_event_created_at for unambiguous reference'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = 'public.audit_payload_reveal'::regclass
      and tgname = 'audit_payload_reveal_audit_emit'
      and not tgisinternal
  ),
  'audit_payload_reveal emits an audit event'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = 'public.audit_integrity_check'::regclass
      and not tgisinternal
  ),
  'audit_integrity_check has no audit emit trigger'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'public.audit_payload_reveal'::regclass
      and polname = 'audit_payload_reveal_select_admin'
      and polcmd = 'r'
  ),
  'audit_payload_reveal has tenant_admin SELECT policy'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'public.audit_payload_reveal'::regclass
      and polname = 'audit_payload_reveal_insert_admin'
      and polcmd = 'a'
  ),
  'audit_payload_reveal has tenant_admin INSERT policy'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'public.audit_integrity_check'::regclass
      and polname = 'audit_integrity_check_select_admin'
      and polcmd = 'r'
  ),
  'audit_integrity_check has tenant_admin SELECT policy'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'public.audit_integrity_check'::regclass
      and polname = 'audit_integrity_check_insert_internal'
      and polcmd = 'a'
  ),
  'audit_integrity_check has internal INSERT policy for verify snapshots'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'public.audit_integrity_check'::regclass
      and polcmd in ('w', 'd', '*')
  ),
  'audit_integrity_check has no UPDATE, DELETE, or FOR ALL policies'
);

select ok(
  not (
    select p.prosecdef
    from pg_catalog.pg_proc as p
    where p.oid = 'public.audit_event_feed(timestamptz,timestamptz,text,text,text,text,text,timestamptz,bigint,integer)'::regprocedure
  ),
  'audit_event_feed is SECURITY INVOKER'
);

select is(
  (
    select p.provolatile
    from pg_catalog.pg_proc as p
    where p.oid = 'public.audit_event_feed(timestamptz,timestamptz,text,text,text,text,text,timestamptz,bigint,integer)'::regprocedure
  ),
  's'::"char",
  'audit_event_feed is STABLE'
);

select ok(
  not (
    select p.prosecdef
    from pg_catalog.pg_proc as p
    where p.oid = 'public.audit_reveal_event_payload(uuid,timestamptz)'::regprocedure
  ),
  'audit_reveal_event_payload is SECURITY INVOKER'
);

select ok(
  (
    select p.prosecdef
    from pg_catalog.pg_proc as p
    where p.oid = 'public.audit_integrity_status()'::regprocedure
  ),
  'audit_integrity_status is SECURITY DEFINER'
);

select ok(
  (
    select p.prosecdef
    from pg_catalog.pg_proc as p
    where p.oid = 'public.audit_verify_chain()'::regprocedure
  ),
  'audit_verify_chain is SECURITY DEFINER'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.audit_event_feed(timestamptz,timestamptz,text,text,text,text,text,timestamptz,bigint,integer)',
    'execute'
  ),
  'authenticated can execute audit_event_feed'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.audit_event_feed(timestamptz,timestamptz,text,text,text,text,text,timestamptz,bigint,integer)',
    'execute'
  ),
  'anon cannot execute audit_event_feed'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.audit_event_feed(timestamptz,timestamptz,text,text,text,text,text,timestamptz,bigint,integer)',
    'execute'
  ),
  'service_role cannot execute tenant-scoped audit_event_feed UI RPC'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.audit_reveal_event_payload(uuid,timestamptz)',
    'execute'
  ),
  'authenticated can execute reveal wrapper; tenant_admin guard is inside function'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.audit_reveal_event_payload(uuid,timestamptz)',
    'execute'
  ),
  'anon cannot execute reveal wrapper'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.audit_reveal_event_payload(uuid,timestamptz)',
    'execute'
  ),
  'service_role cannot execute full-payload reveal UI RPC'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.audit_verify_chain()',
    'execute'
  ),
  'authenticated can execute verify wrapper; tenant_admin guard is inside function'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.audit_verify_chain()',
    'execute'
  ),
  'anon cannot execute verify wrapper'
);

select is(
  (
    select array_agg(p.privilege order by p.privilege)
    from (values ('DELETE'), ('INSERT'), ('SELECT'), ('UPDATE')) as p(privilege)
    where has_table_privilege('authenticated', 'public.audit_payload_reveal', p.privilege)
  ),
  array['INSERT', 'SELECT']::text[],
  'authenticated table privileges on audit_payload_reveal are limited to INSERT and SELECT'
);

select is(
  (
    select array_agg(p.privilege order by p.privilege)
    from (values ('DELETE'), ('INSERT'), ('SELECT'), ('UPDATE')) as p(privilege)
    where has_table_privilege('authenticated', 'public.audit_integrity_check', p.privilege)
  ),
  array['SELECT']::text[],
  'authenticated table privileges on audit_integrity_check are limited to SELECT'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'audit_writer.verify_chain_repaired(uuid)',
    'execute'
  ),
  'authenticated cannot execute audit_writer.verify_chain_repaired directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'audit_writer.verify_chain(uuid)',
    'execute'
  ),
  'authenticated cannot execute audit_writer.verify_chain directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.audit_event', 'update'),
  'authenticated still has no UPDATE on audit_event'
);

select ok(
  not has_table_privilege('authenticated', 'public.audit_event', 'delete'),
  'authenticated still has no DELETE on audit_event'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'audit_event'
      and indexname = 'audit_event_tenant_created_seq_desc_idx'
  ),
  'audit feed cursor index exists'
);

select throws_ok(
  $$select * from public.audit_integrity_status()$$,
  '42501',
  'audit_integrity_status rejects callers without tenant_admin JWT role'
);

select throws_ok(
  $$select * from public.audit_verify_chain()$$,
  '42501',
  'audit_verify_chain rejects callers without tenant_admin JWT role'
);

select throws_ok(
  $$select public.audit_reveal_event_payload(
      '11111111-1111-4111-8111-111111111111'::uuid,
      now()
    )$$,
  '42501',
  'audit_reveal_event_payload rejects callers without tenant_admin JWT role before lookup'
);

select * from finish();

rollback;
