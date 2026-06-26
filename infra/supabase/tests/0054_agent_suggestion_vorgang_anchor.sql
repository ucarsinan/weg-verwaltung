-- WEG-Verwaltung pgTAP regression tests for 0054 agent_suggestion Vorgang anchor.
--
-- Scope:
--   - nullable Vorgang anchor column on public.agent_suggestion
--   - tenant-scoped composite FK to public.vorgang
--   - partial lookup index for anchored suggestions
--   - existing tenant RLS still governs authenticated inserts
--
-- Runs in one transaction and rolls back all fixture rows. Does not touch any
-- remote/cloud project state by itself.

begin;

select plan(7);

-- ============================================================================
-- Catalogue contract
-- ============================================================================

select ok(
  exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.agent_suggestion'::regclass
      and attname = 'vorgang_id'
      and atttypid = 'pg_catalog.uuid'::regtype
      and not attnotnull
      and not attisdropped
  ),
  'agent_suggestion.vorgang_id exists as nullable uuid'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.agent_suggestion'::regclass
      and confrelid = 'public.vorgang'::regclass
      and conname = 'agent_suggestion_vorgang_fk'
      and contype = 'f'
      and confdeltype = 'r'
      and conkey = array[
        (
          select attnum
          from pg_catalog.pg_attribute
          where attrelid = 'public.agent_suggestion'::regclass
            and attname = 'tenant_id'
        ),
        (
          select attnum
          from pg_catalog.pg_attribute
          where attrelid = 'public.agent_suggestion'::regclass
            and attname = 'vorgang_id'
        )
      ]::smallint[]
      and confkey = array[
        (
          select attnum
          from pg_catalog.pg_attribute
          where attrelid = 'public.vorgang'::regclass
            and attname = 'tenant_id'
        ),
        (
          select attnum
          from pg_catalog.pg_attribute
          where attrelid = 'public.vorgang'::regclass
            and attname = 'id'
        )
      ]::smallint[]
  ),
  'agent_suggestion has tenant-scoped Vorgang FK with ON DELETE RESTRICT'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    join pg_catalog.pg_index as i on i.indexrelid = c.oid
    where n.nspname = 'public'
      and c.relname = 'agent_suggestion_vorgang_status_idx'
      and i.indrelid = 'public.agent_suggestion'::regclass
      and pg_catalog.pg_get_indexdef(i.indexrelid) =
        'CREATE INDEX agent_suggestion_vorgang_status_idx ON public.agent_suggestion USING btree (tenant_id, vorgang_id, status, created_at DESC) WHERE (vorgang_id IS NOT NULL)'
  ),
  'anchored suggestion partial status index exists'
);

-- ============================================================================
-- Runtime fixtures
-- ============================================================================

insert into public.tenant (id, name)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa54'::uuid, '0054 Tenant A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb54'::uuid, '0054 Tenant B')
on conflict (id) do update
set name = excluded.name;

insert into public.vorgang (id, tenant_id, title, typ)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-000000000054'::uuid,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa54'::uuid,
    '0054 Tenant A Vorgang',
    'allgemein'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-000000000054'::uuid,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb54'::uuid,
    '0054 Tenant B Vorgang',
    'allgemein'
  );

set local role authenticated;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '11111111-1111-4111-8111-111111111154',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'tenant_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa54',
      'role', 'tenant_admin'
    )
  )::text,
  true
);

select lives_ok(
  $$insert into public.agent_suggestion (
      id,
      vorgang_id,
      actor_type,
      vorschlag_typ,
      payload
    ) values (
      'aaaaaaaa-aaaa-4aaa-8aaa-100000000054'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-000000000054'::uuid,
      'agent',
      'vorgang_summary',
      '{"summary":"Bitte pruefen."}'::jsonb
    )$$,
  'tenant_admin can insert an own-tenant anchored agent suggestion'
);

select is(
  (
    select tenant_id
    from public.agent_suggestion
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-100000000054'::uuid
  ),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa54'::uuid,
  'own-tenant anchored suggestion stores tenant from JWT default'
);

select throws_ok(
  $$insert into public.agent_suggestion (
      id,
      vorgang_id,
      actor_type,
      vorschlag_typ,
      payload
    ) values (
      'aaaaaaaa-aaaa-4aaa-8aaa-200000000054'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-000000000054'::uuid,
      'agent',
      'vorgang_summary',
      '{"summary":"Cross tenant should fail."}'::jsonb
    )$$,
  '23503',
  'cross-tenant Vorgang anchor is rejected by composite FK'
);

select throws_ok(
  $$insert into public.agent_suggestion (
      id,
      vorgang_id,
      actor_type,
      vorschlag_typ,
      payload
    ) values (
      'aaaaaaaa-aaaa-4aaa-8aaa-300000000054'::uuid,
      '99999999-9999-4999-8999-999999999954'::uuid,
      'agent',
      'vorgang_summary',
      '{"summary":"Missing Vorgang should fail."}'::jsonb
    )$$,
  '23503',
  'nonexistent Vorgang anchor is rejected by composite FK'
);

select * from finish();

rollback;
