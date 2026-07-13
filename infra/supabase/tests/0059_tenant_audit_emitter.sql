-- WEG-Verwaltung pgTAP regression contract for 0059 tenant audit emitter repair.

begin;

select plan(4);

-- ---------------------------------------------------------------------------
-- Static contract: the tenant-root emitter must key on tenant.id, never
-- reference a tenant_id field the tenant root does not have.
-- ---------------------------------------------------------------------------

select ok(
  (select prosrc from pg_catalog.pg_proc
     where oid = 'audit_writer.tg_emit_tenant_audit_event()'::regprocedure)
    like '%v_tenant := new.id%',
  'tenant emitter keys audit_event.tenant_id on new.id'
);

select ok(
  (select prosrc from pg_catalog.pg_proc
     where oid = 'audit_writer.tg_emit_tenant_audit_event()'::regprocedure)
    not like '%new.tenant_id%',
  'tenant emitter never references new.tenant_id (which the tenant root lacks)'
);

select is(
  (
    select count(*)::int from pg_catalog.pg_trigger
    where tgrelid = 'public.tenant'::regclass
      and tgname = 'tenant_audit_emit'
      and not tgisinternal
  ),
  1,
  'public.tenant has exactly the tenant_audit_emit trigger'
);

-- ---------------------------------------------------------------------------
-- Runtime contract: a tenant insert succeeds and emits one audit_event row
-- keyed by the new tenant's own id. This is the exact path that failed on the
-- drifted Cloud project (42703 record "new" has no field "tenant_id").
-- ---------------------------------------------------------------------------

-- Insert in its own statement so the AFTER-trigger audit row is visible to the
-- following assertion's snapshot (same-statement CTE snapshots would not see it).
insert into public.tenant (id, name)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddd59'::uuid, '0059 Emitter Probe');

select is(
  (
    select count(*)::int from public.audit_event as ae
    where ae.tenant_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd59'::uuid
      and ae.entity_typ = 'tenant'
      and ae.entity_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd59'::uuid
      and ae.action = 'insert'
  ),
  1,
  'inserting a tenant emits exactly one audit_event row keyed by tenant.id'
);

select * from finish();

rollback;
