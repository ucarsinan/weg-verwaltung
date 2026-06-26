-- WEG-Verwaltung pgTAP regression tests for 0052 Vorgangszentrale foundation.
--
-- Scope:
--   - table/RLS/grant/policy catalogue contract
--   - conservative first-cut staff-only access
--   - tenant defaults and cross-tenant negative paths
--   - append-only timeline and agent-write guard
--   - representative audit emission
--
-- Runs in one transaction and rolls back all fixture rows. Does not touch any
-- remote/cloud project state by itself.

begin;

select plan(28);

-- ============================================================================
-- Catalogue contract
-- ============================================================================

select is(
  (
    select count(*)::int
    from unnest(array[
      'public.vorgang',
      'public.vorgang_inbox_item',
      'public.vorgang_task',
      'public.vorgang_timeline_event',
      'public.vorgang_relation',
      'public.vorgang_participant',
      'public.vorgang_visibility'
    ]) as t(regclass_name)
    where to_regclass(t.regclass_name) is not null
  ),
  7,
  'all Vorgangszentrale foundation tables exist'
);

select is(
  (
    select count(*)::int
    from pg_catalog.pg_class as c
    where c.oid = any(array[
      'public.vorgang'::regclass,
      'public.vorgang_inbox_item'::regclass,
      'public.vorgang_task'::regclass,
      'public.vorgang_timeline_event'::regclass,
      'public.vorgang_relation'::regclass,
      'public.vorgang_participant'::regclass,
      'public.vorgang_visibility'::regclass
    ])
      and c.relrowsecurity
  ),
  7,
  'all foundation tables have RLS enabled'
);

select is(
  (
    select count(*)::int
    from pg_catalog.pg_class as c
    where c.oid = any(array[
      'public.vorgang'::regclass,
      'public.vorgang_inbox_item'::regclass,
      'public.vorgang_task'::regclass,
      'public.vorgang_timeline_event'::regclass,
      'public.vorgang_relation'::regclass,
      'public.vorgang_participant'::regclass,
      'public.vorgang_visibility'::regclass
    ])
      and c.relforcerowsecurity
  ),
  7,
  'all foundation tables have FORCE RLS enabled'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_policy as p
    where p.polrelid = any(array[
      'public.vorgang'::regclass,
      'public.vorgang_inbox_item'::regclass,
      'public.vorgang_task'::regclass,
      'public.vorgang_timeline_event'::regclass,
      'public.vorgang_relation'::regclass,
      'public.vorgang_participant'::regclass,
      'public.vorgang_visibility'::regclass
    ])
      and p.polcmd = '*'::"char"
  ),
  'foundation tables have no FOR ALL policies'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_policy as p
    where p.polrelid = any(array[
      'public.vorgang'::regclass,
      'public.vorgang_inbox_item'::regclass,
      'public.vorgang_task'::regclass,
      'public.vorgang_timeline_event'::regclass,
      'public.vorgang_relation'::regclass,
      'public.vorgang_participant'::regclass,
      'public.vorgang_visibility'::regclass
    ])
      and p.polcmd = 'd'::"char"
  ),
  'foundation tables have no DELETE policies in the first cut'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'public.vorgang',
      'public.vorgang_inbox_item',
      'public.vorgang_task',
      'public.vorgang_timeline_event',
      'public.vorgang_relation',
      'public.vorgang_participant',
      'public.vorgang_visibility'
    ]) as t(regclass_name)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(privilege)
    where pg_catalog.has_table_privilege('anon', t.regclass_name, p.privilege)
  ),
  'anon has no table privileges on foundation tables'
);

select is(
  (
    select coalesce(array_agg(privilege order by privilege), array[]::text[])
    from (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(privilege)
    where pg_catalog.has_table_privilege(
      'authenticated',
      'public.vorgang_timeline_event',
      p.privilege
    )
  ),
  array['INSERT', 'SELECT']::text[],
  'authenticated has SELECT/INSERT only on append-only timeline'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'public.vorgang',
      'public.vorgang_inbox_item',
      'public.vorgang_task',
      'public.vorgang_relation',
      'public.vorgang_participant',
      'public.vorgang_visibility'
    ]) as t(regclass_name)
    where (
      select coalesce(array_agg(privilege order by privilege), array[]::text[])
      from (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(privilege)
      where pg_catalog.has_table_privilege('authenticated', t.regclass_name, p.privilege)
    ) <> array['INSERT', 'SELECT', 'UPDATE']::text[]
  ),
  'authenticated mutable table privileges are limited to SELECT/INSERT/UPDATE'
);

select is(
  (
    select count(*)::int
    from pg_catalog.pg_trigger
    where tgrelid = 'public.vorgang_timeline_event'::regclass
      and tgname in ('vorgang_timeline_event_no_update', 'vorgang_timeline_event_no_delete')
      and not tgisinternal
  ),
  2,
  'timeline has explicit UPDATE and DELETE append-only triggers'
);

select is(
  (
    select count(*)::int
    from pg_catalog.pg_trigger
    where tgrelid = any(array[
      'public.vorgang'::regclass,
      'public.vorgang_inbox_item'::regclass,
      'public.vorgang_task'::regclass,
      'public.vorgang_timeline_event'::regclass,
      'public.vorgang_relation'::regclass,
      'public.vorgang_participant'::regclass,
      'public.vorgang_visibility'::regclass
    ])
      and tgname like '%_no_agent_write'
      and not tgisinternal
  ),
  7,
  'all foundation tables are protected by the agent-write guard'
);

select is(
  (
    select count(*)::int
    from pg_catalog.pg_trigger
    where tgrelid = any(array[
      'public.vorgang'::regclass,
      'public.vorgang_inbox_item'::regclass,
      'public.vorgang_task'::regclass,
      'public.vorgang_timeline_event'::regclass,
      'public.vorgang_relation'::regclass,
      'public.vorgang_participant'::regclass,
      'public.vorgang_visibility'::regclass
    ])
      and tgname like '%_audit_emit'
      and not tgisinternal
  ),
  7,
  'all foundation tables emit audit events'
);

select is(
  (
    select count(*)::int
    from pg_catalog.pg_trigger
    where tgrelid = any(array[
      'public.vorgang'::regclass,
      'public.vorgang_inbox_item'::regclass,
      'public.vorgang_task'::regclass,
      'public.vorgang_participant'::regclass,
      'public.vorgang_visibility'::regclass
    ])
      and tgname like '%_set_updated_at'
      and not tgisinternal
  ),
  5,
  'all mutable timestamped foundation tables maintain updated_at'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = 'public.vorgang_relation'::regclass
      and tgname = 'vorgang_relation_tenant_guard'
      and not tgisinternal
  ),
  'polymorphic relation rows have tenant target validation'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = 'public.vorgang_task'::regclass
      and tgname = 'vorgang_task_completion'
      and not tgisinternal
  ),
  'task completion trigger exists'
);

-- ============================================================================
-- Runtime fixtures
-- ============================================================================

insert into public.tenant (id, name)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa52'::uuid, '0052 Tenant A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb52'::uuid, '0052 Tenant B')
on conflict (id) do update
set name = excluded.name;

insert into public.vorgang (id, tenant_id, title, typ)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-000000000052'::uuid,
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb52'::uuid,
  'Tenant B hidden Vorgang',
  'allgemein'
);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '11111111-1111-4111-8111-111111111152',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'tenant_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa52',
      'role', 'tenant_admin'
    )
  )::text,
  true
);

select lives_ok(
  $$insert into public.vorgang (id, title, typ)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-000000000052'::uuid, 'Eigentuemeranfrage pruefen', 'eigentuemeranfrage')$$,
  'tenant_admin can insert an own-tenant Vorgang through RLS'
);

select is(
  (
    select jsonb_build_object(
      'tenant_id', tenant_id,
      'status', status,
      'priority', priority,
      'visibility_state', visibility_state
    )
    from public.vorgang
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000052'::uuid
  )::text,
  jsonb_build_object(
    'tenant_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa52'::uuid,
    'status', 'draft',
    'priority', 'normal',
    'visibility_state', 'internal'
  )::text,
  'Vorgang tenant/status/priority/visibility defaults are conservative'
);

insert into public.vorgang_visibility (
  id,
  vorgang_id,
  scope
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-100000000052'::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-000000000052'::uuid,
  'eigentuemer'
);

select is(
  (
    select jsonb_build_object(
      'scope', scope,
      'is_portal_visible', is_portal_visible
    )
    from public.vorgang_visibility
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-100000000052'::uuid
  )::text,
  jsonb_build_object(
    'scope', 'eigentuemer',
    'is_portal_visible', false
  )::text,
  'visibility rows default to not portal-visible'
);

select is(
  (
    select count(*)::int
    from public.vorgang
    where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb52'::uuid
  ),
  0,
  'cross-tenant SELECT returns zero rows'
);

select throws_ok(
  $$insert into public.vorgang (tenant_id, title, typ)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb52'::uuid, 'evil', 'allgemein')$$,
  '42501',
  'cross-tenant INSERT is rejected by RLS'
);

select is(
  (
    with updated as (
      update public.vorgang
         set title = 'pwned'
       where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb52'::uuid
       returning 1
    )
    select count(*)::int from updated
  ),
  0,
  'cross-tenant UPDATE affects zero rows'
);

insert into public.vorgang_task (
  id,
  vorgang_id,
  title,
  status
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-200000000052'::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-000000000052'::uuid,
  'Antwort vorbereiten',
  'done'
);

select ok(
  (
    select completed_at is not null
    from public.vorgang_task
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-200000000052'::uuid
  ),
  'done task gets completed_at from trigger'
);

insert into public.vorgang_timeline_event (
  id,
  vorgang_id,
  event_type,
  summary
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-300000000052'::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-000000000052'::uuid,
  'note',
  'Erste interne Notiz'
);

reset role;

select throws_ok(
  $$update public.vorgang_timeline_event
       set summary = 'tampered'
     where id = 'aaaaaaaa-aaaa-4aaa-8aaa-300000000052'::uuid$$,
  'P0001',
  'timeline UPDATE is rejected by append-only trigger'
);

select throws_ok(
  $$delete from public.vorgang_timeline_event
     where id = 'aaaaaaaa-aaaa-4aaa-8aaa-300000000052'::uuid$$,
  'P0001',
  'timeline DELETE is rejected by append-only trigger'
);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '11111111-1111-4111-8111-111111111152',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'tenant_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa52',
      'role', 'tenant_admin'
    )
  )::text,
  true
);

select set_config('app.actor_type', 'agent', true);

select throws_ok(
  $$insert into public.vorgang (title, typ)
    values ('Agent must not create final Vorgang', 'allgemein')$$,
  '42501',
  'agent actor cannot write final Vorgang state'
);

select set_config('app.actor_type', '', true);

select throws_ok(
  $$insert into public.vorgang_relation (vorgang_id, relation_type, relation_id)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-000000000052'::uuid,
      'weg',
      '99999999-9999-4999-8999-999999999952'::uuid
    )$$,
  '23503',
  'relation target must exist in the same tenant'
);

update public.vorgang
   set status = 'open'
 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000052'::uuid;

reset role;

select is(
  (
    select count(*)::int
    from public.audit_event
    where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa52'::uuid
      and entity_typ = 'vorgang'
      and entity_id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000052'::uuid
      and action = 'vorgang.created'
  ),
  1,
  'vorgang insert emits semantic audit event'
);

select is(
  (
    select count(*)::int
    from public.audit_event
    where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa52'::uuid
      and entity_typ = 'vorgang'
      and entity_id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000052'::uuid
      and action = 'vorgang.status_changed'
  ),
  1,
  'vorgang status update emits semantic audit event'
);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '33333333-3333-4333-8333-333333333352',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'tenant_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa52',
      'role', 'beirat'
    )
  )::text,
  true
);

select is(
  (
    select count(*)::int
    from public.vorgang
  ),
  0,
  'external roles get no Vorgang read access until portal identity mapping is implemented'
);

select * from finish();

rollback;
