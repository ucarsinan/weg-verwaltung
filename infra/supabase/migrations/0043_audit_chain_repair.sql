-- WEG-Verwaltung migration 0043: audit chain repair from a forward checkpoint.
--
-- This migration is intentionally additive and does not rewrite historical
-- audit_event rows. Existing rows keep their legacy row_hash values. The
-- repaired v2 chain is valid per tenant for rows inserted after the checkpoint
-- captured below:
--
--   audit_writer.audit_chain_repair_checkpoint.valid_after_seq
--
-- For existing tenants, valid_after_* points to the last audit_event row that
-- existed when this migration ran. The first later row must use that row_hash
-- as prev_hash. For tenants without earlier audit events, valid_after_seq is
-- NULL and the v2 chain is valid from the genesis row.
--
-- Repairs:
--   1. Serializes audit inserts per tenant with a transaction advisory lock,
--      preventing concurrent rows from reading the same previous row_hash.
--   2. Hashes immutable audit metadata in addition to payload, so tampering
--      with actor/action/entity/created_at/seq is detectable.
--   3. Verifies both row_hash recomputation and prev_hash continuity.

create index if not exists audit_event_tenant_seq_desc_idx
  on public.audit_event (tenant_id, seq desc);

create table if not exists audit_writer.audit_chain_repair_checkpoint (
  tenant_id              uuid primary key,
  repaired_at            timestamptz not null default statement_timestamp(),
  valid_after_seq        bigint,
  valid_after_created_at timestamptz,
  valid_after_event_id   uuid,
  valid_after_row_hash   bytea not null,
  note                   text not null default
    '0043 forward-only repair: v2 chain is valid for audit_event rows with seq > valid_after_seq; if valid_after_seq is NULL, from the tenant genesis row.',

  constraint audit_chain_repair_checkpoint_hash_len
    check (octet_length(valid_after_row_hash) = 32),
  constraint audit_chain_repair_checkpoint_anchor_complete
    check (
      (valid_after_seq is null and valid_after_created_at is null and valid_after_event_id is null)
      or
      (valid_after_seq is not null and valid_after_created_at is not null and valid_after_event_id is not null)
    )
);

alter table audit_writer.audit_chain_repair_checkpoint owner to audit_writer;
revoke all on audit_writer.audit_chain_repair_checkpoint from public, anon, authenticated, service_role;
grant select, insert on audit_writer.audit_chain_repair_checkpoint to audit_writer;

comment on table audit_writer.audit_chain_repair_checkpoint is
  'Per-tenant forward checkpoint for the 0043 audit-chain repair. Historical audit_event rows are not rewritten.';
comment on column audit_writer.audit_chain_repair_checkpoint.valid_after_seq is
  'Last legacy audit_event.seq at migration/checkpoint time. v2 verification starts with rows whose seq is greater.';
comment on column audit_writer.audit_chain_repair_checkpoint.valid_after_row_hash is
  'Anchor hash for the first v2 row. Zero hash means the tenant had no earlier audit_event rows.';

create or replace function audit_writer.hash_audit_event_v2(
  p_prev_hash bytea,
  p_tenant_id uuid,
  p_seq bigint,
  p_created_at timestamptz,
  p_actor_type text,
  p_actor_user_id uuid,
  p_db_role text,
  p_entity_typ text,
  p_entity_id uuid,
  p_action text,
  p_payload jsonb
)
returns bytea
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_key bytea;
  v_key_hex text;
  v_canonical jsonb;
  v_input bytea;
begin
  if p_prev_hash is null or octet_length(p_prev_hash) <> 32 then
    raise exception 'audit_writer.hash_audit_event_v2: prev_hash must be 32 bytes.'
      using errcode = '22023';
  end if;

  begin
    select decrypted_secret
      into v_key_hex
      from vault.decrypted_secrets
     where name = 'audit_hmac_key'
     limit 1;
  exception
    when others then
      raise exception
        'audit_writer.hash_audit_event_v2: audit_hmac_key is not readable from Vault (% - %).',
        sqlstate, sqlerrm
        using errcode = '42501';
  end;

  if v_key_hex is null then
    raise exception
      'audit_writer.hash_audit_event_v2: audit_hmac_key not present in Vault.'
      using errcode = 'P0002';
  end if;

  v_key := decode(v_key_hex, 'hex');

  v_canonical := jsonb_build_object(
    'version', 2,
    'tenant_id', p_tenant_id,
    'seq', p_seq,
    'created_at_utc', to_char(p_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'actor_type', p_actor_type,
    'actor_user_id', p_actor_user_id,
    'db_role', p_db_role,
    'entity_typ', p_entity_typ,
    'entity_id', p_entity_id,
    'action', p_action,
    'payload', p_payload
  );
  v_input := p_prev_hash || convert_to(v_canonical::text, 'UTF8');

  begin
    return extensions.hmac(v_input, v_key, 'sha256');
  exception
    when others then
      raise exception
        'audit_writer.hash_audit_event_v2: extensions.hmac unavailable (% - %).',
        sqlstate, sqlerrm
        using errcode = '42501';
  end;
end;
$$;

alter function audit_writer.hash_audit_event_v2(
  bytea, uuid, bigint, timestamptz, text, uuid, text, text, uuid, text, jsonb
) owner to audit_writer;
revoke all on function audit_writer.hash_audit_event_v2(
  bytea, uuid, bigint, timestamptz, text, uuid, text, text, uuid, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function audit_writer.hash_audit_event_v2(
  bytea, uuid, bigint, timestamptz, text, uuid, text, text, uuid, text, jsonb
) to audit_writer;

comment on function audit_writer.hash_audit_event_v2(
  bytea, uuid, bigint, timestamptz, text, uuid, text, text, uuid, text, jsonb
) is
  'v2 HMAC over prev_hash plus canonical audit metadata and payload. Valid from 0043 repair checkpoint forward.';

create or replace function audit_writer.audit_event_before_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_prev bytea;
  v_anchor_seq bigint;
  v_anchor_created_at timestamptz;
  v_anchor_event_id uuid;
begin
  if new.tenant_id is null then
    raise exception 'audit_event.tenant_id must not be null.'
      using errcode = '23502';
  end if;

  -- Serialize per tenant. Without this, concurrent inserts can both read the
  -- same previous row_hash and create a fork that only continuity checks catch.
  perform pg_advisory_xact_lock(hashtextextended(new.tenant_id::text, 43));

  new.db_role := session_user;

  select ae.seq, ae.created_at, ae.id, ae.row_hash
    into v_anchor_seq, v_anchor_created_at, v_anchor_event_id, v_prev
    from public.audit_event as ae
   where ae.tenant_id = new.tenant_id
   order by ae.seq desc
   limit 1;

  if v_prev is null then
    v_prev := decode('0000000000000000000000000000000000000000000000000000000000000000', 'hex');
  end if;

  insert into audit_writer.audit_chain_repair_checkpoint (
    tenant_id,
    repaired_at,
    valid_after_seq,
    valid_after_created_at,
    valid_after_event_id,
    valid_after_row_hash
  ) values (
    new.tenant_id,
    statement_timestamp(),
    v_anchor_seq,
    v_anchor_created_at,
    v_anchor_event_id,
    v_prev
  )
  on conflict (tenant_id) do nothing;

  new.prev_hash := v_prev;
  new.row_hash := audit_writer.hash_audit_event_v2(
    v_prev,
    new.tenant_id,
    new.seq,
    new.created_at,
    new.actor_type,
    new.actor_user_id,
    new.db_role,
    new.entity_typ,
    new.entity_id,
    new.action,
    new.payload
  );

  return new;
end;
$$;

alter function audit_writer.audit_event_before_insert() owner to audit_writer;
revoke all on function audit_writer.audit_event_before_insert()
  from public, anon, authenticated, service_role;
grant execute on function audit_writer.audit_event_before_insert() to audit_writer;

comment on function audit_writer.audit_event_before_insert() is
  '0043 v2 chain-link trigger: tenant advisory lock, forward checkpoint, metadata+payload HMAC.';

insert into audit_writer.audit_chain_repair_checkpoint (
  tenant_id,
  repaired_at,
  valid_after_seq,
  valid_after_created_at,
  valid_after_event_id,
  valid_after_row_hash
)
select
  t.id,
  statement_timestamp(),
  last_event.seq,
  last_event.created_at,
  last_event.id,
  coalesce(
    last_event.row_hash,
    decode('0000000000000000000000000000000000000000000000000000000000000000', 'hex')
  )
from public.tenant as t
left join lateral (
  select ae.seq, ae.created_at, ae.id, ae.row_hash
    from public.audit_event as ae
   where ae.tenant_id = t.id
   order by ae.seq desc
   limit 1
) as last_event on true
on conflict (tenant_id) do nothing;

create or replace function audit_writer.verify_chain_repaired(target_tenant_id uuid)
returns table(
  broken_seq bigint,
  reason text,
  expected_prev_hash bytea,
  actual_prev_hash bytea,
  expected_row_hash bytea,
  actual_row_hash bytea,
  valid_after_seq bigint,
  valid_after_created_at timestamptz,
  valid_after_event_id uuid
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with checkpoint as (
    select
      c.valid_after_seq,
      c.valid_after_created_at,
      c.valid_after_event_id,
      c.valid_after_row_hash
    from audit_writer.audit_chain_repair_checkpoint as c
    where c.tenant_id = target_tenant_id
  ),
  fallback_checkpoint as (
    select
      null::bigint as valid_after_seq,
      null::timestamptz as valid_after_created_at,
      null::uuid as valid_after_event_id,
      decode('0000000000000000000000000000000000000000000000000000000000000000', 'hex') as valid_after_row_hash
    where not exists (select 1 from checkpoint)
  ),
  effective_checkpoint as (
    select * from checkpoint
    union all
    select * from fallback_checkpoint
  ),
  scoped as (
    select
      ae.*,
      ec.valid_after_seq,
      ec.valid_after_created_at,
      ec.valid_after_event_id,
      ec.valid_after_row_hash
    from effective_checkpoint as ec
    join public.audit_event as ae
      on ae.tenant_id = target_tenant_id
     and (ec.valid_after_seq is null or ae.seq > ec.valid_after_seq)
  ),
  expected as (
    select
      s.*,
      coalesce(
        lag(s.row_hash) over (order by s.seq),
        s.valid_after_row_hash
      ) as computed_prev_hash,
      audit_writer.hash_audit_event_v2(
        s.prev_hash,
        s.tenant_id,
        s.seq,
        s.created_at,
        s.actor_type,
        s.actor_user_id,
        s.db_role,
        s.entity_typ,
        s.entity_id,
        s.action,
        s.payload
      ) as computed_row_hash
    from scoped as s
  )
  select
    e.seq as broken_seq,
    case
      when e.prev_hash <> e.computed_prev_hash
       and e.row_hash <> e.computed_row_hash
        then 'prev_hash_continuity_and_row_hash_mismatch'
      when e.prev_hash <> e.computed_prev_hash
        then 'prev_hash_continuity_mismatch'
      else 'row_hash_mismatch'
    end as reason,
    e.computed_prev_hash as expected_prev_hash,
    e.prev_hash as actual_prev_hash,
    e.computed_row_hash as expected_row_hash,
    e.row_hash as actual_row_hash,
    e.valid_after_seq,
    e.valid_after_created_at,
    e.valid_after_event_id
  from expected as e
  where e.prev_hash <> e.computed_prev_hash
     or e.row_hash <> e.computed_row_hash
  order by e.seq;
$$;

alter function audit_writer.verify_chain_repaired(uuid) owner to audit_writer;
revoke all on function audit_writer.verify_chain_repaired(uuid)
  from public, anon, authenticated, service_role;
grant execute on function audit_writer.verify_chain_repaired(uuid) to audit_writer;

comment on function audit_writer.verify_chain_repaired(uuid) is
  'Verifies the 0043 v2 audit chain from the tenant checkpoint forward; old rows are intentionally outside scope.';

create or replace function audit_writer.verify_chain(target_tenant_id uuid)
returns table(broken_seq bigint, expected bytea, actual bytea)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    r.broken_seq,
    case
      when r.reason = 'prev_hash_continuity_mismatch'
        then r.expected_prev_hash
      else r.expected_row_hash
    end as expected,
    case
      when r.reason = 'prev_hash_continuity_mismatch'
        then r.actual_prev_hash
      else r.actual_row_hash
    end as actual
  from audit_writer.verify_chain_repaired(target_tenant_id) as r;
$$;

alter function audit_writer.verify_chain(uuid) owner to audit_writer;
revoke all on function audit_writer.verify_chain(uuid)
  from public, anon, authenticated, service_role;
grant execute on function audit_writer.verify_chain(uuid) to audit_writer;

comment on function audit_writer.verify_chain(uuid) is
  'Compatibility wrapper over verify_chain_repaired(uuid). Validates 0043 v2 rows from the recorded checkpoint forward.';

notify pgrst, 'reload schema';
