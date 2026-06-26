-- WEG-Verwaltung migration 0053: Settings-relevant audit coverage.
--
-- The settings center mutates identity/profile tables. These tables predate the
-- generic 0026 business-trigger rollout. `tenant_member` and `person` have the
-- standard tenant_id column and can use the generic emitter. `tenant` is the
-- tenant root and has no tenant_id column, so it needs a root-specific emitter
-- that uses tenant.id as audit_event.tenant_id.

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
begin
  v_actor_type := coalesce(
    nullif(current_setting('app.actor_type', true), ''),
    'user'
  );
  v_actor_user := auth.uid();

  if tg_op in ('INSERT', 'UPDATE') then
    v_payload   := to_jsonb(new);
    v_entity_id := new.id;
    v_tenant    := new.id;
  else
    v_payload   := to_jsonb(old);
    v_entity_id := old.id;
    v_tenant    := old.id;
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
    lower(tg_op),
    v_payload
  );

  return null;
end;
$$;

alter function audit_writer.tg_emit_tenant_audit_event() owner to audit_writer;
revoke all on function audit_writer.tg_emit_tenant_audit_event() from public;
grant execute on function audit_writer.tg_emit_tenant_audit_event() to audit_writer;

comment on function audit_writer.tg_emit_tenant_audit_event() is
  'Row-level settings audit emitter for public.tenant, whose tenant boundary is tenant.id.';

drop trigger if exists tenant_audit_emit on public.tenant;
create trigger tenant_audit_emit
  after insert or update or delete on public.tenant
  for each row execute function audit_writer.tg_emit_tenant_audit_event();

drop trigger if exists tenant_member_audit_emit on public.tenant_member;
create trigger tenant_member_audit_emit
  after insert or update or delete on public.tenant_member
  for each row execute function audit_writer.tg_emit_audit_event();

drop trigger if exists person_audit_emit on public.person;
create trigger person_audit_emit
  after insert or update or delete on public.person
  for each row execute function audit_writer.tg_emit_audit_event();

comment on trigger tenant_audit_emit on public.tenant is
  'Settings module audit: tenant settings changes emit append-only audit_event rows.';

comment on trigger tenant_member_audit_emit on public.tenant_member is
  'Settings module audit: membership and role changes emit append-only audit_event rows.';

comment on trigger person_audit_emit on public.person is
  'Settings module audit: linked profile/person changes emit append-only audit_event rows.';
