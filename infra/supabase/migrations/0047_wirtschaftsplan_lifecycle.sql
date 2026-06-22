-- WEG-Verwaltung migration 0047: Wirtschaftsplan lifecycle.
--
-- A Wirtschaftsplan is no longer effective just because it exists. Plans start
-- as drafts. Sollstellungen are posted only by the explicit activation RPC.
-- Posted Sollstellungen remain immutable; Nachtragswirtschaftspläne create new
-- plan versions instead of rewriting historical rows.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Lifecycle columns and data backfill
-- ---------------------------------------------------------------------------

alter table public.wirtschaftsplan
  add column if not exists status text not null default 'entwurf',
  add column if not exists aktiviert_am timestamptz,
  add column if not exists abgeloest_am timestamptz,
  add column if not exists archiviert_am timestamptz,
  add column if not exists version_nr integer not null default 1,
  add column if not exists vorgaenger_wirtschaftsplan_id uuid,
  add column if not exists wirksam_ab_monat integer;

with ranked as (
  select
    wp.id,
    pg_catalog.row_number() over (
      partition by wp.tenant_id, wp.weg_id, wp.jahr
      order by wp.created_at, wp.id
    ) as version_nr,
    exists (
      select 1
        from public.sollstellung s
       where s.tenant_id = wp.tenant_id
         and s.wirtschaftsplan_id = wp.id
       limit 1
    ) as has_sollstellungen
  from public.wirtschaftsplan wp
)
update public.wirtschaftsplan wp
   set version_nr = ranked.version_nr,
       status = case when ranked.has_sollstellungen then 'aktiv' else 'entwurf' end,
       aktiviert_am = case
         when ranked.has_sollstellungen then coalesce(wp.aktiviert_am, wp.created_at)
         else null
       end,
       wirksam_ab_monat = case
         when ranked.has_sollstellungen then coalesce(wp.wirksam_ab_monat, 1)
         else wp.wirksam_ab_monat
       end
  from ranked
 where ranked.id = wp.id;

alter table public.wirtschaftsplan
  drop constraint if exists wirtschaftsplan_status_check,
  add constraint wirtschaftsplan_status_check
    check (status in ('entwurf', 'aktiv', 'abgeloest', 'archiviert')),
  drop constraint if exists wirtschaftsplan_lifecycle_timestamp_check,
  add constraint wirtschaftsplan_lifecycle_timestamp_check
    check (
      (
        status = 'entwurf'
        and aktiviert_am is null
        and abgeloest_am is null
        and archiviert_am is null
      )
      or (
        status = 'aktiv'
        and aktiviert_am is not null
        and abgeloest_am is null
        and archiviert_am is null
      )
      or (
        status = 'abgeloest'
        and aktiviert_am is not null
        and abgeloest_am is not null
        and archiviert_am is null
      )
      or (
        status = 'archiviert'
        and archiviert_am is not null
      )
    ),
  drop constraint if exists wirtschaftsplan_version_nr_check,
  add constraint wirtschaftsplan_version_nr_check
    check (version_nr >= 1),
  drop constraint if exists wirtschaftsplan_wirksam_ab_monat_check,
  add constraint wirtschaftsplan_wirksam_ab_monat_check
    check (wirksam_ab_monat is null or wirksam_ab_monat between 1 and 12),
  drop constraint if exists wirtschaftsplan_vorgaenger_not_self_check,
  add constraint wirtschaftsplan_vorgaenger_not_self_check
    check (vorgaenger_wirtschaftsplan_id is null or vorgaenger_wirtschaftsplan_id <> id),
  drop constraint if exists wirtschaftsplan_vorgaenger_fk,
  add constraint wirtschaftsplan_vorgaenger_fk
    foreign key (tenant_id, vorgaenger_wirtschaftsplan_id)
    references public.wirtschaftsplan(tenant_id, id)
    on delete restrict;

-- The old model allowed only one plan per tenant/WEG/year. Lifecycle allows
-- multiple drafts and historical versions, but only one active plan.
alter table public.wirtschaftsplan
  drop constraint if exists wirtschaftsplan_tenant_id_weg_id_jahr_key;

drop index if exists public.wirtschaftsplan_one_active_per_year_idx;
create unique index wirtschaftsplan_one_active_per_year_idx
  on public.wirtschaftsplan (tenant_id, weg_id, jahr)
  where status = 'aktiv';

drop index if exists public.wirtschaftsplan_effective_version_idx;
create unique index wirtschaftsplan_effective_version_idx
  on public.wirtschaftsplan (tenant_id, weg_id, jahr, version_nr)
  where status <> 'entwurf';

create index if not exists wirtschaftsplan_lifecycle_idx
  on public.wirtschaftsplan (tenant_id, weg_id, jahr, status, version_nr);

comment on column public.wirtschaftsplan.status is
  'Lifecycle state: entwurf, aktiv, abgeloest, archiviert. Only activation posts Sollstellungen.';
comment on column public.wirtschaftsplan.aktiviert_am is
  'Timestamp when the plan was activated and initial Sollstellungen were posted.';
comment on column public.wirtschaftsplan.abgeloest_am is
  'Timestamp when the plan was replaced by a Nachtragswirtschaftsplan.';
comment on column public.wirtschaftsplan.archiviert_am is
  'Timestamp when the plan left the operational lifecycle.';
comment on column public.wirtschaftsplan.version_nr is
  'Effective version number within tenant, WEG, and year. Drafts may share provisional values.';
comment on column public.wirtschaftsplan.vorgaenger_wirtschaftsplan_id is
  'Optional same-tenant predecessor for Nachtragswirtschaftspläne.';
comment on column public.wirtschaftsplan.wirksam_ab_monat is
  'Optional first month, 1-12, for Sollstellungen generated during activation.';

-- ---------------------------------------------------------------------------
-- 2. Disable automatic generation on INSERT
-- ---------------------------------------------------------------------------

drop trigger if exists wirtschaftsplan_generate_missing_sollstellungen
  on public.wirtschaftsplan;
drop function if exists public.tg_wirtschaftsplan_generate_missing_sollstellungen();

-- Keep the old public RPC name closed so callers cannot post Sollstellungen
-- without the lifecycle transition.
create or replace function public.generate_sollstellungen(p_wirtschaftsplan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Sollstellungen are generated only by activate_wirtschaftsplan().'
    using errcode = '42501';
end;
$$;

revoke all on function public.generate_sollstellungen(uuid)
  from public, anon, authenticated, service_role;

comment on function public.generate_sollstellungen(uuid) is
  'Deprecated closed RPC. Use activate_wirtschaftsplan(), which performs the lifecycle transition and posts Sollstellungen transactionally.';

-- ---------------------------------------------------------------------------
-- 3. Insert-only generator used by activation
-- ---------------------------------------------------------------------------

create or replace function private._generate_sollstellungen_for_plan(
  p_wirtschaftsplan_id uuid,
  p_start_month integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_weg_id uuid;
  v_gesamtkosten numeric(12, 2);
  v_start_month integer;
begin
  v_start_month := coalesce(p_start_month, 1);

  if v_start_month < 1 or v_start_month > 12 then
    raise exception 'wirksam_ab_monat must be between 1 and 12.'
      using errcode = '22023';
  end if;

  select wp.tenant_id, wp.weg_id, wp.gesamtkosten
    into v_tenant_id, v_weg_id, v_gesamtkosten
    from public.wirtschaftsplan as wp
   where wp.id = p_wirtschaftsplan_id
   for update;

  if not found then
    raise exception 'Wirtschaftsplan not found.'
      using errcode = 'P0002';
  end if;

  perform pg_catalog.set_config('app.sollstellung_writer', 'generator', true);
  perform pg_catalog.set_config('app.sollstellung_tenant_id', v_tenant_id::text, true);

  insert into public.sollstellung (
    tenant_id,
    wirtschaftsplan_id,
    unit_id,
    monat,
    betrag,
    buchungstyp,
    quelle
  )
  select
    v_tenant_id,
    p_wirtschaftsplan_id,
    generated.unit_id,
    generated.monat,
    generated.betrag,
    'initial',
    'wirtschaftsplan'
  from (
    select
      u.id as unit_id,
      months.monat,
      case
        when u.mea_nenner <= 0 or u.mea_zaehler <= 0 then 0::numeric(12, 2)
        else pg_catalog.round(
          ((u.mea_zaehler::numeric / u.mea_nenner::numeric) * v_gesamtkosten) / 12.0,
          2
        )::numeric(12, 2)
      end as betrag
    from public.unit as u
    cross join pg_catalog.generate_series(v_start_month, 12) as months(monat)
    where u.tenant_id = v_tenant_id
      and u.weg_id = v_weg_id
    order by u.id, months.monat
  ) as generated
  on conflict (tenant_id, wirtschaftsplan_id, unit_id, monat)
    where buchungstyp = 'initial'
  do nothing;
end;
$$;

revoke all on function private._generate_sollstellungen_for_plan(uuid, integer)
  from public, anon, authenticated, service_role;

comment on function private._generate_sollstellungen_for_plan(uuid, integer) is
  'Internal activation helper. Inserts missing initial Sollstellungen from wirksam_ab_monat through December and never rewrites historical rows.';

-- ---------------------------------------------------------------------------
-- 4. Lifecycle guards
-- ---------------------------------------------------------------------------

create or replace function public.tg_wirtschaftsplan_lifecycle_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_manager text;
begin
  v_manager := nullif(pg_catalog.current_setting('app.wirtschaftsplan_lifecycle_manager', true), '');

  if tg_op = 'INSERT' then
    if new.status is null then
      new.status := 'entwurf';
    end if;

    if new.status <> 'entwurf' and v_manager <> '1' then
      raise exception 'Wirtschaftsplan must be inserted as entwurf.'
        using errcode = '23514';
    end if;

    return new;
  end if;

  if (
    old.status is distinct from new.status
    or old.aktiviert_am is distinct from new.aktiviert_am
    or old.abgeloest_am is distinct from new.abgeloest_am
    or old.archiviert_am is distinct from new.archiviert_am
  ) and v_manager <> '1' then
    raise exception 'Wirtschaftsplan lifecycle transitions must use lifecycle RPCs.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.tg_wirtschaftsplan_lifecycle_guard() from public;

drop trigger if exists wirtschaftsplan_lifecycle_guard_insert
  on public.wirtschaftsplan;
create trigger wirtschaftsplan_lifecycle_guard_insert
  before insert on public.wirtschaftsplan
  for each row
  execute function public.tg_wirtschaftsplan_lifecycle_guard();

drop trigger if exists wirtschaftsplan_lifecycle_guard_update
  on public.wirtschaftsplan;
create trigger wirtschaftsplan_lifecycle_guard_update
  before update of status, aktiviert_am, abgeloest_am, archiviert_am
  on public.wirtschaftsplan
  for each row
  execute function public.tg_wirtschaftsplan_lifecycle_guard();

create or replace function public.tg_wirtschaftsplan_prevent_effective_rewrite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'entwurf' then
    raise exception 'Effective Wirtschaftspläne cannot be rewritten. Create a Nachtragswirtschaftsplan instead.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.tg_wirtschaftsplan_prevent_effective_rewrite()
  from public;

drop trigger if exists wirtschaftsplan_prevent_effective_rewrite
  on public.wirtschaftsplan;
create trigger wirtschaftsplan_prevent_effective_rewrite
  before update of bezeichnung, weg_id, jahr, gesamtkosten, version_nr,
    vorgaenger_wirtschaftsplan_id, wirksam_ab_monat
  on public.wirtschaftsplan
  for each row
  when (
    old.bezeichnung is distinct from new.bezeichnung
    or old.weg_id is distinct from new.weg_id
    or old.jahr is distinct from new.jahr
    or old.gesamtkosten is distinct from new.gesamtkosten
    or old.version_nr is distinct from new.version_nr
    or old.vorgaenger_wirtschaftsplan_id is distinct from new.vorgaenger_wirtschaftsplan_id
    or old.wirksam_ab_monat is distinct from new.wirksam_ab_monat
  )
  execute function public.tg_wirtschaftsplan_prevent_effective_rewrite();

-- ---------------------------------------------------------------------------
-- 5. Public lifecycle RPCs
-- ---------------------------------------------------------------------------

create or replace function public.activate_wirtschaftsplan(
  p_wirtschaftsplan_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan record;
  v_existing_active_id uuid;
  v_existing_active_tenant_id uuid;
  v_request_tenant_id uuid;
  v_now timestamptz;
  v_next_version integer;
  v_start_month integer;
begin
  if coalesce(pg_catalog.current_setting('app.actor_type', true), 'user') = 'agent' then
    raise exception 'Agents cannot activate Wirtschaftspläne.'
      using errcode = '42501';
  end if;

  v_request_tenant_id := public.tenant_id();
  if v_request_tenant_id is null then
    raise exception 'Wirtschaftsplan not found or access denied.'
      using errcode = '42501';
  end if;

  select wp.*
    into v_plan
    from public.wirtschaftsplan wp
   where wp.id = p_wirtschaftsplan_id
   for update;

  if not found or v_plan.tenant_id is distinct from v_request_tenant_id then
    raise exception 'Wirtschaftsplan not found or access denied.'
      using errcode = '42501';
  end if;

  if v_plan.status <> 'entwurf' then
    raise exception 'Only draft Wirtschaftspläne can be activated.'
      using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_plan.tenant_id::text || ':' || v_plan.weg_id::text || ':' || v_plan.jahr::text,
      47
    )
  );

  select wp.id, wp.tenant_id
    into v_existing_active_id, v_existing_active_tenant_id
    from public.wirtschaftsplan wp
   where wp.tenant_id = v_plan.tenant_id
     and wp.weg_id = v_plan.weg_id
     and wp.jahr = v_plan.jahr
     and wp.status = 'aktiv'
     and wp.id <> v_plan.id
   for update;

  if v_plan.vorgaenger_wirtschaftsplan_id is not null and not exists (
    select 1
      from public.wirtschaftsplan prev
     where prev.tenant_id = v_plan.tenant_id
       and prev.id = v_plan.vorgaenger_wirtschaftsplan_id
       and prev.weg_id = v_plan.weg_id
       and prev.jahr = v_plan.jahr
       and prev.status in ('aktiv', 'abgeloest', 'archiviert')
  ) then
    raise exception 'Nachtragswirtschaftsplan predecessor must be an effective plan in the same WEG and year.'
      using errcode = '23514';
  end if;

  select coalesce(max(wp.version_nr), 0) + 1
    into v_next_version
    from public.wirtschaftsplan wp
   where wp.tenant_id = v_plan.tenant_id
     and wp.weg_id = v_plan.weg_id
     and wp.jahr = v_plan.jahr
     and wp.status <> 'entwurf'
     and wp.id <> v_plan.id;

  v_now := pg_catalog.now();
  v_start_month := coalesce(v_plan.wirksam_ab_monat, 1);

  perform pg_catalog.set_config('app.wirtschaftsplan_lifecycle_manager', '1', true);

  if v_existing_active_id is not null then
    update public.wirtschaftsplan
       set status = 'abgeloest',
           abgeloest_am = v_now,
           updated_at = v_now
     where tenant_id = v_existing_active_tenant_id
       and id = v_existing_active_id;
  end if;

  update public.wirtschaftsplan
     set status = 'aktiv',
         aktiviert_am = v_now,
         abgeloest_am = null,
         archiviert_am = null,
         version_nr = v_next_version,
         wirksam_ab_monat = v_start_month,
         updated_at = v_now
   where tenant_id = v_plan.tenant_id
     and id = v_plan.id;

  perform private._generate_sollstellungen_for_plan(v_plan.id, v_start_month);
end;
$$;

revoke all on function public.activate_wirtschaftsplan(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.activate_wirtschaftsplan(uuid) to authenticated;

comment on function public.activate_wirtschaftsplan(uuid) is
  'Tenant-checked lifecycle RPC. Serializes tenant/WEG/year, activates one draft, replaces the previous active plan, and posts immutable Sollstellungen.';

create or replace function public.archive_wirtschaftsplan(
  p_wirtschaftsplan_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan record;
  v_request_tenant_id uuid;
  v_now timestamptz;
begin
  if coalesce(pg_catalog.current_setting('app.actor_type', true), 'user') = 'agent' then
    raise exception 'Agents cannot archive Wirtschaftspläne.'
      using errcode = '42501';
  end if;

  v_request_tenant_id := public.tenant_id();
  if v_request_tenant_id is null then
    raise exception 'Wirtschaftsplan not found or access denied.'
      using errcode = '42501';
  end if;

  select wp.*
    into v_plan
    from public.wirtschaftsplan wp
   where wp.id = p_wirtschaftsplan_id
   for update;

  if not found or v_plan.tenant_id is distinct from v_request_tenant_id then
    raise exception 'Wirtschaftsplan not found or access denied.'
      using errcode = '42501';
  end if;

  if v_plan.status not in ('entwurf', 'abgeloest') then
    raise exception 'Only draft or replaced Wirtschaftspläne can be archived.'
      using errcode = '23514';
  end if;

  v_now := pg_catalog.now();
  perform pg_catalog.set_config('app.wirtschaftsplan_lifecycle_manager', '1', true);

  update public.wirtschaftsplan
     set status = 'archiviert',
         archiviert_am = v_now,
         updated_at = v_now
   where tenant_id = v_plan.tenant_id
     and id = v_plan.id;
end;
$$;

revoke all on function public.archive_wirtschaftsplan(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.archive_wirtschaftsplan(uuid) to authenticated;

comment on function public.archive_wirtschaftsplan(uuid) is
  'Tenant-checked lifecycle RPC for archiving draft or replaced Wirtschaftspläne. Active plans must first be replaced.';

create or replace function public.create_nachtragsplan(
  p_wirtschaftsplan_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan record;
  v_request_tenant_id uuid;
  v_new_id uuid;
begin
  if coalesce(pg_catalog.current_setting('app.actor_type', true), 'user') = 'agent' then
    raise exception 'Agents cannot create Nachtragswirtschaftspläne.'
      using errcode = '42501';
  end if;

  v_request_tenant_id := public.tenant_id();
  if v_request_tenant_id is null then
    raise exception 'Wirtschaftsplan not found or access denied.'
      using errcode = '42501';
  end if;

  select wp.*
    into v_plan
    from public.wirtschaftsplan wp
   where wp.id = p_wirtschaftsplan_id
   for update;

  if not found or v_plan.tenant_id is distinct from v_request_tenant_id then
    raise exception 'Wirtschaftsplan not found or access denied.'
      using errcode = '42501';
  end if;

  if v_plan.status <> 'aktiv' then
    raise exception 'Nachtragswirtschaftspläne can only be created from active plans.'
      using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_plan.tenant_id::text || ':' || v_plan.weg_id::text || ':' || v_plan.jahr::text,
      47
    )
  );

  insert into public.wirtschaftsplan (
    tenant_id,
    weg_id,
    jahr,
    bezeichnung,
    gesamtkosten,
    status,
    version_nr,
    vorgaenger_wirtschaftsplan_id,
    wirksam_ab_monat
  ) values (
    v_plan.tenant_id,
    v_plan.weg_id,
    v_plan.jahr,
    v_plan.bezeichnung || ' Nachtrag ' || (v_plan.version_nr + 1)::text,
    v_plan.gesamtkosten,
    'entwurf',
    v_plan.version_nr + 1,
    v_plan.id,
    v_plan.wirksam_ab_monat
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke all on function public.create_nachtragsplan(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.create_nachtragsplan(uuid) to authenticated;

comment on function public.create_nachtragsplan(uuid) is
  'Tenant-checked RPC that creates a draft successor from the currently active Wirtschaftsplan. Activation performs replacement and posting.';

notify pgrst, 'reload schema';
