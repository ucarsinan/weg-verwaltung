-- WEG-Verwaltung migration 0035: Audit Log Cold Storage Support
-- See docs/03-security-model.md § 3.5.

-- ---------------------------------------------------------------------------
-- 1. storage.buckets & policies for audit archives
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audit-archives',
  'audit-archives',
  false,
  104857600,                              -- 100 MB
  array['text/csv', 'application/json']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- RLS for the storage bucket objects

drop policy if exists "audit-archives select own tenant" on storage.objects;
create policy "audit-archives select own tenant"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'audit-archives'
    and (storage.foldername(name))[1]::uuid = (select public.tenant_id())
  );

drop policy if exists "audit-archives insert own tenant" on storage.objects;
-- Archive writes are produced by a privileged system job. Authenticated users
-- may read their tenant folder but must not upload or overwrite archive files.

-- ---------------------------------------------------------------------------
-- 2. audit_writer.get_archivable_partitions()
-- ---------------------------------------------------------------------------

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
    current_user in ('postgres', 'service_role', 'supabase_admin')
    or session_user in ('postgres', 'service_role', 'supabase_admin')
    or nullif(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or public.has_role('tenant_admin')
  ) then
    raise exception 'Access denied: caller must be tenant_admin or service_role'
      using errcode = '42501';
  end if;

  -- Cutoff is 24 months before the start of the current month
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
  'Returns the partition names and dates for audit_event partitions older than 24 months. SECURITY DEFINER.';

-- ---------------------------------------------------------------------------
-- 3. audit_writer.detach_and_drop_partition()
-- ---------------------------------------------------------------------------

create or replace function audit_writer.detach_and_drop_partition(p_name text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Access control check: privileged database role only. Tenant-scoped UI flows
  -- must not detach/drop global audit_event partitions.
  if not (
    current_user in ('postgres', 'service_role', 'supabase_admin')
    or session_user in ('postgres', 'service_role', 'supabase_admin')
    or nullif(current_setting('request.jwt.claim.role', true), '') = 'service_role'
  ) then
    raise exception 'Access denied: caller must be a privileged database role'
      using errcode = '42501'; -- insufficient_privilege
  end if;

  -- Regex check to validate partition name and prevent SQL injection
  if p_name is null or p_name !~ '^audit_event_[0-9]{4}_[0-9]{2}$' then
    raise exception 'Invalid partition name: %', p_name
      using errcode = '22023'; -- invalid_parameter_value
  end if;

  -- Verify partition exists on public.audit_event
  if not exists (
    select 1
    from pg_catalog.pg_inherits i
    join pg_catalog.pg_class c on c.oid = i.inhrelid
    join pg_catalog.pg_class p on p.oid = i.inhparent
    join pg_catalog.pg_namespace n on n.oid = p.relnamespace
    where p.relname = 'audit_event'
      and n.nspname = 'public'
      and c.relname = p_name
  ) then
    raise exception 'Partition % does not exist.', p_name
      using errcode = '42P01'; -- undefined_table
  end if;

  -- Detach partition from parent table
  execute format('alter table public.audit_event detach partition public.%I', p_name);

  -- Drop the partition table
  execute format('drop table public.%I', p_name);
end;
$$;

revoke all on function audit_writer.detach_and_drop_partition(text) from public;
grant execute on function audit_writer.detach_and_drop_partition(text) to service_role;

comment on function audit_writer.detach_and_drop_partition(text) is
  'Detaches and drops a target audit log partition. Service-role only: audit_event partitions are global, so tenant-scoped UI flows must never drop them.';
