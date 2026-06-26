-- WEG-Verwaltung migration 0041: keep audit cold-storage non-destructive.
--
-- Audit partitions are global, not tenant-local. A safe cold-storage flow must
-- first export the complete partition, verify the HMAC chain, write a manifest
-- with checksums, and only then detach/drop under a privileged system job.
-- Until that job exists, no RPC path may detach/drop partitions.

drop policy if exists "audit-archives select own tenant" on storage.objects;
create policy "audit-archives select own tenant"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'audit-archives'
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (storage.foldername(name))[1]::uuid = (select public.tenant_id())
      else false
    end
  );

create or replace function audit_writer.get_archivable_partitions()
returns table(partition_name text, partition_date date)
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  v_cutoff date;
begin
  if not (
    nullif(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or public.has_role('tenant_admin')
  ) then
    raise exception 'Access denied: caller must be tenant_admin or service_role'
      using errcode = '42501';
  end if;

  v_cutoff := (date_trunc('month', now()) - interval '24 months')::date;

  return query
  select
    c.relname::text as partition_name,
    to_date(substring(c.relname from '^audit_event_([0-9]{4}_[0-9]{2})$'), 'YYYY_MM') as partition_date
  from pg_catalog.pg_inherits i
  join pg_catalog.pg_class c on c.oid = i.inhrelid
  join pg_catalog.pg_class p on p.oid = i.inhparent
  join pg_catalog.pg_namespace n on n.oid = p.relnamespace
  where p.relname = 'audit_event'
    and n.nspname = 'public'
    and c.relname ~ '^audit_event_[0-9]{4}_[0-9]{2}$'
    and to_date(substring(c.relname from '^audit_event_([0-9]{4}_[0-9]{2})$'), 'YYYY_MM') < v_cutoff
  order by partition_date asc;
end;
$$;

revoke all on function audit_writer.get_archivable_partitions() from public;
grant execute on function audit_writer.get_archivable_partitions() to authenticated, service_role;

comment on function audit_writer.get_archivable_partitions() is
  'Returns audit_event partitions older than 24 months. Caller must be tenant_admin or service_role; this helper is read-only.';

create or replace function audit_writer.detach_and_drop_partition(p_name text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception
    'Audit partition detach/drop is disabled until a complete export, manifest, checksum, and HMAC verification job exists.'
    using errcode = '55000';
end;
$$;

revoke all on function audit_writer.detach_and_drop_partition(text) from public;
grant execute on function audit_writer.detach_and_drop_partition(text) to service_role;

comment on function audit_writer.detach_and_drop_partition(text) is
  'Disabled placeholder. Audit partitions must not be detached/dropped until a privileged export+manifest job exists.';

create or replace function public.archive_partition(p_name text)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  perform audit_writer.detach_and_drop_partition(p_name);
end;
$$;

revoke all on function public.archive_partition(text) from public;
grant execute on function public.archive_partition(text) to service_role;

comment on function public.archive_partition(text) is
  'Service-role-only placeholder that currently raises because audit cold-storage execution is intentionally disabled.';
