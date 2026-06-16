-- WEG-Verwaltung migration 0040: lock down historical Sollstellungen.
--
-- Sollstellungen are historical Forderungsdatensätze generated from the
-- Wirtschaftsplan and Unit/MEA state at creation time. Direct writes are
-- blocked for app callers, and a trigger blocks table-level bypass attempts
-- unless the insert comes from the controlled generator path.

-- Direct tenant writes were useful while scaffolding the module, but they make
-- payment targets tamperable. Keep SELECT for the UI and remove direct DML.
revoke insert, update, delete on public.sollstellung from public, anon, authenticated, service_role;
grant select on public.sollstellung to authenticated;

drop policy if exists sollstellung_insert_own_tenant on public.sollstellung;
drop policy if exists sollstellung_update_own_tenant on public.sollstellung;
drop policy if exists sollstellung_delete_own_tenant on public.sollstellung;
drop policy if exists sollstellung_update_generated on public.sollstellung;
drop policy if exists sollstellung_delete_generated on public.sollstellung;

drop policy if exists sollstellung_insert_generated on public.sollstellung;
create policy sollstellung_insert_generated
  on public.sollstellung for insert to authenticated
  with check (
    nullif(pg_catalog.current_setting('app.sollstellung_writer', true), '') = 'generator'
    and tenant_id::text = nullif(pg_catalog.current_setting('app.sollstellung_tenant_id', true), '')
  );

create or replace function public.tg_sollstellung_enforce_insert_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Sollstellungen are historical records and cannot be updated or deleted.'
      using errcode = '42501';
  end if;

  if nullif(pg_catalog.current_setting('app.sollstellung_writer', true), '') <> 'generator' then
    raise exception 'Direct writes to Sollstellungen are not allowed.'
      using errcode = '42501';
  end if;

  if new.tenant_id::text <> nullif(pg_catalog.current_setting('app.sollstellung_tenant_id', true), '') then
    raise exception 'Sollstellung generator tenant context mismatch.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.tg_sollstellung_enforce_insert_only() from public;

drop trigger if exists sollstellung_enforce_insert_only on public.sollstellung;
create trigger sollstellung_enforce_insert_only
  before insert or update or delete on public.sollstellung
  for each row
  execute function public.tg_sollstellung_enforce_insert_only();

comment on table public.sollstellung is
  'Historical monthly Hausgeld target payment generated from Wirtschaftsplan and Unit MEA at creation time. Direct writes, recalculation, updates, and deletes are blocked.';

comment on function public.tg_sollstellung_enforce_insert_only() is
  'DB-side guard for historical Sollstellungen: only generator-context INSERT is allowed; UPDATE and DELETE always raise.';

-- ---------------------------------------------------------------------------
-- Indirect source mutation guards
-- ---------------------------------------------------------------------------

create or replace function public.tg_wirtschaftsplan_prevent_posted_rewrite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
      from public.sollstellung s
     where s.tenant_id = old.tenant_id
       and s.wirtschaftsplan_id = old.id
     limit 1
  ) then
    raise exception 'Wirtschaftsplan has posted Sollstellungen. Create a Nachtragswirtschaftsplan/correction instead of rewriting history.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.tg_wirtschaftsplan_prevent_posted_rewrite() from public;

drop trigger if exists wirtschaftsplan_prevent_posted_rewrite_update on public.wirtschaftsplan;
create trigger wirtschaftsplan_prevent_posted_rewrite_update
  before update of weg_id, jahr, gesamtkosten on public.wirtschaftsplan
  for each row
  when (
    old.weg_id is distinct from new.weg_id
    or old.jahr is distinct from new.jahr
    or old.gesamtkosten is distinct from new.gesamtkosten
  )
  execute function public.tg_wirtschaftsplan_prevent_posted_rewrite();

drop trigger if exists wirtschaftsplan_prevent_posted_rewrite_delete on public.wirtschaftsplan;
create trigger wirtschaftsplan_prevent_posted_rewrite_delete
  before delete on public.wirtschaftsplan
  for each row
  execute function public.tg_wirtschaftsplan_prevent_posted_rewrite();

create or replace function public.tg_unit_prevent_posted_mea_rewrite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
      from public.sollstellung s
     where s.tenant_id = old.tenant_id
       and s.unit_id = old.id
     limit 1
  ) then
    raise exception 'Unit has posted Sollstellungen. Create a Nachtragswirtschaftsplan/correction instead of rewriting history.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.tg_unit_prevent_posted_mea_rewrite() from public;

drop trigger if exists unit_prevent_posted_mea_rewrite_update on public.unit;
create trigger unit_prevent_posted_mea_rewrite_update
  before update of weg_id, mea_zaehler, mea_nenner on public.unit
  for each row
  when (
    old.weg_id is distinct from new.weg_id
    or old.mea_zaehler is distinct from new.mea_zaehler
    or old.mea_nenner is distinct from new.mea_nenner
  )
  execute function public.tg_unit_prevent_posted_mea_rewrite();

drop trigger if exists unit_prevent_posted_mea_rewrite_delete on public.unit;
create trigger unit_prevent_posted_mea_rewrite_delete
  before delete on public.unit
  for each row
  execute function public.tg_unit_prevent_posted_mea_rewrite();

comment on function public.tg_wirtschaftsplan_prevent_posted_rewrite() is
  'Blocks indirect rewrites of posted Sollstellungen through Wirtschaftsplan cost/year/WEG changes or deletion.';

comment on function public.tg_unit_prevent_posted_mea_rewrite() is
  'Blocks indirect rewrites of posted Sollstellungen through Unit MEA/WEG changes or deletion.';
