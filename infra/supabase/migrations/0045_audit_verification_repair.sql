-- WEG-Verwaltung migration 0045: repair deployed audit verification.
--
-- Cloud records 0043/0044 as applied, but the expected 0043 repair objects
-- are absent and audit_writer.verify_chain(uuid) fails with insufficient
-- audit_event read privileges. This migration is forward-only:
--
--   - no UPDATE/DELETE/TRUNCATE on public.audit_event
--   - no reconstruction of historical hashes
--   - legacy rows remain legacy evidence
--   - new rows are verified from a tenant-specific checkpoint forward

begin;

grant audit_writer to postgres;

lock table public.audit_event in share row exclusive mode;

create index if not exists audit_event_tenant_seq_desc_idx
  on public.audit_event (tenant_id, seq desc);

create table if not exists audit_writer.audit_chain_repair_checkpoint (
  tenant_id              uuid primary key,
  repaired_at            timestamptz not null default statement_timestamp(),
  valid_after_seq        bigint,
  valid_after_created_at timestamptz,
  valid_after_event_id   uuid,
  valid_after_row_hash   bytea not null,
  repaired_by_migration  text not null default '0045_audit_verification_repair',
  note                   text not null default
    '0045 forward-only repair: v2 chain is valid for audit_event rows with seq > valid_after_seq; if valid_after_seq is NULL, from the tenant genesis row.',

  constraint audit_chain_repair_checkpoint_hash_len
    check (octet_length(valid_after_row_hash) = 32),
  constraint audit_chain_repair_checkpoint_anchor_complete
    check (
      (valid_after_seq is null and valid_after_created_at is null and valid_after_event_id is null)
      or
      (valid_after_seq is not null and valid_after_created_at is not null and valid_after_event_id is not null)
    )
);

-- If an environment has the local 0043 table shape, preserve compatibility and
-- mark pre-0045 checkpoint rows so this migration can advance them exactly once.
alter table audit_writer.audit_chain_repair_checkpoint
  add column if not exists repaired_by_migration text not null default '0043_or_unknown';

alter table audit_writer.audit_chain_repair_checkpoint
  alter column repaired_by_migration set default '0045_audit_verification_repair';

do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'audit_writer.audit_chain_repair_checkpoint'::regclass
       and conname = 'audit_chain_repair_checkpoint_hash_len'
  ) then
    alter table audit_writer.audit_chain_repair_checkpoint
      add constraint audit_chain_repair_checkpoint_hash_len
      check (octet_length(valid_after_row_hash) = 32);
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'audit_writer.audit_chain_repair_checkpoint'::regclass
       and conname = 'audit_chain_repair_checkpoint_anchor_complete'
  ) then
    alter table audit_writer.audit_chain_repair_checkpoint
      add constraint audit_chain_repair_checkpoint_anchor_complete
      check (
        (valid_after_seq is null and valid_after_created_at is null and valid_after_event_id is null)
        or
        (valid_after_seq is not null and valid_after_created_at is not null and valid_after_event_id is not null)
      );
  end if;
end
$$;

alter table audit_writer.audit_chain_repair_checkpoint owner to postgres;
revoke all on audit_writer.audit_chain_repair_checkpoint
  from public, anon, authenticated, service_role;
grant select, insert on audit_writer.audit_chain_repair_checkpoint to audit_writer;

comment on table audit_writer.audit_chain_repair_checkpoint is
  'Per-tenant forward checkpoint for audit-chain repair. Historical audit_event rows are not rewritten.';
comment on column audit_writer.audit_chain_repair_checkpoint.valid_after_seq is
  'Last legacy audit_event.seq at repair time. v2 verification starts with rows whose seq is greater.';
comment on column audit_writer.audit_chain_repair_checkpoint.valid_after_row_hash is
  'Anchor hash for the first v2 row. Zero hash means the tenant had no earlier audit_event rows.';
comment on column audit_writer.audit_chain_repair_checkpoint.repaired_by_migration is
  'Migration version that established the current forward verification boundary.';

-- 0044 narrowed audit_writer to the previous-row trigger read. The repaired
-- verifier needs the full immutable audit envelope, still tenant-bound by RLS.
revoke select on public.audit_event from audit_writer;
grant select (
  id,
  tenant_id,
  seq,
  created_at,
  actor_type,
  actor_user_id,
  db_role,
  entity_typ,
  entity_id,
  action,
  payload,
  prev_hash,
  row_hash
) on public.audit_event to audit_writer;

drop policy if exists audit_event_chain_read_for_audit_writer on public.audit_event;
create policy audit_event_chain_read_for_audit_writer
  on public.audit_event for select to audit_writer
  using (
    tenant_id::text = nullif(
      pg_catalog.current_setting('app.audit_chain_tenant_id', true),
      ''
    )
  );

comment on policy audit_event_chain_read_for_audit_writer on public.audit_event is
  '0045 repair: audit_writer can read audit_event only for app.audit_chain_tenant_id; column grants expose only the audit envelope needed by trigger/verifier.';

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
set search_path = ''
as $$
declare
  v_key bytea;
  v_key_hex text;
  v_canonical jsonb;
  v_input bytea;
begin
  if p_prev_hash is null or pg_catalog.octet_length(p_prev_hash) <> 32 then
    raise exception 'audit_writer.hash_audit_event_v2: prev_hash must be 32 bytes.'
      using errcode = '22023';
  end if;

  begin
    select pg_catalog.btrim(decrypted_secret)
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

  if v_key_hex !~ '^[0-9a-fA-F]{64}$' then
    raise exception
      'audit_writer.hash_audit_event_v2: audit_hmac_key must be a 32-byte hex string.'
      using errcode = '22023';
  end if;

  v_key := pg_catalog.decode(v_key_hex, 'hex');
  v_canonical := pg_catalog.jsonb_build_object(
    'version', 2,
    'tenant_id', p_tenant_id,
    'seq', p_seq,
    'created_at_utc', pg_catalog.to_char(p_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'actor_type', p_actor_type,
    'actor_user_id', p_actor_user_id,
    'db_role', p_db_role,
    'entity_typ', p_entity_typ,
    'entity_id', p_entity_id,
    'action', p_action,
    'payload', p_payload
  );
  v_input := p_prev_hash || pg_catalog.convert_to(v_canonical::text, 'UTF8');

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
  'v2 HMAC over prev_hash plus canonical audit metadata and payload. Valid from the tenant repair checkpoint forward.';

create or replace function audit_writer.audit_event_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
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

  -- Serialize per tenant so concurrent inserts cannot fork the chain.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.tenant_id::text, 45)
  );

  new.db_role := session_user;

  -- FORCE RLS permits the previous-row lookup only while this local tenant
  -- context is set by the internal chain-link trigger.
  perform pg_catalog.set_config('app.audit_chain_tenant_id', new.tenant_id::text, true);

  select ae.seq, ae.created_at, ae.id, ae.row_hash
    into v_anchor_seq, v_anchor_created_at, v_anchor_event_id, v_prev
    from public.audit_event as ae
   where ae.tenant_id = new.tenant_id
   order by ae.seq desc
   limit 1;

  perform pg_catalog.set_config('app.audit_chain_tenant_id', '', true);

  if v_prev is null then
    v_prev := pg_catalog.decode('0000000000000000000000000000000000000000000000000000000000000000', 'hex');
  end if;

  insert into audit_writer.audit_chain_repair_checkpoint (
    tenant_id,
    repaired_at,
    valid_after_seq,
    valid_after_created_at,
    valid_after_event_id,
    valid_after_row_hash,
    repaired_by_migration,
    note
  ) values (
    new.tenant_id,
    pg_catalog.statement_timestamp(),
    v_anchor_seq,
    v_anchor_created_at,
    v_anchor_event_id,
    v_prev,
    '0045_audit_verification_repair',
    '0045 lazy checkpoint: v2 chain is valid for audit_event rows inserted after this tenant boundary.'
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
exception
  when others then
    perform pg_catalog.set_config('app.audit_chain_tenant_id', '', true);
    raise;
end;
$$;

alter function audit_writer.audit_event_before_insert() owner to audit_writer;
revoke all on function audit_writer.audit_event_before_insert()
  from public, anon, authenticated, service_role;
grant execute on function audit_writer.audit_event_before_insert() to audit_writer;

comment on function audit_writer.audit_event_before_insert() is
  '0045 v2 chain-link trigger: tenant advisory lock, tenant-bound previous-row read, forward checkpoint, metadata+payload HMAC.';

drop trigger if exists audit_event_hmac_chain on public.audit_event;
create trigger audit_event_hmac_chain
  before insert on public.audit_event
  for each row
  execute function audit_writer.audit_event_before_insert();

-- Establish the 0045 boundary once for tenants that already have audit rows.
-- This updates only the internal repair checkpoint artifact when an older
-- local 0043 checkpoint exists; public.audit_event remains untouched.
with latest_per_tenant as (
  select distinct on (ae.tenant_id)
    ae.tenant_id,
    ae.seq,
    ae.created_at,
    ae.id,
    ae.row_hash
  from public.audit_event as ae
  order by ae.tenant_id, ae.seq desc
)
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
  lpt.tenant_id,
  statement_timestamp(),
  lpt.seq,
  lpt.created_at,
  lpt.id,
  lpt.row_hash,
  '0045_audit_verification_repair',
  '0045 forward checkpoint: all existing audit_event rows are legacy; v2 verification starts with later rows.'
from latest_per_tenant as lpt
on conflict (tenant_id) do update
set repaired_at = excluded.repaired_at,
    valid_after_seq = excluded.valid_after_seq,
    valid_after_created_at = excluded.valid_after_created_at,
    valid_after_event_id = excluded.valid_after_event_id,
    valid_after_row_hash = excluded.valid_after_row_hash,
    repaired_by_migration = excluded.repaired_by_migration,
    note = excluded.note
where audit_writer.audit_chain_repair_checkpoint.repaired_by_migration
  is distinct from '0045_audit_verification_repair';

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
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if target_tenant_id is null then
    raise exception 'target_tenant_id must not be null.'
      using errcode = '22023';
  end if;

  perform pg_catalog.set_config('app.audit_chain_tenant_id', target_tenant_id::text, true);

  return query
  with checkpoint as (
    select
      c.valid_after_seq,
      c.valid_after_created_at,
      c.valid_after_event_id,
      c.valid_after_row_hash
    from audit_writer.audit_chain_repair_checkpoint as c
    where c.tenant_id = target_tenant_id
  ),
  scoped as (
    select
      ae.tenant_id,
      ae.seq,
      ae.created_at,
      ae.actor_type,
      ae.actor_user_id,
      ae.db_role,
      ae.entity_typ,
      ae.entity_id,
      ae.action,
      ae.payload,
      ae.prev_hash,
      ae.row_hash,
      c.valid_after_seq,
      c.valid_after_created_at,
      c.valid_after_event_id,
      c.valid_after_row_hash
    from checkpoint as c
    join public.audit_event as ae
      on ae.tenant_id = target_tenant_id
     and (c.valid_after_seq is null or ae.seq > c.valid_after_seq)
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

  perform pg_catalog.set_config('app.audit_chain_tenant_id', '', true);
exception
  when others then
    perform pg_catalog.set_config('app.audit_chain_tenant_id', '', true);
    raise;
end;
$$;

alter function audit_writer.verify_chain_repaired(uuid) owner to audit_writer;
revoke all on function audit_writer.verify_chain_repaired(uuid)
  from public, anon, authenticated, service_role;
grant execute on function audit_writer.verify_chain_repaired(uuid) to audit_writer;

comment on function audit_writer.verify_chain_repaired(uuid) is
  'Verifies the v2 audit chain from the tenant checkpoint forward; legacy rows are intentionally outside scope.';

create or replace function audit_writer.verify_chain(target_tenant_id uuid)
returns table(broken_seq bigint, expected bytea, actual bytea)
language sql
volatile
security definer
set search_path = ''
as $$
  select
    repaired.broken_seq,
    case
      when repaired.reason = 'prev_hash_continuity_mismatch'
        then repaired.expected_prev_hash
      else repaired.expected_row_hash
    end as expected,
    case
      when repaired.reason = 'prev_hash_continuity_mismatch'
        then repaired.actual_prev_hash
      else repaired.actual_row_hash
    end as actual
  from audit_writer.verify_chain_repaired(target_tenant_id) as repaired;
$$;

alter function audit_writer.verify_chain(uuid) owner to audit_writer;
revoke all on function audit_writer.verify_chain(uuid)
  from public, anon, authenticated, service_role;
grant execute on function audit_writer.verify_chain(uuid) to audit_writer;

comment on function audit_writer.verify_chain(uuid) is
  'Compatibility wrapper over verify_chain_repaired(uuid). Validates v2 rows from the recorded tenant checkpoint forward.';

notify pgrst, 'reload schema';

commit;
