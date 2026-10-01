-- WEG-Verwaltung migration 0076: Vorgang audit emitter reads the actor from the JWT GUCs.
--
-- Symptom:
--   Every INSERT/UPDATE/DELETE on the seven Vorgangszentrale tables fails with
--   SQLSTATE 42501 'permission denied for schema auth' when the caller reaches
--   audit_writer.tg_emit_vorgang_audit_event(). Reproduced locally on a fresh
--   `supabase db reset` + audit_regression_bootstrap.sql: contract 0054 aborts at
--   its first fixture insert, contract 0052 at its first runtime insert.
--
-- Root cause:
--   0052 wrote `v_actor_user := auth.uid();` in a SECURITY DEFINER function owned
--   by audit_writer. auth.uid() is resolved as audit_writer, which has no USAGE
--   on schema auth. That grant cannot be made: the migration runner (postgres)
--   owns neither the auth schema nor auth.uid() (see the header of 0028). The
--   same defect class was already fixed for the generic emitter (0028), the
--   tenant emitter (0057/0059) and the settings emitters (0053); this is the
--   last emitter that still called auth.uid().
--
-- Fix:
--   Re-create the emitter with the inline JWT read already used in 0059:
--   request.jwt.claim.sub, falling back to request.jwt.claims ->> 'sub'. An
--   unparseable value yields a NULL actor instead of an error, as in 0059.
--   Everything else in the function body is unchanged. No grant on schema auth
--   is added: that boundary is deliberate.
--
-- Risk posture:
--   - No RLS policy, table, grant or trigger-binding changes. CREATE OR REPLACE
--     keeps the seven *_audit_emit triggers bound to the same function.
--   - No change to the audit chain (hash, HMAC, partitions, append-only logic):
--     only the source of audit_event.actor_user_id changes, and for JWT callers
--     it resolves to the same uuid auth.uid() would have returned.
--   - Behavioural difference: auth.uid() returned NULL for non-JWT sessions
--     (service_role, postgres); the inline read does too.
--
-- Test strategy:
--   infra/supabase/tests/0052 and 0054 exercise inserts on the Vorgang tables and
--   were red before this migration. They join AUDIT_DB_TESTS with this change.
--
-- Rollback:
--   Forward-only. Restoring the auth.uid() body would reintroduce the defect.

create or replace function audit_writer.tg_emit_vorgang_audit_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_type text;
  v_actor_user uuid;
  v_uid_text text;
  v_payload jsonb;
  v_entity_id uuid;
  v_tenant uuid;
  v_action text;
begin
  v_actor_type := coalesce(
    nullif(current_setting('app.actor_type', true), ''),
    'user'
  );
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
    v_entity_id := new.id;
    v_tenant := new.tenant_id;
  else
    v_entity_id := old.id;
    v_tenant := old.tenant_id;
  end if;

  if v_tenant is null then
    return null;
  end if;

  v_action := tg_table_name || '.' || lower(tg_op);

  if tg_table_name = 'vorgang' then
    if tg_op = 'INSERT' then
      v_action := 'vorgang.created';
    elsif tg_op = 'UPDATE' then
      if old.status is distinct from new.status then
        v_action := 'vorgang.status_changed';
      elsif old.priority is distinct from new.priority then
        v_action := 'vorgang.priority_changed';
      elsif old.assigned_to is distinct from new.assigned_to then
        v_action := 'vorgang.assigned';
      elsif old.visibility_state is distinct from new.visibility_state then
        v_action := 'vorgang.visibility_changed';
      else
        v_action := 'vorgang.updated';
      end if;
    end if;
  elsif tg_table_name = 'vorgang_task' then
    if tg_op = 'INSERT' then
      v_action := 'vorgang.task_created';
    elsif tg_op = 'UPDATE' then
      if new.status = 'done' and old.status is distinct from new.status then
        v_action := 'vorgang.task_completed';
      end if;
    end if;
  elsif tg_table_name = 'vorgang_relation' then
    if tg_op = 'INSERT' then
      if new.relation_type = 'document' then
        v_action := 'vorgang.document_linked';
      end if;
    elsif tg_op = 'DELETE' then
      if old.relation_type = 'document' then
        v_action := 'vorgang.document_unlinked';
      end if;
    end if;
  elsif tg_table_name = 'vorgang_visibility' then
    if tg_op = 'INSERT' or tg_op = 'UPDATE' then
      v_action := case
        when new.is_portal_visible then 'vorgang.portal_published'
        else 'vorgang.visibility_changed'
      end;
    end if;
  end if;

  if tg_op = 'INSERT' then
    v_payload := jsonb_build_object(
      'operation', tg_op,
      'before', null,
      'after', to_jsonb(new)
    );
  elsif tg_op = 'UPDATE' then
    v_payload := jsonb_build_object(
      'operation', tg_op,
      'before', to_jsonb(old),
      'after', to_jsonb(new)
    );
  else
    v_payload := jsonb_build_object(
      'operation', tg_op,
      'before', to_jsonb(old),
      'after', null
    );
  end if;

  insert into public.audit_event (
    tenant_id,
    actor_type,
    actor_user_id,
    entity_typ,
    entity_id,
    action,
    payload
  ) values (
    v_tenant,
    v_actor_type,
    v_actor_user,
    tg_table_name,
    v_entity_id,
    v_action,
    v_payload
  );

  return null;
end;
$$;

alter function audit_writer.tg_emit_vorgang_audit_event() owner to audit_writer;

revoke all on function audit_writer.tg_emit_vorgang_audit_event() from public;
grant execute on function audit_writer.tg_emit_vorgang_audit_event() to audit_writer;

comment on function audit_writer.tg_emit_vorgang_audit_event() is
  '0076: semantic audit emitter for Vorgangszentrale tables. Actor is read from the JWT GUCs inline; auth.uid() is not callable as audit_writer (see 0028). HMAC chaining is handled by existing audit_event triggers.';
