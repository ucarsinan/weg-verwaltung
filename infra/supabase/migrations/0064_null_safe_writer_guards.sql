-- WEG-Verwaltung migration 0064: NULL-safe writer guards (Sollstellung).
--
-- Symptom:
--   `insert into public.sollstellung (...)` succeeds from a privileged path
--   even though neither app.sollstellung_writer nor app.sollstellung_tenant_id
--   is set. The trigger public.tg_sollstellung_enforce_insert_only() is supposed
--   to be the table-level backstop for exactly that case and never raises.
--   Reproduced locally against a fresh `db reset` through 0063 (psql, role
--   postgres): both the generator check and the tenant check pass silently.
--
-- Root cause:
--   The same SQL-NULL trap that 0048 fixed for the Wirtschaftsplan lifecycle
--   guard. In normal operation the GUCs are not set at all, so
--   `nullif(current_setting(..., true), '')` yields NULL, and both
--   `NULL <> 'generator'` and `new.tenant_id::text <> NULL` evaluate to NULL
--   rather than TRUE. A plpgsql `if` treats NULL like FALSE, so the guard body
--   never runs and the guard fails OPEN instead of closed.
--
--   0040 introduced both comparisons with `<>`. 0042 and 0055 touched the
--   surrounding generator and policy, never these two lines, so 0040 is still
--   the effective definition of the function.
--
-- Blast radius today:
--   Limited, but the layer is genuinely inoperative. anon, authenticated and
--   service_role hold no INSERT/UPDATE/DELETE on public.sollstellung (0040), and
--   the RLS policy sollstellung_insert_generated uses `=`, which fails closed in
--   a WITH CHECK. The reachable callers are therefore the table owner and
--   SECURITY DEFINER paths — and it is precisely those paths the trigger exists
--   to constrain. Any future grant, or a new SECURITY DEFINER function that
--   forgets set_config, would write forged or cross-tenant Sollstellungen with
--   no error. Sollstellungen are the payment targets, so a silent write there is
--   a financial-integrity problem, not cosmetic.
--
-- Fix:
--   Forward-only create-or-replace of the trigger function with
--   `is distinct from` and an explicit NULL check on the tenant GUC. Exception
--   messages and SQLSTATEs are unchanged, so callers and existing contracts see
--   the same behaviour on the paths that already worked.
--
--   The Wirtschaftsplan lifecycle guard is re-asserted unchanged in the same
--   migration. Its body is already correct as of 0048 and verified blocking
--   locally (42501); this is drift insurance only, against the recorded-as-
--   applied-but-object-not-updated class documented in 0045/0058/0059. A fresh,
--   never-recorded migration is executed by `db push` even where an older
--   create-or-replace did not take effect on Cloud.
--
-- Risk posture:
--   - No RLS policy changes, no grant changes, no table changes, no data
--     migration. Function bodies only.
--   - No change to the audit chain, HMAC, partitions or append-only logic.
--   - Guards move from fail-open to fail-closed. The controlled generator paths
--     (0039/0042/0047/0060) all set both GUCs before writing, so they are
--     unaffected; anything that did not set them was never intended to write.
--   - Idempotent create-or-replace; safe to re-run and a no-op where already
--     correct.
--
-- Test strategy:
--   infra/supabase/tests/0064_null_safe_writer_guards.sql drives both guards
--   through real DML and asserts 42501 on every unset-GUC path, plus the
--   positive generator path. Listed in FINANCE_DB_TESTS, so it runs in the
--   `just test-db-all` CI gate.
--
-- Rollback / forward fix:
--   No rollback migration. A forward create-or-replace restoring the previous
--   body would reopen the hole; if a caller breaks, fix the caller to set both
--   GUCs instead.

-- ---------------------------------------------------------------------------
-- 1. Sollstellung writer guard — the actual fail-open bug
-- ---------------------------------------------------------------------------

create or replace function public.tg_sollstellung_enforce_insert_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_writer text;
  v_tenant text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Sollstellungen are historical records and cannot be updated or deleted.'
      using errcode = '42501';
  end if;

  -- `is distinct from` statt Ungleich-Operator: im Normalbetrieb sind die GUCs
  -- gar nicht gesetzt, die Variablen also NULL — und ein NULL-Vergleich ergibt
  -- NULL, nicht TRUE. Der Guard greift dann nie und faellt offen auf.
  -- Der Vertrag 0064 verankert das als Drift-Anker; nicht zurueckbauen.
  v_writer := nullif(pg_catalog.current_setting('app.sollstellung_writer', true), '');
  v_tenant := nullif(pg_catalog.current_setting('app.sollstellung_tenant_id', true), '');

  if v_writer is distinct from 'generator' then
    raise exception 'Direct writes to Sollstellungen are not allowed.'
      using errcode = '42501';
  end if;

  if v_tenant is null or new.tenant_id::text is distinct from v_tenant then
    raise exception 'Sollstellung generator tenant context mismatch.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.tg_sollstellung_enforce_insert_only()
  from public, anon, authenticated, service_role;

comment on function public.tg_sollstellung_enforce_insert_only() is
  'DB-side guard for historical Sollstellungen: only generator-context INSERT is allowed; UPDATE and DELETE always raise. Missing or empty app.sollstellung_writer / app.sollstellung_tenant_id fails closed.';

-- ---------------------------------------------------------------------------
-- 2. Wirtschaftsplan lifecycle guard — unchanged re-assertion (drift insurance)
-- ---------------------------------------------------------------------------
-- Body is byte-identical in intent to 0048 and already verified blocking
-- locally. Re-asserted only so a drifted Cloud object cannot keep the 0047
-- `<>` version alive. Do not "simplify" the comparisons back to `<>`.

create or replace function public.tg_wirtschaftsplan_lifecycle_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_manager text;
begin
  v_manager := nullif(pg_catalog.current_setting('app.wirtschaftsplan_lifecycle_manager', true), '');

  if tg_op = 'INSERT' then
    if new.status is null then
      new.status := 'entwurf';
    end if;

    if new.status <> 'entwurf' and v_manager is distinct from '1' then
      raise exception 'Wirtschaftsplan must be inserted as entwurf.'
        using errcode = '23514';
    end if;

    return new;
  end if;

  if (
    old.status is distinct from new.status
    or old.aktiviert_am is distinct from new.aktiviert_am
    or old.abgeloest_am is distinct from new.abgeloest_am
    or old.archiviert_am is distinct from new.archiviert_am
  ) and v_manager is distinct from '1' then
    raise exception 'Wirtschaftsplan lifecycle transitions must use lifecycle RPCs.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.tg_wirtschaftsplan_lifecycle_guard() from public;

comment on function public.tg_wirtschaftsplan_lifecycle_guard() is
  'Blocks direct Wirtschaftsplan lifecycle DML unless a lifecycle RPC sets app.wirtschaftsplan_lifecycle_manager=1. Missing or empty GUC fails closed.';

notify pgrst, 'reload schema';
