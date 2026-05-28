-- WEG-Verwaltung migration 0012: audit_event partition rotation.
-- See docs/03-security-model.md § 3.5 (monthly partitioning, 24-month
-- hot, then cold-storage detach).
--
-- pg_cron job that pre-creates the next 12 monthly partitions on
-- audit_event. Runs on the 1st of each month at 02:00 UTC. Idempotent
-- via `create … if not exists`.

-- ---------------------------------------------------------------------------
-- audit_writer.rotate_audit_partitions(months_ahead int)
-- ---------------------------------------------------------------------------
--
-- For each month in [now(), now() + months_ahead months], create the
-- monthly partition of public.audit_event if it doesn't exist yet.
-- Range bounds are [first-of-month, first-of-next-month) so partitions
-- tile the timeline without overlap. SECURITY DEFINER under audit_writer
-- because partition creation requires CREATE on schema public, which
-- the authenticated role does not have.

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

    -- Belt-and-braces: REVOKE writes on the new partition (parent REVOKE
    -- does NOT propagate to partitions created after it). Statement-level
    -- immutability trigger on the parent fires for partition rows in
    -- PG 16+, so we only need the L1 REVOKE here.
    execute format(
      'revoke update, delete, truncate on public.%I from public',
      v_part_name
    );
  end loop;
end;
$$;

revoke all on function audit_writer.rotate_audit_partitions(int) from public;
grant execute on function audit_writer.rotate_audit_partitions(int) to audit_writer;

comment on function audit_writer.rotate_audit_partitions(int) is
  'Idempotently create monthly partitions for audit_event up to N months ahead. '
  'Scheduled by pg_cron at 02:00 UTC on the 1st of each month (see 0012).';

-- ---------------------------------------------------------------------------
-- Schedule via pg_cron — runs 02:00 UTC on the 1st of each month
-- ---------------------------------------------------------------------------
--
-- cron.schedule() is idempotent on (jobname): a second call with the
-- same name returns the existing jobid. To stay safe across re-applies,
-- we unschedule any prior version of the job first (no-op on first run).

do $$
begin
  perform cron.unschedule('audit-partition-rotation-monthly')
  where exists (
    select 1 from cron.job where jobname = 'audit-partition-rotation-monthly'
  );
exception when undefined_table or undefined_function then
  -- pg_cron not installed (e.g. very minimal local stack) — skip silently.
  null;
end$$;

select cron.schedule(
  'audit-partition-rotation-monthly',
  '0 2 1 * *',                              -- 02:00 UTC on the 1st
  $$select audit_writer.rotate_audit_partitions(12)$$
);

-- ---------------------------------------------------------------------------
-- Bootstrap — run once now so partitions exist immediately after migrate
-- ---------------------------------------------------------------------------

select audit_writer.rotate_audit_partitions(12);

-- ---------------------------------------------------------------------------
-- Cold-storage rule (§ 3.5): partitions older than 24 months are
-- detached and exported to Supabase Storage (S3-Glacier-equivalent).
-- That logic ships in a follow-up migration once the storage
-- bucket + IAM are designed. 10-year retention from WEG-Recht
-- §28 Abs. 6 is enforced operationally, not in this trigger.
-- ---------------------------------------------------------------------------
