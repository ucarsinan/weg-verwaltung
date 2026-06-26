-- WEG-Verwaltung pgTAP regression tests for the repaired audit HMAC chain.
--
-- Scope: 0045 forward audit repair and compatibility wrapper.
-- Runs in one transaction and rolls back all runtime audit/checkpoint rows.
--
-- Audit Contract Matrix:
--   - v2 Insert: new rows recompute with hash_audit_event_v2(metadata+payload).
--   - Prev-Hash Continuity: each tenant links only to its own prior row.
--   - Checkpoint Boundary: verifier starts at seq > valid_after_seq and uses
--     valid_after_row_hash as the first verified anchor.
--   - Wrapper Behaviour: verify_chain() mirrors verify_chain_repaired().
--   - Legacy Segment: rows at or before valid_after_seq are outside the v2
--     verifier window and are not rewritten by this test.
--   - Verified Segment: rows after the boundary are verified and failures are
--     tenant-scoped.
--
-- Intentional corruption is modeled by inserting a bad checkpoint anchor before
-- the first row for a throwaway tenant. This exercises verify_chain_repaired()
-- without disabling triggers or mutating public.audit_event.

begin;

set local search_path = public, extensions;

select plan(31);

do $$
begin
  if to_regprocedure('audit_writer.hash_audit_event_v2(bytea,uuid,bigint,timestamptz,text,uuid,text,text,uuid,text,jsonb)') is null then
    raise exception 'Missing audit_writer.hash_audit_event_v2(). Apply migrations through 0045.';
  end if;

  if to_regprocedure('audit_writer.verify_chain_repaired(uuid)') is null then
    raise exception 'Missing audit_writer.verify_chain_repaired(). Apply migrations through 0045.';
  end if;

  if to_regclass('audit_writer.audit_chain_repair_checkpoint') is null then
    raise exception 'Missing audit_writer.audit_chain_repair_checkpoint. Apply migrations through 0045.';
  end if;
end
$$;

create temporary table audit_chain_fixture (
  tenant_label text not null,
  row_label text not null,
  tenant_id uuid not null,
  event_id uuid not null,
  seq bigint not null,
  created_at timestamptz not null,
  prev_hash bytea not null,
  row_hash bytea not null,
  actor_type text not null,
  actor_user_id uuid,
  db_role text not null,
  entity_typ text not null,
  entity_id uuid not null,
  action text not null,
  payload jsonb not null,
  primary key (tenant_label, row_label)
) on commit drop;

create temporary table audit_chain_repaired_result (
  tenant_label text not null,
  broken_seq bigint not null,
  reason text not null,
  expected_prev_hash bytea,
  actual_prev_hash bytea,
  expected_row_hash bytea,
  actual_row_hash bytea,
  valid_after_seq bigint,
  valid_after_created_at timestamptz,
  valid_after_event_id uuid
) on commit drop;

create temporary table audit_chain_wrapper_result (
  tenant_label text not null,
  broken_seq bigint not null,
  expected bytea,
  actual bytea
) on commit drop;

-- Remove any leftover local value before exercising SECURITY DEFINER functions
-- that deliberately set app.audit_chain_tenant_id themselves.
select set_config('app.audit_chain_tenant_id', '', true);

with tenant_values as (
  select *
  from (values
    ('tenant_a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid),
    ('tenant_b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::uuid)
  ) as v(tenant_label, tenant_id)
),
inserted as (
  insert into public.audit_event (
    tenant_id,
    actor_type,
    actor_user_id,
    entity_typ,
    entity_id,
    action,
    payload
  )
  select
    tv.tenant_id,
    'user',
    case
      when tv.tenant_label = 'tenant_a' then '11111111-1111-4111-8111-111111111111'::uuid
      else '22222222-2222-4222-8222-222222222222'::uuid
    end,
    'audit-chain-contract',
    gen_random_uuid(),
    'event_' || gs.n::text,
    jsonb_build_object(
      'tenant_label', tv.tenant_label,
      'event_number', gs.n,
      'source', '0045_0046_regression_test'
    )
  from tenant_values as tv
  cross join generate_series(1, 3) as gs(n)
  order by gs.n, tv.tenant_label
  returning
    id,
    tenant_id,
    seq,
    created_at,
    prev_hash,
    row_hash,
    actor_type,
    actor_user_id,
    db_role,
    entity_typ,
    entity_id,
    action,
    payload
)
insert into audit_chain_fixture (
  tenant_label,
  row_label,
  tenant_id,
  event_id,
  seq,
  created_at,
  prev_hash,
  row_hash,
  actor_type,
  actor_user_id,
  db_role,
  entity_typ,
  entity_id,
  action,
  payload
)
select
  case
    when i.tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid then 'tenant_a'
    else 'tenant_b'
  end,
  i.action,
  i.tenant_id,
  i.id,
  i.seq,
  i.created_at,
  i.prev_hash,
  i.row_hash,
  i.actor_type,
  i.actor_user_id,
  i.db_role,
  i.entity_typ,
  i.entity_id,
  i.action,
  i.payload
from inserted as i;

select is(
  (select count(*)::int from audit_chain_fixture),
  6,
  'fixture inserted three audit rows for each tenant'
);

select is(
  (select count(*)::int
     from audit_writer.audit_chain_repair_checkpoint
    where tenant_id in (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::uuid
    )),
  2,
  'insert trigger creates one repair checkpoint per tenant'
);

select is(
  (select count(*)::int
     from audit_chain_fixture
    where octet_length(prev_hash) = 32
      and octet_length(row_hash) = 32),
  6,
  'all inserted v2 rows have 32-byte prev_hash and row_hash'
);

select is(
  (select prev_hash
     from audit_chain_fixture
    where tenant_label = 'tenant_a'
      and row_label = 'event_1'),
  decode('0000000000000000000000000000000000000000000000000000000000000000', 'hex'),
  'fresh tenant A genesis row starts from zero hash'
);

select is(
  (select prev_hash
     from audit_chain_fixture
    where tenant_label = 'tenant_b'
      and row_label = 'event_1'),
  decode('0000000000000000000000000000000000000000000000000000000000000000', 'hex'),
  'fresh tenant B genesis row starts from zero hash'
);

select is(
  (
    select count(*)::int
    from (
      select
        tenant_label,
        row_label,
        prev_hash,
        lag(row_hash) over (partition by tenant_label order by seq) as expected_prev_hash
      from audit_chain_fixture
    ) as links
    where expected_prev_hash is not null
      and prev_hash <> expected_prev_hash
  ),
  0,
  'prev_hash continuity is per-tenant and does not cross tenant boundaries'
);

select is(
  (select count(*)::int
     from audit_chain_fixture as f
    where f.row_hash = audit_writer.hash_audit_event_v2(
      f.prev_hash,
      f.tenant_id,
      f.seq,
      f.created_at,
      f.actor_type,
      f.actor_user_id,
      f.db_role,
      f.entity_typ,
      f.entity_id,
      f.action,
      f.payload
    )),
  6,
  'hash_audit_event_v2 recomputes every stored trigger hash'
);

select isnt(
  (
    select audit_writer.hash_audit_event_v2(
      f.prev_hash,
      f.tenant_id,
      f.seq,
      f.created_at,
      f.actor_type,
      f.actor_user_id,
      f.db_role,
      f.entity_typ,
      f.entity_id,
      f.action || '_changed',
      f.payload
    )
    from audit_chain_fixture as f
    where f.tenant_label = 'tenant_a'
      and f.row_label = 'event_1'
  ),
  (
    select row_hash
    from audit_chain_fixture
    where tenant_label = 'tenant_a'
      and row_label = 'event_1'
  ),
  'hash_audit_event_v2 binds immutable metadata, not only payload'
);

select throws_ok(
  $$select audit_writer.hash_audit_event_v2(
      decode('00', 'hex'),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
      1,
      statement_timestamp(),
      'user',
      null,
      'postgres',
      'audit-chain-contract',
      gen_random_uuid(),
      'bad-prev',
      '{}'::jsonb
    )$$,
  '22023',
  'audit_writer.hash_audit_event_v2: prev_hash must be 32 bytes.',
  'hash_audit_event_v2 rejects non-32-byte prev_hash input'
);

select is(
  (select count(*)::int
     from audit_writer.verify_chain_repaired('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid)),
  0,
  'verify_chain_repaired reports tenant A chain intact'
);

select is(
  (select count(*)::int
     from audit_writer.verify_chain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid)),
  0,
  'verify_chain wrapper reports tenant A chain intact'
);

select is(
  (select count(*)::int
     from audit_writer.verify_chain_repaired('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::uuid)),
  0,
  'verify_chain_repaired reports tenant B chain intact'
);

select is(
  (select count(*)::int
     from audit_writer.verify_chain('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::uuid)),
  0,
  'verify_chain wrapper reports tenant B chain intact'
);

update audit_writer.audit_chain_repair_checkpoint as c
set valid_after_seq = f.seq,
    valid_after_created_at = f.created_at,
    valid_after_event_id = f.event_id,
    valid_after_row_hash = f.row_hash,
    repaired_by_migration = '0045_audit_verification_repair',
    note = 'pgTAP fixture: tenant A verification starts after event_1.'
from audit_chain_fixture as f
where f.tenant_label = 'tenant_a'
  and f.row_label = 'event_1'
  and c.tenant_id = f.tenant_id;

select is(
  (
    select valid_after_seq
    from audit_writer.audit_chain_repair_checkpoint
    where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid
  ),
  (
    select seq
    from audit_chain_fixture
    where tenant_label = 'tenant_a'
      and row_label = 'event_1'
  ),
  'checkpoint boundary can be moved inside the rollback-only fixture'
);

select is(
  (
    select valid_after_row_hash
    from audit_writer.audit_chain_repair_checkpoint
    where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid
  ),
  (
    select row_hash
    from audit_chain_fixture
    where tenant_label = 'tenant_a'
      and row_label = 'event_1'
  ),
  'checkpoint stores the legacy anchor hash for the first verified row'
);

select is(
  (
    select prev_hash
    from audit_chain_fixture
    where tenant_label = 'tenant_a'
      and row_label = 'event_2'
  ),
  (
    select valid_after_row_hash
    from audit_writer.audit_chain_repair_checkpoint
    where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid
  ),
  'first verified tenant A row is anchored to valid_after_row_hash'
);

select is(
  (select count(*)::int
     from audit_writer.verify_chain_repaired('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid)),
  0,
  'verified rows after the checkpoint boundary remain intact'
);

select is(
  (select count(*)::int
     from audit_writer.verify_chain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid)),
  0,
  'verify_chain wrapper remains intact after checkpoint boundary shift'
);

with boundary as (
  select coalesce(max(seq), 0) as current_max_seq
  from public.audit_event
),
bad_checkpoint as (
  insert into audit_writer.audit_chain_repair_checkpoint (
    tenant_id,
    repaired_at,
    valid_after_seq,
    valid_after_created_at,
    valid_after_event_id,
    valid_after_row_hash,
    repaired_by_migration,
    note
  )
  select
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'::uuid,
    statement_timestamp(),
    current_max_seq,
    statement_timestamp(),
    gen_random_uuid(),
    decode('1111111111111111111111111111111111111111111111111111111111111111', 'hex'),
    '0045_audit_verification_repair',
    'pgTAP fixture: intentionally bad anchor for continuity regression.'
  from boundary
  returning tenant_id
),
bad_insert as (
  insert into public.audit_event (
    tenant_id,
    actor_type,
    actor_user_id,
    entity_typ,
    entity_id,
    action,
    payload
  )
  select
    tenant_id,
    'system',
    null,
    'audit-chain-contract',
    gen_random_uuid(),
    'bad_checkpoint_anchor',
    '{"source":"0045_0046_regression_test","intentional":"bad_checkpoint_anchor"}'::jsonb
  from bad_checkpoint
  returning
    id,
    tenant_id,
    seq,
    created_at,
    prev_hash,
    row_hash,
    actor_type,
    actor_user_id,
    db_role,
    entity_typ,
    entity_id,
    action,
    payload
)
insert into audit_chain_fixture (
  tenant_label,
  row_label,
  tenant_id,
  event_id,
  seq,
  created_at,
  prev_hash,
  row_hash,
  actor_type,
  actor_user_id,
  db_role,
  entity_typ,
  entity_id,
  action,
  payload
)
select
  'tenant_bad',
  action,
  tenant_id,
  id,
  seq,
  created_at,
  prev_hash,
  row_hash,
  actor_type,
  actor_user_id,
  db_role,
  entity_typ,
  entity_id,
  action,
  payload
from bad_insert;

select is(
  (select prev_hash from audit_chain_fixture where tenant_label = 'tenant_bad'),
  decode('0000000000000000000000000000000000000000000000000000000000000000', 'hex'),
  'bad-anchor tenant insert still gets the trigger-computed zero prev_hash'
);

select is(
  (
    select row_hash
    from audit_chain_fixture as f
    where f.tenant_label = 'tenant_bad'
  ),
  (
    select audit_writer.hash_audit_event_v2(
      f.prev_hash,
      f.tenant_id,
      f.seq,
      f.created_at,
      f.actor_type,
      f.actor_user_id,
      f.db_role,
      f.entity_typ,
      f.entity_id,
      f.action,
      f.payload
    )
    from audit_chain_fixture as f
    where f.tenant_label = 'tenant_bad'
  ),
  'bad-anchor tenant row hash is valid; only checkpoint continuity is corrupted'
);

insert into audit_chain_repaired_result
select 'tenant_bad', r.*
from audit_writer.verify_chain_repaired('cccccccc-cccc-4ccc-8ccc-ccccccccccc1'::uuid) as r;

insert into audit_chain_wrapper_result
select 'tenant_bad', w.*
from audit_writer.verify_chain('cccccccc-cccc-4ccc-8ccc-ccccccccccc1'::uuid) as w;

select is(
  (select count(*)::int from audit_chain_repaired_result where tenant_label = 'tenant_bad'),
  1,
  'verify_chain_repaired reports exactly one row for the intentionally bad checkpoint anchor'
);

select is(
  (select reason from audit_chain_repaired_result where tenant_label = 'tenant_bad'),
  'prev_hash_continuity_mismatch',
  'bad checkpoint anchor is classified as a prev_hash continuity mismatch'
);

select is(
  (select broken_seq from audit_chain_repaired_result where tenant_label = 'tenant_bad'),
  (select seq from audit_chain_fixture where tenant_label = 'tenant_bad'),
  'verify_chain_repaired reports the first post-boundary row for bad anchor corruption'
);

select is(
  (select count(*)::int from audit_chain_wrapper_result where tenant_label = 'tenant_bad'),
  1,
  'verify_chain wrapper returns the bad-anchor verifier failure'
);

select is(
  (select broken_seq from audit_chain_wrapper_result where tenant_label = 'tenant_bad'),
  (select broken_seq from audit_chain_repaired_result where tenant_label = 'tenant_bad'),
  'verify_chain wrapper preserves broken_seq from verify_chain_repaired'
);

select is(
  (select expected from audit_chain_wrapper_result where tenant_label = 'tenant_bad'),
  (select expected_prev_hash from audit_chain_repaired_result where tenant_label = 'tenant_bad'),
  'verify_chain wrapper maps expected to expected_prev_hash for continuity mismatch'
);

select is(
  (select actual from audit_chain_wrapper_result where tenant_label = 'tenant_bad'),
  (select actual_prev_hash from audit_chain_repaired_result where tenant_label = 'tenant_bad'),
  'verify_chain wrapper maps actual to actual_prev_hash for continuity mismatch'
);

select is(
  (select count(*)::int
     from audit_writer.verify_chain_repaired('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid)),
  0,
  'tenant A remains valid while the bad-anchor tenant is corrupted'
);

select is(
  (select count(*)::int
     from audit_writer.verify_chain_repaired('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::uuid)),
  0,
  'tenant B remains valid while the bad-anchor tenant is corrupted'
);

select is(
  (select count(*)::int
     from audit_writer.verify_chain_repaired('dddddddd-dddd-4ddd-8ddd-ddddddddddd1'::uuid)),
  0,
  'unknown tenant verifier call returns zero broken rows'
);

select is(
  nullif(current_setting('app.audit_chain_tenant_id', true), ''),
  null,
  'verifier clears app.audit_chain_tenant_id after execution'
);

select finish();

rollback;
