-- WEG-Verwaltung migration 0037: API wrappers for Audit Cold Storage.
-- Listing/check helpers are exposed to authenticated users. Destructive
-- archive execution is service-role only because audit_event partitions are
-- global, not tenant-local.

-- 1. public.get_archivable_partitions
create or replace function public.get_archivable_partitions()
returns table(partition_name text, partition_date date)
language plpgsql
security invoker
stable
set search_path = pg_catalog, public
as $$
begin
  return query select * from audit_writer.get_archivable_partitions();
end;
$$;

revoke all on function public.get_archivable_partitions() from public;
grant execute on function public.get_archivable_partitions() to authenticated, service_role;

-- 2. public.archive_partition
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

-- 3. public.is_partition_detached
create or replace function public.is_partition_detached(p_name text)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  v_exists boolean;
begin
  select exists (
    select 1
    from pg_catalog.pg_inherits i
    join pg_catalog.pg_class c on c.oid = i.inhrelid
    join pg_catalog.pg_class p on p.oid = i.inhparent
    join pg_catalog.pg_namespace n on n.oid = p.relnamespace
    where p.relname = 'audit_event'
      and n.nspname = 'public'
      and c.relname = p_name
  ) into v_exists;
  
  return jsonb_build_object('detached', not v_exists);
end;
$$;

revoke all on function public.is_partition_detached(text) from public;
grant execute on function public.is_partition_detached(text) to authenticated, service_role;

-- 4. public.check_partition_archivable
create or replace function public.check_partition_archivable(p_name text)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  v_cutoff date;
  v_p_date date;
  v_archivable boolean;
begin
  v_cutoff := (date_trunc('month', now()) - interval '24 months')::date;
  
  if p_name is null or p_name !~ '^audit_event_[0-9]{4}_[0-9]{2}$' then
    return jsonb_build_object('archivable', false);
  end if;

  v_p_date := to_date(substring(p_name from '^audit_event_([0-9]{4}_[0-9]{2})$'), 'YYYY_MM');
  v_archivable := (v_p_date is not null and v_p_date < v_cutoff);
  
  return jsonb_build_object('archivable', v_archivable);
end;
$$;

revoke all on function public.check_partition_archivable(text) from public;
grant execute on function public.check_partition_archivable(text) to authenticated, service_role;
