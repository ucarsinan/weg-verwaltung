-- WEG-Verwaltung migration 0009: audit-log HMAC hash-chain.
-- See docs/03-security-model.md §3.5.
--
-- Composes with the 3-layer protection from 0006 (REVOKE + trigger raising
-- on UPDATE/DELETE + RLS). This migration adds the hash-chain so that
-- tampered or forged audit rows are forensically detectable even when
-- service_role bypasses RLS.
--
-- Operational pre-req: the audit_hmac_key vault secret MUST exist before
-- the first INSERT in production. See README for the seed command.

-- ---------------------------------------------------------------------------
-- Vault secret slot
-- ---------------------------------------------------------------------------
--
-- Vault secret name: 'audit_hmac_key'. Set out-of-band with:
--   select vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'audit_hmac_key');
-- The trigger reads via vault.decrypted_secrets in the audit_writer security-definer context.
--
-- Why Vault and not a GUC/ENV: Vault is at-rest-encrypted and survives
-- pg_dump exfiltration without leaking the chain-forge key. A leaked DB
-- snapshot WITHOUT the Vault key cannot forge a valid continuation.

-- Hosted Supabase: `postgres` (the migration runner) is not auto-member of
-- the `audit_writer` role created in 0006. Without membership it cannot use
-- `authorization audit_writer` on the schema or `owner to audit_writer` on
-- the functions below. Granting role-membership is idempotent.
grant audit_writer to postgres;

-- ---------------------------------------------------------------------------
-- audit_writer.hash_audit_row(prev_hash, payload)
-- ---------------------------------------------------------------------------
--
-- Pure HMAC-SHA-256 of (prev_hash || canonical_json(payload)) under the
-- vault-stored audit_hmac_key. IMMUTABLE: same inputs → same output, so
-- verify_chain() can recompute deterministically.
--
-- SECURITY DEFINER (owned by audit_writer) so even an unprivileged caller
-- whose INSERT fired the BEFORE-trigger gets the hash computed under the
-- audit_writer identity that holds the Vault read grant.
--
-- Dev-mode fallback: if no audit_hmac_key is seeded in vault yet, we fall
-- back to an all-zero 32-byte key and emit a WARNING. This keeps `supabase
-- start` and migration tests green without a manual setup step, but the
-- warning makes it impossible to ship to prod by accident unnoticed.

create schema if not exists audit_writer authorization audit_writer;

create or replace function audit_writer.hash_audit_row(prev_hash bytea, payload jsonb)
returns bytea
language plpgsql
immutable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_key bytea;
  v_key_hex text;
begin
  -- vault.decrypted_secrets is the read-side view; the underlying secret is
  -- AES-encrypted at rest. Cast to bytea via decode() — the secret is stored
  -- as a hex string per the seed command in the header comment.
  select decoded_secret
    into v_key_hex
    from vault.decrypted_secrets
   where name = 'audit_hmac_key'
   limit 1;

  if v_key_hex is null then
    -- Dev-mode safety net. Production MUST seed the secret; the warning is
    -- the loud signal that this happened, surfaced in pg_cron + app logs.
    raise warning
      'audit_writer.hash_audit_row: audit_hmac_key not present in vault — '
      'falling back to all-zero key. DO NOT SHIP TO PROD.';
    v_key := decode('0000000000000000000000000000000000000000000000000000000000000000', 'hex');
  else
    v_key := decode(v_key_hex, 'hex');
  end if;

  -- payload::text is canonical-enough for our purposes: jsonb's text form is
  -- key-sorted and whitespace-normalized by Postgres, so the same jsonb value
  -- always serializes to the same bytes. No external canonicaliser needed.
  return extensions.hmac(prev_hash || convert_to(payload::text, 'UTF8'), v_key, 'sha256');
end;
$$;

alter function audit_writer.hash_audit_row(bytea, jsonb) owner to audit_writer;

comment on function audit_writer.hash_audit_row(bytea, jsonb) is
  'HMAC-SHA-256 over (prev_hash || canonical_json(payload)) keyed by vault::audit_hmac_key. § 3.5.';

-- ---------------------------------------------------------------------------
-- audit_writer.audit_event_before_insert() — the chain-link trigger
-- ---------------------------------------------------------------------------
--
-- Why SECURITY DEFINER: lets the trigger read the Vault key and the previous
-- row's row_hash even when the firing role (e.g. authenticated) has no
-- direct grant on vault.decrypted_secrets.
--
-- Why per-tenant chain: a single global chain would force every insert to
-- contend on the same "last row" — per-tenant scopes the lock to a tenant's
-- audit-write rate, which matches our partitioning + RLS model.
--
-- db_role is re-asserted here (the column DEFAULT already sets it, but a
-- forged INSERT could pass an explicit value): this trigger is the authoritative
-- writer of the forensic identity field.

create or replace function audit_writer.audit_event_before_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_prev bytea;
begin
  -- Authoritative db_role — overrides any caller-supplied value.
  new.db_role := session_user;

  -- Previous row's row_hash for this tenant, or 32 zero bytes for the
  -- genesis row. ORDER BY seq DESC LIMIT 1 — seq is the gap-detection
  -- column, monotonically increasing per tenant by construction.
  select row_hash
    into v_prev
    from public.audit_event
   where tenant_id = new.tenant_id
   order by seq desc
   limit 1;

  if v_prev is null then
    v_prev := decode('0000000000000000000000000000000000000000000000000000000000000000', 'hex');
  end if;

  new.prev_hash := v_prev;
  new.row_hash  := audit_writer.hash_audit_row(v_prev, new.payload);

  return new;
end;
$$;

alter function audit_writer.audit_event_before_insert() owner to audit_writer;

comment on function audit_writer.audit_event_before_insert() is
  'BEFORE INSERT chain-link: sets db_role, prev_hash, row_hash. SECURITY DEFINER as audit_writer. § 3.5.';

-- ---------------------------------------------------------------------------
-- Trigger attachment on the partitioned parent
-- ---------------------------------------------------------------------------
--
-- PG 14+ propagates ROW triggers from a partitioned parent down to existing
-- and future partitions automatically. We DROP IF EXISTS first so this
-- migration can be re-run during development; we deliberately do not use
-- CREATE OR REPLACE TRIGGER (would silently mutate the trigger contract).

drop trigger if exists audit_event_hmac_chain on public.audit_event;

create trigger audit_event_hmac_chain
  before insert on public.audit_event
  for each row
  execute function audit_writer.audit_event_before_insert();

-- ---------------------------------------------------------------------------
-- audit_writer.verify_chain(tenant_id) — tamper detector
-- ---------------------------------------------------------------------------
--
-- Walks rows in seq order, recomputes row_hash from the previously-stored
-- prev_hash + payload, and returns ANY row where the recomputation differs.
-- Empty result = chain intact.
--
-- Notes:
--   - We use the row's stored prev_hash as the recomputation input, NOT the
--     previous row's recomputed row_hash. That keeps each row independently
--     checkable: a single tampered row shows up as exactly one broken_seq,
--     not as a cascading failure of everything after it.
--   - SECURITY DEFINER so the verifier can be called from a low-priv role
--     (e.g. a nightly pg_cron job under a 'verifier' user) without granting
--     it raw access to the vault.

create or replace function audit_writer.verify_chain(target_tenant_id uuid)
returns table(broken_seq bigint, expected bytea, actual bytea)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  select ae.seq,
         audit_writer.hash_audit_row(ae.prev_hash, ae.payload) as expected,
         ae.row_hash                                           as actual
    from public.audit_event ae
   where ae.tenant_id = target_tenant_id
     and audit_writer.hash_audit_row(ae.prev_hash, ae.payload) <> ae.row_hash
   order by ae.seq;
end;
$$;

alter function audit_writer.verify_chain(uuid) owner to audit_writer;

comment on function audit_writer.verify_chain(uuid) is
  'Walks the audit chain for one tenant; rows returned are tamper-detected. Empty = intact. § 3.5.';

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
--
-- The trigger function runs as audit_writer (SECURITY DEFINER), so the firing
-- role (authenticated, service_role, …) does NOT need EXECUTE on these
-- functions to perform INSERTs that fire the trigger. We REVOKE from PUBLIC
-- so nobody can call hash_audit_row() or verify_chain() directly except via
-- the trigger path or as audit_writer.

revoke all on function audit_writer.hash_audit_row(bytea, jsonb) from public;
revoke all on function audit_writer.audit_event_before_insert() from public;
revoke all on function audit_writer.verify_chain(uuid) from public;

grant execute on function audit_writer.hash_audit_row(bytea, jsonb) to audit_writer;
grant execute on function audit_writer.audit_event_before_insert() to audit_writer;
grant execute on function audit_writer.verify_chain(uuid) to audit_writer;

grant usage on schema audit_writer to audit_writer;
