-- WEG-Verwaltung migration 0006: audit_event — append-only + tamper-evident.
-- See docs/03-security-model.md § 3.5 (3-layer protection + HMAC chain + pgaudit).
--
-- Three protection layers (defense in depth):
--   L1: REVOKE update, delete on audit_event from PUBLIC
--       → blocks honest mistakes + SQL-injection via authenticated role.
--   L2: BEFORE UPDATE OR DELETE OR TRUNCATE trigger → RAISE EXCEPTION
--       → fires even for service_role (triggers do, RLS doesn't).
--   L3: RLS in 0008_rls_policies.sql — only INSERT and SELECT policies;
--       no UPDATE/DELETE policy at all.
--
-- ----------------------------------------------------------------------------
-- HMAC HASH-CHAIN — DEFERRED
-- ----------------------------------------------------------------------------
-- The schema below already carries the prev_hash and row_hash columns, sized
-- as bytea (32 bytes for SHA-256 / HMAC-SHA-256). The HMAC computation —
-- per-tenant key fetched from Supabase Vault, prev_hash chained per tenant —
-- is intentionally DEFERRED to migration 0010_audit_hmac.sql to keep this
-- baseline migration reviewable. The chain pattern is:
--
--   row_hash = HMAC_SHA256(prev_hash || canonical_json(row), vault_key[tenant_id])
--
-- A nightly verify_chain() job walks the chain per tenant. A row inserted
-- with a forged prev_hash will break the chain at verification time.
-- See § 3.5 "HMAC-Hash-Chain" subsection.
-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- audit_writer role (§ 3.5)
-- ---------------------------------------------------------------------------
--
-- Dedicated DB-role used as the SECURITY DEFINER context for SECURITY DEFINER
-- audit-write triggers in business tables. The trigger function runs as
-- audit_writer regardless of who fires the trigger, so:
--   actor_user_id = auth.uid()          (App-Identität)
--   db_role        = session_user        (DB-Identität — exposes service_role forgery)
--
-- Stubbed here as `nologin` + minimal grants. The 0010_audit_hmac.sql migration
-- will own the actual write-trigger function.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'audit_writer') then
    create role audit_writer nologin;
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- public.audit_event — partitioned by month on created_at
-- ---------------------------------------------------------------------------

create table if not exists public.audit_event (
  id            uuid not null default gen_random_uuid(),
  tenant_id     uuid not null,
  seq           bigint generated always as identity,      -- gap-detection per § 3.5
  created_at    timestamptz not null default now(),
  actor_type    text not null check (actor_type in ('user', 'agent', 'system')),
  actor_user_id uuid,                                     -- nullable for system/agent
  db_role       text not null default session_user,       -- forensic — exposes service_role
  entity_typ    text not null,
  entity_id     uuid not null,
  action        text not null,
  payload       jsonb not null,
  prev_hash     bytea not null,                           -- filled by HMAC trigger (0010)
  row_hash      bytea not null,                           -- filled by HMAC trigger (0010)
  primary key (tenant_id, created_at, id)                 -- partition key must be in PK
) partition by range (created_at);

comment on table public.audit_event is
  'Append-only audit log. 3-layer protection (REVOKE + Trigger + RLS). HMAC hash-chain in 0010. See § 3.5.';
comment on column public.audit_event.db_role is
  'session_user at INSERT time. service_role forgery is forensically detectable: db_role = ''service_role''.';
comment on column public.audit_event.prev_hash is
  'HMAC chain link to prior row (per tenant). Filled by trigger in 0010_audit_hmac.sql.';
comment on column public.audit_event.row_hash is
  'HMAC_SHA256(prev_hash || canonical_json(row), vault_key). Filled by trigger in 0010_audit_hmac.sql.';

-- ---------------------------------------------------------------------------
-- Indexes (§ 3.5)
-- ---------------------------------------------------------------------------

create index if not exists audit_event_tenant_created_idx
  on public.audit_event (tenant_id, created_at desc);

create index if not exists audit_event_entity_idx
  on public.audit_event (entity_typ, entity_id);

create index if not exists audit_event_actor_created_idx
  on public.audit_event (actor_user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Monthly partitions — first month as stub.
-- A pg_cron job will create the next 12 months ahead (per § 3.5 "Partitioning")
-- in a follow-up migration (0011_audit_partition_rotation.sql).
-- ---------------------------------------------------------------------------

create table if not exists public.audit_event_2026_01
  partition of public.audit_event
  for values from ('2026-01-01 00:00:00+00') to ('2026-02-01 00:00:00+00');

-- Default partition catches rows whose date doesn't match a real partition —
-- safer than a missing-partition INSERT failure during boot.
create table if not exists public.audit_event_default
  partition of public.audit_event default;

-- ---------------------------------------------------------------------------
-- L1: REVOKE write privileges (§ 3.5 layer 1)
-- ---------------------------------------------------------------------------

revoke update, delete, truncate on public.audit_event from public;
revoke update, delete, truncate on public.audit_event_2026_01 from public;
revoke update, delete, truncate on public.audit_event_default from public;

-- audit_writer can INSERT; SELECT happens via RLS for authenticated.
grant insert, select on public.audit_event to audit_writer;
grant usage on schema public to audit_writer;

-- ---------------------------------------------------------------------------
-- L2: RAISE EXCEPTION trigger (§ 3.5 layer 2) — fires even for service_role
-- ---------------------------------------------------------------------------
--
-- NOTE: The HMAC chain (row_hash, prev_hash) is computed by a BEFORE INSERT
-- trigger added in 0010_audit_hmac.sql. Schema includes prev_hash + row_hash
-- columns ready for the HMAC trigger.

create or replace function public.tg_audit_event_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'audit_event is immutable (§ 3.5 layer 2). Operation % rejected for any role.',
    tg_op
    using errcode = '42501';   -- insufficient_privilege
end;
$$;

create trigger audit_event_no_update_delete
  before update or delete or truncate on public.audit_event
  for each statement
  execute function public.tg_audit_event_immutable();

-- Triggers do NOT automatically propagate to partitions in older Postgres
-- versions. PG 16 propagates ROW triggers on parent → partition automatically,
-- but STATEMENT triggers on partitioned tables fire only on the parent.
-- Attach to existing partitions explicitly for belt-and-braces:

create trigger audit_event_2026_01_no_update_delete
  before update or delete or truncate on public.audit_event_2026_01
  for each statement
  execute function public.tg_audit_event_immutable();

create trigger audit_event_default_no_update_delete
  before update or delete or truncate on public.audit_event_default
  for each statement
  execute function public.tg_audit_event_immutable();

comment on function public.tg_audit_event_immutable() is
  'Immutability enforcement for audit_event. Fires for ALL roles incl. service_role (§ 3.5 layer 2).';
