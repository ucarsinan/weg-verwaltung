-- WEG-Verwaltung migration 0028: ersetzt 0026-Trigger-Funktion mit
-- inline-JWT-Claim-Read statt auth.uid()-Aufruf.
--
-- Hintergrund: 0027 wollte audit_writer EXECUTE auf auth.uid() granten,
-- aber `postgres` (der hosted-Supabase-Migration-Runner) ist nicht
-- Owner von auth.uid() (Owner: supabase_auth_admin). Die Grants liefen
-- als WARNING durch und 0026 blieb gebrochen — jede instrumentierte
-- INSERT schlug mit 42501 fehl.
--
-- Lösung: das, was auth.uid() intern macht, direkt im Trigger-Body
-- aufrufen. current_setting('request.jwt.claim.sub', true) und der
-- JSONB-Fallback sind Session-GUCs ohne Permission-Check. Funktional
-- identisch, aber kein cross-schema-Grant nötig.

create or replace function audit_writer.tg_emit_audit_event()
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
  v_actor_type := coalesce(
    nullif(current_setting('app.actor_type', true), ''),
    'user'
  );

  -- Inline-Replikat von auth.uid() — vermeidet den cross-schema-
  -- EXECUTE-Check, der in SECURITY DEFINER audit_writer-Kontext nicht
  -- granteable ist (Owner von auth.uid() ist supabase_auth_admin und
  -- der hosted-postgres-Migration-Runner kann darauf nicht granten).
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
    v_payload   := to_jsonb(new);
    v_entity_id := new.id;
    v_tenant    := new.tenant_id;
  else
    v_payload   := to_jsonb(old);
    v_entity_id := old.id;
    v_tenant    := old.tenant_id;
  end if;

  if v_tenant is null then
    return null;
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

alter function audit_writer.tg_emit_audit_event() owner to audit_writer;
