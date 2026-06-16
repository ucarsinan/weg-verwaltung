-- Local-only bootstrap for the audit pgTAP regression gate.
--
-- The hosted Frankfurt project has the audit_writer Vault grants and tightened
-- audit_event API-role grants already applied. Supabase Local starts from a
-- slightly different privilege baseline, so CI normalizes the ephemeral DB
-- after migrations and before pgTAP. This file must only be executed with
-- `supabase db query --local`.

do $$
begin
  begin
    execute 'grant execute on all functions in schema vault to audit_writer';
  exception
    when insufficient_privilege or invalid_schema_name then
      raise notice 'Skipping local vault function grant normalization: %', sqlerrm;
  end;

  begin
    execute 'grant usage on schema pgsodium to audit_writer';
    execute 'grant execute on all functions in schema pgsodium to audit_writer';
  exception
    when insufficient_privilege or invalid_schema_name then
      raise notice 'Skipping local pgsodium grant normalization: %', sqlerrm;
  end;

  execute $sql$
    alter function audit_writer.hash_audit_event_v2(
      bytea, uuid, bigint, timestamptz, text, uuid, text, text, uuid, text, jsonb
    ) owner to postgres
  $sql$;
  execute $sql$
    grant execute on function audit_writer.hash_audit_event_v2(
      bytea, uuid, bigint, timestamptz, text, uuid, text, text, uuid, text, jsonb
    ) to audit_writer
  $sql$;

  execute 'revoke all privileges on table public.audit_event from anon';

  execute 'revoke all privileges on table public.audit_event from authenticated';
  execute 'grant select on table public.audit_event to authenticated';

  execute 'revoke update, delete, truncate, references, trigger on table public.audit_event from service_role';
end
$$;
