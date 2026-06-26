-- WEG-Verwaltung migration 0055: advisor grant and RLS initplan hardening.
--
-- Addresses current Supabase Advisor WARNs without changing product semantics:
--   - SECURITY DEFINER RPCs that are tenant/admin guarded stay callable by
--     authenticated users, but never by anon.
--   - Trigger-only SECURITY DEFINER functions are not directly executable by
--     anon or authenticated API roles.
--   - RLS policies that read GUCs use SELECT-wrapped initplans so the value is
--     evaluated once per statement instead of once per row.

set search_path = pg_catalog, public;

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER public RPCs: authenticated may need them, anon never does.
-- ---------------------------------------------------------------------------

revoke execute on function public.audit_integrity_status() from anon;
revoke execute on function public.audit_verify_chain() from anon;
revoke execute on function public.check_partition_archivable(text) from anon;
revoke execute on function public.get_archivable_partitions() from anon;
revoke execute on function public.is_partition_detached(text) from anon;

-- ---------------------------------------------------------------------------
-- Trigger-only functions: triggers can execute them without API EXECUTE grants.
-- ---------------------------------------------------------------------------

revoke execute on function public.tg_sollstellung_enforce_insert_only()
  from anon, authenticated;
revoke execute on function public.tg_unit_prevent_posted_mea_rewrite()
  from anon, authenticated;
revoke execute on function public.tg_wirtschaftsplan_lifecycle_guard()
  from anon, authenticated;
revoke execute on function public.tg_wirtschaftsplan_prevent_effective_rewrite()
  from anon, authenticated;
revoke execute on function public.tg_wirtschaftsplan_prevent_posted_rewrite()
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS initplan hardening for GUC-based policies flagged by Advisor.
-- ---------------------------------------------------------------------------

drop policy if exists embedding_select_own_tenant on public.embedding;
create policy embedding_select_own_tenant
  on public.embedding for select to authenticated
  using (
    tenant_id = (
      (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')
    )::uuid
  );

drop policy if exists embedding_insert_own_tenant on public.embedding;
create policy embedding_insert_own_tenant
  on public.embedding for insert to authenticated
  with check (
    tenant_id = (
      (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')
    )::uuid
  );

drop policy if exists embedding_update_own_tenant on public.embedding;
create policy embedding_update_own_tenant
  on public.embedding for update to authenticated
  using (
    tenant_id = (
      (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')
    )::uuid
  )
  with check (
    tenant_id = (
      (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')
    )::uuid
  );

drop policy if exists embedding_delete_own_tenant on public.embedding;
create policy embedding_delete_own_tenant
  on public.embedding for delete to authenticated
  using (
    tenant_id = (
      (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')
    )::uuid
  );

drop policy if exists sollstellung_insert_generated on public.sollstellung;
create policy sollstellung_insert_generated
  on public.sollstellung for insert to authenticated
  with check (
    (select nullif(pg_catalog.current_setting('app.sollstellung_writer', true), '')) = 'generator'
    and tenant_id::text = (
      select nullif(pg_catalog.current_setting('app.sollstellung_tenant_id', true), '')
    )
  );

drop policy if exists audit_event_chain_read_for_audit_writer on public.audit_event;
create policy audit_event_chain_read_for_audit_writer
  on public.audit_event for select to audit_writer
  using (
    tenant_id::text = (
      select nullif(pg_catalog.current_setting('app.audit_chain_tenant_id', true), '')
    )
  );

comment on policy audit_event_chain_read_for_audit_writer on public.audit_event is
  '0055 hardening: audit_writer can read audit_event only for app.audit_chain_tenant_id; GUC lookup is SELECT-wrapped for Advisor initplan compliance.';

drop policy if exists audit_integrity_check_insert_internal on public.audit_integrity_check;
create policy audit_integrity_check_insert_internal
  on public.audit_integrity_check for insert
  with check (
    (select nullif(pg_catalog.current_setting('app.audit_integrity_writer', true), '')) = 'verify_chain'
    and tenant_id::text = (
      select nullif(pg_catalog.current_setting('app.audit_integrity_tenant_id', true), '')
    )
  );
