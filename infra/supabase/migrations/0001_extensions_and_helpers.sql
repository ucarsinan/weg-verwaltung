-- WEG-Verwaltung migration 0001: extensions + auth helper functions.
-- See docs/03-security-model.md § 3.3 (auth.has_role) and § 3.5 (pgaudit).
--
-- Extensions are idempotent (`if not exists`). Helpers use `create or replace`.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

-- pgcrypto: gen_random_uuid(), HMAC primitives for the audit hash-chain (0010).
create extension if not exists "pgcrypto";

-- pg_cron: scheduled jobs (audit-partition rotation, frist-scan agent triggers).
-- Supabase pre-enables this; on bare Postgres it needs superuser + shared_preload_libraries.
create extension if not exists "pg_cron";

-- pg_net: async HTTP from inside Postgres (webhook fan-out, agent triggers).
create extension if not exists "pg_net";

-- pgaudit: statement-level Postgres logs (DDL, role changes, raw SQL).
-- Orthogonal to public.audit_event (semantic events). See § 3.5 "pgaudit — orthogonal".
create extension if not exists "pgaudit";

-- ---------------------------------------------------------------------------
-- Auth helper functions (§ 3.3)
-- ---------------------------------------------------------------------------

-- Predicate against the role claim in app_metadata. Used by RLS policies and
-- Server Actions. `STABLE` so Postgres can wrap it in InitPlan caching when used
-- inside (SELECT auth.has_role(...)) — same pattern as auth.jwt() in § 3.4.
create or replace function auth.has_role(target_role text)
returns boolean
language sql
stable
as $$
  select (auth.jwt() -> 'app_metadata' ->> 'role') = target_role;
$$;

comment on function auth.has_role(text) is
  'True if the JWT app_metadata.role matches target_role. See docs/03-security-model.md § 3.3.';

-- Convenience accessor for the tenant_id claim — single source of truth for the
-- (SELECT auth.jwt() -> ''app_metadata'' ->> ''tenant_id'')::uuid pattern that
-- every public.* table uses as RLS predicate and column default (§ 3.4 item 4).
create or replace function auth.tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid;
$$;

comment on function auth.tenant_id() is
  'Returns the caller''s tenant_id from JWT app_metadata. NULL for anon. See § 3.4 item 4.';
