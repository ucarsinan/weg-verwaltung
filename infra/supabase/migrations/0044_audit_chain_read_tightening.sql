-- WEG-Verwaltung migration 0044: tighten 0043 audit chain read permissions.
--
-- 0043 restored the live audit chain. This follow-up narrows the internal
-- read path to the exact tenant and columns needed by the chain-link trigger.
--
-- Historical audit rows are not modified.

revoke select on public.audit_event from audit_writer;
grant select (tenant_id, seq, row_hash) on public.audit_event to audit_writer;

drop policy if exists audit_event_chain_read_for_audit_writer on public.audit_event;
create policy audit_event_chain_read_for_audit_writer
  on public.audit_event for select to audit_writer
  using (
    tenant_id::text = nullif(
      pg_catalog.current_setting('app.audit_chain_tenant_id', true),
      ''
    )
  );

comment on policy audit_event_chain_read_for_audit_writer on public.audit_event is
  '0044 tightening for 0043 hotfix: audit_writer can read only rows for app.audit_chain_tenant_id, and column grants limit the read to tenant_id, seq, row_hash.';

create or replace function audit_writer.audit_event_before_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_prev bytea;
begin
  -- Authoritative db_role — overrides any caller-supplied value.
  new.db_role := session_user;

  -- FORCE RLS permits the previous-row lookup only for this tenant while this
  -- local GUC is set by the internal chain-link trigger.
  perform pg_catalog.set_config('app.audit_chain_tenant_id', new.tenant_id::text, true);

  select row_hash
    into v_prev
    from public.audit_event
   where tenant_id = new.tenant_id
   order by seq desc
   limit 1;

  perform pg_catalog.set_config('app.audit_chain_tenant_id', '', true);

  if v_prev is null then
    v_prev := decode('0000000000000000000000000000000000000000000000000000000000000000', 'hex');
  end if;

  new.prev_hash := v_prev;
  new.row_hash  := audit_writer.hash_audit_row(v_prev, new.payload);

  return new;
end;
$$;

alter function audit_writer.audit_event_before_insert() owner to audit_writer;
revoke all on function audit_writer.audit_event_before_insert()
  from public, anon, authenticated, service_role;
grant execute on function audit_writer.audit_event_before_insert() to audit_writer;

comment on function audit_writer.audit_event_before_insert() is
  '0044 tightening for 0043 hotfix: BEFORE INSERT chain-link trigger. New rows use Vault-keyed fail-closed HMAC and read only the previous tenant row through tenant-bound RLS.';

notify pgrst, 'reload schema';
