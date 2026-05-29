-- WEG-Verwaltung migration 0014: enforce RLS on partition tables.
-- See docs/03-security-model.md § 3.4 (Mandanten-Iso via RLS — Invariante 1).
--
-- Postgres does not propagate RLS from a partitioned parent to its child
-- partitions: ENABLE RLS on the parent is a no-op for partitions created
-- before OR after it. PostgREST exposes every public table — including
-- partitions — as its own /rest/v1/<name> endpoint, so without explicit
-- ENABLE+FORCE RLS the partitions are a direct bypass around the per-tenant
-- isolation set up in 0008.
--
-- This migration:
--   1. Back-fills RLS on every existing child partition of audit_event and
--      embedding (catches partitions created by 0006, 0010, and 0012's
--      bootstrap call).
--   2. Replaces audit_writer.rotate_audit_partitions() so every NEW monthly
--      audit_event partition gets RLS enforced at creation time.
--
-- Policy choice: we ENABLE+FORCE without adding any partition-specific
-- policies. Direct partition access through PostgREST returns 0 rows
-- (deny-by-default). All legitimate access goes through the parent table,
-- where the parent's 0008 policies still apply via partition routing.

-- ---------------------------------------------------------------------------
-- 1) Backfill RLS on existing partitions of public.audit_event + public.embedding
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select c.oid::regclass::text as tbl
      from pg_class c
      join pg_inherits i on i.inhrelid = c.oid
     where i.inhparent in (
       'public.audit_event'::regclass,
       'public.embedding'::regclass
     )
  loop
    execute format('alter table %s enable row level security', r.tbl);
    execute format('alter table %s force row level security', r.tbl);
  end loop;
end$$;

-- ---------------------------------------------------------------------------
-- 2) Replace rotate_audit_partitions so future partitions are born with RLS
-- ---------------------------------------------------------------------------

create or replace function audit_writer.rotate_audit_partitions(
  months_ahead int default 12
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i              int;
  v_month_start  timestamptz;
  v_month_end    timestamptz;
  v_part_name    text;
  v_sql          text;
begin
  for i in 0..months_ahead loop
    v_month_start := date_trunc('month', now()) + make_interval(months => i);
    v_month_end   := v_month_start + interval '1 month';
    v_part_name   := format('audit_event_%s', to_char(v_month_start, 'YYYY_MM'));

    v_sql := format(
      'create table if not exists public.%I partition of public.audit_event '
      'for values from (%L) to (%L)',
      v_part_name, v_month_start, v_month_end
    );
    execute v_sql;

    -- RLS on the new partition: parent policies are not inherited (see header).
    execute format('alter table public.%I enable row level security', v_part_name);
    execute format('alter table public.%I force row level security', v_part_name);

    -- Belt-and-braces: REVOKE writes on the new partition (parent REVOKE
    -- does NOT propagate to partitions created after it).
    execute format(
      'revoke update, delete, truncate on public.%I from public',
      v_part_name
    );
  end loop;
end;
$$;

-- Re-assert grants (create or replace resets them on some PG versions).
revoke all on function audit_writer.rotate_audit_partitions(int) from public;
grant execute on function audit_writer.rotate_audit_partitions(int) to audit_writer;

comment on function audit_writer.rotate_audit_partitions(int) is
  'Idempotently create monthly partitions for audit_event up to N months ahead, '
  'with RLS enforced on each new partition. Scheduled by pg_cron at 02:00 UTC '
  'on the 1st of each month (see 0012). Replaced in 0014 to add RLS.';

-- ---------------------------------------------------------------------------
-- Note for future embedding partitions (0010 header rotation plan)
-- ---------------------------------------------------------------------------
--
-- When `embedding` is re-partitioned (modulus N>1) per the rotation plan
-- in 0010, every new `embedding_p<i>` MUST be created with:
--
--   alter table public.embedding_p<i> enable row level security;
--   alter table public.embedding_p<i> force row level security;
--
-- The 0010 runbook should be updated to include these two statements in
-- the partition-creation block. This migration only back-fills existing
-- partitions; it does not introduce a rotation function for embedding.
