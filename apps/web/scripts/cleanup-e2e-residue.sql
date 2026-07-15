-- Cleanup for E2E-generated Cloud residue (weg-verwaltung, Cloud Frankfurt).
--
-- DESIGNED, NOT EXECUTED. This file was written for review after the
-- 2026-07-14 Cloud E2E session (see docs/agent-reports/2026-07-14-worker-
-- general-cloud-e2e-first-run.md). No agent has run this against Cloud.
-- Review every section before running any of it, ideally in a single Supabase
-- Studio SQL Editor session so COMMIT/ROLLBACK is your call at the end.
--
-- ============================================================================
-- WHY THIS CANNOT BE A PLAIN "DELETE FROM weg WHERE name LIKE '...'"
-- ============================================================================
--
-- 1. Nearly every table that references `weg`/`tenant` does so with
--    `on delete restrict` (verified across the migrations: unit, ownership,
--    meeting, document, wirtschaftsplan, verteilungsschluessel, vorgang,
--    vorgang_inbox_item, tenant_member -> tenant). A naive DELETE on `weg`
--    fails with 23503 unless every child row is gone first, in the right
--    order.
--
-- 2. `beschluss_sammlung_entry` (0005_beschluss_sammlung.sql) is append-only
--    by design: a BEFORE UPDATE OR DELETE OR TRUNCATE trigger rejects the
--    operation unconditionally, even for service_role. This is a documented,
--    intentional invariant (AGENTS.md: "BeschlussSammlungEntry ist
--    append-only"). It references `meeting`, which references `weg` — both
--    also `on delete restrict`.
--
--    CONSEQUENCE: any WEG whose E2E run ever created a Beschlussvorlage
--    (versammlungen.spec.ts: "Beschlussvorlage anlegen", "Einladung
--    versenden" if it reaches that step) can NEVER be fully deleted through
--    this or any script, short of Supabase-support-assisted partition
--    surgery. That is not a bug in this script — it is the audit/append-only
--    design working as intended. Those WEGs will show up in the "skipped"
--    output below and stay in the Cloud project. This is accepted, disclosed
--    residue, not a cleanup failure to chase further.
--
-- 3. `audit_event` has NO foreign key to `weg`/`tenant` (entity_id is a
--    polymorphic soft-reference, not a real FK) — it does NOT block deleting
--    the tables above. Rows will become orphaned references after cleanup,
--    which is consistent with audit_event being designed to outlive the
--    business rows it describes.
--
-- ============================================================================
-- STRATEGY
-- ============================================================================
--
-- Loop over every `weg` row matching a known E2E name prefix. For each one,
-- attempt to delete its full dependency chain inside a nested BEGIN/EXCEPTION
-- block. A PL/pgSQL EXCEPTION handler creates an implicit savepoint: if any
-- statement in that WEG's chain fails (most likely the beschluss_sammlung_entry
-- wall above), the ENTIRE attempt for that WEG rolls back cleanly — no partial
-- deletion, the WEG survives fully intact — and the loop moves on and reports
-- it as skipped. Nothing is lost by attempting this on a WEG that turns out
-- to be undeletable.
--
-- Known E2E `weg.name` prefixes (grepped from apps/web/e2e/**, 2026-07-14):
--   'Cross %'          — cross-feature.spec.ts
--   'Scenario %'        — scenarios.spec.ts
--   'E2E Finz %'         — finanzen.spec.ts
--   'E2E %'              — wegs.spec.ts, personen.spec.ts, versammlungen.spec.ts
--   'WEG Lindenhof %'   — demo.spec.ts
--   'WEG E2E %'          — saas-onboarding.spec.ts (onboarding wizard)
--   'RLS Fixture %'      — rls.spec.ts (Tenant-B target row for cross-tenant
--                          write-isolation tests, added 2026-07-14)
--
-- 'E2E %' subsumes 'E2E Finz %' but NOT 'Cross %'/'Scenario %'/'WEG %' — kept
-- as separate LIKE patterns below for clarity, not because they're disjoint.
--
-- NOT covered / not verified further (extend here if you find more):
--   - `person` rows are tenant-scoped, not weg-scoped (no direct weg FK found;
--     linked only via `ownership`). This script clears `ownership` rows tied
--     to a deleted WEG's units but deliberately leaves `person` rows alone —
--     a person could in principle be shared across WEGs within a tenant.
--     If you want persons gone too, add a pass matching
--     person.vorname/nachname against the E2E fixtures used (see
--     e2e/personen.spec.ts) after reviewing for collisions.
--   - `top`, `resolution`, `vote`, `protocol` (meeting's other children,
--     0004_versammlung.sql) are deleted before `meeting` below on the
--     assumption they are all `on delete restrict` like their siblings —
--     verified for existence, ON DELETE clause matched by grep pattern but
--     not individually re-read line by line. If DELETE on `meeting` still
--     23503s after this block runs, read 0004_versammlung.sql for whatever
--     was missed and add it above the `meeting` delete.
--
-- ============================================================================
-- STEP 0 — PREVIEW (run this first, read the output, THEN decide whether to
-- run the DO block below at all)
-- ============================================================================

select
  'weg' as table_name,
  count(*) filter (where name like 'Cross %')            as cross_feature,
  count(*) filter (where name like 'Scenario %')          as scenarios,
  count(*) filter (where name like 'E2E Finz %')          as finanzen,
  count(*) filter (where name like 'WEG Lindenhof %')     as demo,
  count(*) filter (where name like 'WEG E2E %')           as saas_onboarding,
  count(*) filter (where name like 'RLS Fixture %')       as rls_fixtures,
  count(*) filter (where name like 'E2E %' and name not like 'E2E Finz %') as other_e2e
from public.weg;

-- How many of those already have a Beschluss-Sammlung entry and will be
-- permanently undeletable regardless of what this script does:
select count(distinct w.id) as wegs_permanently_stuck
from public.weg w
join public.meeting m on m.tenant_id = w.tenant_id and m.weg_id = w.id
join public.beschluss_sammlung_entry b
  on b.tenant_id = m.tenant_id and b.meeting_id = m.id
where w.name like 'Cross %' or w.name like 'Scenario %' or w.name like 'E2E %'
   or w.name like 'WEG Lindenhof %' or w.name like 'WEG E2E %'
   or w.name like 'RLS Fixture %';

-- Orphaned E2E tenants from the SaaS onboarding wizard (create_self_managed_weg_trial):
select count(*) as e2e_tenants
from public.tenant
where name like 'E2E Gemeinschaft %';

-- ============================================================================
-- STEP 1 — per-WEG cleanup attempt (review Step 0's output before running)
-- ============================================================================

do $$
declare
  weg_row record;
  attempted int := 0;
  cleaned int := 0;
  skipped int := 0;
begin
  for weg_row in
    select tenant_id, id, name
    from public.weg
    where name like 'Cross %'
       or name like 'Scenario %'
       or name like 'E2E %'
       or name like 'WEG Lindenhof %'
       or name like 'WEG E2E %'
       or name like 'RLS Fixture %'
    order by name
  loop
    attempted := attempted + 1;
    begin
      -- Cascade-deleted automatically by the DB (embedding, agent_suggestion),
      -- listed here only so the reader knows they're not forgotten, not
      -- because they need an explicit statement.

      delete from public.sollstellung s
        using public.wirtschaftsplan w
        where s.tenant_id = weg_row.tenant_id
          and s.wirtschaftsplan_id = w.id
          and w.weg_id = weg_row.id;

      delete from public.wirtschaftsplan
        where tenant_id = weg_row.tenant_id and weg_id = weg_row.id;

      delete from public.verteilungsschluessel
        where tenant_id = weg_row.tenant_id and weg_id = weg_row.id;

      delete from public.document
        where tenant_id = weg_row.tenant_id and weg_id = weg_row.id;

      delete from public.vorgang_inbox_item vi
        using public.vorgang v
        where vi.tenant_id = weg_row.tenant_id
          and vi.vorgang_id = v.id
          and v.weg_id = weg_row.id;

      delete from public.vorgang
        where tenant_id = weg_row.tenant_id and weg_id = weg_row.id;

      -- meeting's children — order matters if any of these reference each
      -- other; adjust if a specific child still blocks the meeting delete.
      delete from public.vote vo
        using public.meeting m
        where vo.tenant_id = weg_row.tenant_id
          and vo.meeting_id = m.id and m.weg_id = weg_row.id;

      delete from public.resolution r
        using public.meeting m
        where r.tenant_id = weg_row.tenant_id
          and r.meeting_id = m.id and m.weg_id = weg_row.id;

      delete from public.top t
        using public.meeting m
        where t.tenant_id = weg_row.tenant_id
          and t.meeting_id = m.id and m.weg_id = weg_row.id;

      delete from public.protocol p
        using public.meeting m
        where p.tenant_id = weg_row.tenant_id
          and p.meeting_id = m.id and m.weg_id = weg_row.id;

      -- This is the expected wall: fails with 23503 if any meeting under
      -- this WEG has a beschluss_sammlung_entry (append-only, undeletable).
      delete from public.meeting
        where tenant_id = weg_row.tenant_id and weg_id = weg_row.id;

      delete from public.ownership o
        using public.unit u
        where o.tenant_id = weg_row.tenant_id
          and o.unit_id = u.id and u.weg_id = weg_row.id;

      delete from public.unit
        where tenant_id = weg_row.tenant_id and weg_id = weg_row.id;

      delete from public.weg
        where tenant_id = weg_row.tenant_id and id = weg_row.id;

      cleaned := cleaned + 1;
      raise notice 'cleaned: % (%)', weg_row.name, weg_row.id;
    exception when others then
      -- Implicit savepoint rollback: every delete attempted for THIS weg is
      -- undone, the weg row and all its children survive untouched. Most
      -- likely cause: beschluss_sammlung_entry append-only trigger.
      skipped := skipped + 1;
      raise notice 'SKIPPED (left intact): % (%) — %', weg_row.name, weg_row.id, sqlerrm;
    end;
  end loop;

  raise notice '--- done: % attempted, % cleaned, % skipped ---', attempted, cleaned, skipped;
end $$;

-- ============================================================================
-- STEP 2 — orphaned E2E tenants from the SaaS onboarding wizard
-- ============================================================================
-- create_self_managed_weg_trial (0057_self_managed_saas_foundation.sql)
-- creates a `tenant` + `weg` + `tenant_member` together. Step 1 above already
-- removed the `weg` (name LIKE 'WEG E2E %') if it wasn't stuck; this removes
-- the now-empty `tenant` shell. Skip a tenant here if it still owns a `weg`
-- that Step 1 couldn't clean.

do $$
declare
  tenant_row record;
  cleaned int := 0;
  skipped int := 0;
begin
  for tenant_row in
    select id, name from public.tenant where name like 'E2E Gemeinschaft %'
  loop
    begin
      delete from public.tenant_member where tenant_id = tenant_row.id;
      delete from public.tenant where id = tenant_row.id;
      cleaned := cleaned + 1;
      raise notice 'cleaned tenant: % (%)', tenant_row.name, tenant_row.id;
    exception when others then
      skipped := skipped + 1;
      raise notice 'SKIPPED tenant (still owns undeleted rows): % (%) — %', tenant_row.name, tenant_row.id, sqlerrm;
    end;
  end loop;
  raise notice '--- tenants: % cleaned, % skipped ---', cleaned, skipped;
end $$;

-- Review the NOTICE output above, then either:
--   COMMIT;    -- keep the cleanup
-- or
--   ROLLBACK;  -- undo everything in this session, no changes made
--
-- (Only meaningful if you ran this inside an explicit BEGIN; you opened
-- yourself — Supabase Studio's SQL Editor auto-commits each statement batch
-- otherwise. Wrap the whole file in BEGIN;/COMMIT; if you want one atomic
-- all-or-nothing run instead of per-WEG savepoints doing the isolation.)
