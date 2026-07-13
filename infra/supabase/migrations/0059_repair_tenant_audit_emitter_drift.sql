-- WEG-Verwaltung migration 0059: repair drifted tenant audit emitter on Cloud.
--
-- Symptom:
--   On the Frankfurt Cloud project, `insert into public.tenant (...)` fails with
--   SQLSTATE 42703 'record "new" has no field "tenant_id"'. This blocks every
--   new-tenant path: the /onboarding self-service RPC create_self_managed_weg_trial
--   and the seed-admin script both insert into public.tenant. A plain local
--   `db reset` through 0058 does NOT reproduce it — the local function body is
--   correct (`v_tenant := new.id`).
--
-- Root cause:
--   public.tenant is the tenant root and has no tenant_id column, so its audit
--   emitter audit_writer.tg_emit_tenant_audit_event() must use tenant.id as the
--   audit_event.tenant_id boundary. 0053 introduced this function and 0057
--   re-created it (both correct, using new.id). On Cloud the function body still
--   references new.tenant_id — the same recorded-as-applied-but-object-not-updated
--   drift class already seen for the Vault decrypt grant (0058) and the audit
--   chain repair (0045 header). The generic emitter (tg_emit_audit_event) and the
--   SaaS emitter (tg_emit_saas_audit_event) legitimately use new.tenant_id; only
--   the tenant-root emitter must use new.id, and that is what drifted.
--
-- Fix:
--   Forward-only re-assertion of the canonical 0057 tenant emitter (new.id) plus
--   its trigger binding. A fresh, never-recorded migration is executed by
--   `db push` even where an older recorded create-or-replace did not take effect
--   (proven by 0058), so this forcibly overwrites the drifted Cloud function.
--
-- Risk posture:
--   - No RLS policy changes, no new tables, no data migration.
--   - No change to the audit chain (hash, HMAC, partitions, append-only logic):
--     this only corrects which column supplies audit_event.tenant_id for the
--     tenant-root emitter.
--   - Idempotent create-or-replace + drop/recreate trigger; safe to re-run and a
--     no-op where the object is already correct.
--
-- Test strategy:
--   infra/supabase/tests/0059_tenant_audit_emitter.sql asserts a public.tenant
--   insert succeeds, emits exactly one audit_event row keyed by tenant.id, and
--   that the function source references new.id (not new.tenant_id).
--
-- Rollback:
--   None required (forward-only correctness fix). The prior Cloud body was the
--   defect being removed; local already matches the corrected body.

create or replace function audit_writer.tg_emit_tenant_audit_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_type text;
  v_actor_user uuid;
  v_payload    jsonb;
  v_entity_id  uuid;
  v_tenant     uuid;
  v_uid_text   text;
begin
  v_actor_type := coalesce(nullif(current_setting('app.actor_type', true), ''), 'user');
  v_uid_text := coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  );
  begin
    v_actor_user := v_uid_text::uuid;
  exception when others then
    v_actor_user := null;
  end;

  if tg_op in ('INSERT', 'UPDATE') then
    v_payload := to_jsonb(new);
    v_entity_id := new.id;
    v_tenant := new.id;
  else
    v_payload := to_jsonb(old);
    v_entity_id := old.id;
    v_tenant := old.id;
  end if;

  insert into public.audit_event (
    tenant_id, actor_type, actor_user_id, entity_typ, entity_id, action, payload
  ) values (
    v_tenant, v_actor_type, v_actor_user, tg_table_name, v_entity_id, lower(tg_op), v_payload
  );
  return null;
end;
$$;

alter function audit_writer.tg_emit_tenant_audit_event() owner to audit_writer;
revoke all on function audit_writer.tg_emit_tenant_audit_event() from public;
grant execute on function audit_writer.tg_emit_tenant_audit_event() to audit_writer;

comment on function audit_writer.tg_emit_tenant_audit_event() is
  '0059 repair: tenant-root audit emitter. audit_event.tenant_id is tenant.id, not new.tenant_id (which the tenant root does not have).';

drop trigger if exists tenant_audit_emit on public.tenant;
create trigger tenant_audit_emit
  after insert or update or delete on public.tenant
  for each row execute function audit_writer.tg_emit_tenant_audit_event();

comment on trigger tenant_audit_emit on public.tenant is
  'Settings module audit: tenant settings changes emit append-only audit_event rows.';
