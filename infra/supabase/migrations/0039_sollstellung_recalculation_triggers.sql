-- WEG-Verwaltung migration 0039: historical Sollstellung generation.
--
-- Option B: Sollstellungen are historical Forderungsdatensätze. Once created,
-- they must not be recalculated, overwritten, or deleted because a
-- Wirtschaftsplan, Unit, or MEA value changes later. New business events create
-- new records; this migration only generates missing rows idempotently.

-- ---------------------------------------------------------------------------
-- 1. Remove obsolete recalculation trigger chain
-- ---------------------------------------------------------------------------

drop trigger if exists wirtschaftsplan_recalculate_sollstellungen on public.wirtschaftsplan;
drop trigger if exists unit_recalculate_sollstellungen on public.unit;

drop function if exists public.tg_wirtschaftsplan_recalculate_sollstellungen();
drop function if exists public.tg_unit_recalculate_sollstellungen();
drop function if exists public._generate_sollstellungen_for_plan(uuid, uuid);
drop function if exists public._generate_sollstellungen_for_plan(uuid);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

-- Existing migration 0036 created this FK with ON DELETE CASCADE. Historical
-- Sollstellungen must survive as records, so plan deletion is restricted once
-- generated rows exist.
alter table public.sollstellung
  drop constraint if exists sollstellung_wirtschaftsplan_fk;

alter table public.sollstellung
  add constraint sollstellung_wirtschaftsplan_fk
  foreign key (tenant_id, wirtschaftsplan_id)
  references public.wirtschaftsplan(tenant_id, id)
  on delete restrict;

alter table public.sollstellung
  add column if not exists buchungstyp text not null default 'initial',
  add column if not exists korrektur_von_sollstellung_id uuid,
  add column if not exists gebucht_am timestamptz not null default now(),
  add column if not exists quelle text not null default 'wirtschaftsplan';

alter table public.sollstellung
  drop constraint if exists sollstellung_tenant_id_wirtschaftsplan_id_unit_id_monat_key,
  drop constraint if exists sollstellung_betrag_check,
  drop constraint if exists sollstellung_betrag_ledger_check,
  add constraint sollstellung_betrag_ledger_check
    check (
      (buchungstyp = 'initial' and betrag >= 0)
      or (buchungstyp = 'korrektur' and betrag <> 0)
    ),
  drop constraint if exists sollstellung_buchungstyp_check,
  add constraint sollstellung_buchungstyp_check
    check (buchungstyp in ('initial', 'korrektur')),
  drop constraint if exists sollstellung_korrektur_fk,
  add constraint sollstellung_korrektur_fk
    foreign key (tenant_id, korrektur_von_sollstellung_id)
    references public.sollstellung(tenant_id, id)
    on delete restrict,
  drop constraint if exists sollstellung_korrektur_shape_check,
  add constraint sollstellung_korrektur_shape_check
    check (
      (buchungstyp = 'initial' and korrektur_von_sollstellung_id is null)
      or (buchungstyp = 'korrektur' and korrektur_von_sollstellung_id is not null)
    );

drop index if exists public.sollstellung_initial_unique_idx;
create unique index sollstellung_initial_unique_idx
  on public.sollstellung (tenant_id, wirtschaftsplan_id, unit_id, monat)
  where buchungstyp = 'initial';

comment on column public.sollstellung.buchungstyp is
  'Ledger row type. Initial rows come from a Wirtschaftsplan; correction rows are future append-only postings.';

comment on column public.sollstellung.korrektur_von_sollstellung_id is
  'Optional same-tenant reference to the original Sollstellung when a future correction row is posted.';

comment on column public.sollstellung.gebucht_am is
  'Posting timestamp of the immutable Sollstellung ledger row.';

comment on column public.sollstellung.quelle is
  'Posting source, e.g. wirtschaftsplan. Future Nachtrags-/correction workflows can extend this.';

-- ---------------------------------------------------------------------------
-- 2. Internal insert-only generator
-- ---------------------------------------------------------------------------

create or replace function private._generate_sollstellungen_for_plan(
  p_wirtschaftsplan_id uuid
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
begin
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
    cross join pg_catalog.generate_series(1, 12) as months(monat)
    where u.tenant_id = v_tenant_id
      and u.weg_id = v_weg_id
    order by u.id, months.monat
  ) as generated
  on conflict (tenant_id, wirtschaftsplan_id, unit_id, monat)
    where buchungstyp = 'initial'
  do nothing;
end;
$$;

revoke all on function private._generate_sollstellungen_for_plan(uuid)
  from public, anon, authenticated, service_role;

comment on function private._generate_sollstellungen_for_plan(uuid) is
  'Internal insert-only helper for missing Sollstellungen. Existing historical rows are never updated or deleted.';

-- ---------------------------------------------------------------------------
-- 3. Public RPC with explicit tenant check
-- ---------------------------------------------------------------------------

create or replace function public.generate_sollstellungen(p_wirtschaftsplan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_request_tenant_id uuid;
begin
  if coalesce(pg_catalog.current_setting('app.actor_type', true), 'user') = 'agent' then
    raise exception 'Agents cannot generate Sollstellungen.'
      using errcode = '42501';
  end if;

  v_request_tenant_id := public.tenant_id();

  if v_request_tenant_id is null then
    raise exception 'Wirtschaftsplan not found or access denied.'
      using errcode = '42501';
  end if;

  select wp.tenant_id
    into v_tenant_id
    from public.wirtschaftsplan as wp
   where wp.id = p_wirtschaftsplan_id;

  if not found or v_tenant_id is distinct from v_request_tenant_id then
    raise exception 'Wirtschaftsplan not found or access denied.'
      using errcode = '42501';
  end if;

  perform private._generate_sollstellungen_for_plan(p_wirtschaftsplan_id);
end;
$$;

revoke all on function public.generate_sollstellungen(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.generate_sollstellungen(uuid) to authenticated;
revoke execute on function public.generate_sollstellungen(uuid) from service_role;

comment on function public.generate_sollstellungen(uuid) is
  'Tenant-checked RPC for idempotently inserting missing Sollstellungen. It never recalculates existing rows.';

-- ---------------------------------------------------------------------------
-- 4. Insert trigger for initial generation only
-- ---------------------------------------------------------------------------

create or replace function public.tg_wirtschaftsplan_generate_missing_sollstellungen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private._generate_sollstellungen_for_plan(new.id);
  return new;
end;
$$;

revoke all on function public.tg_wirtschaftsplan_generate_missing_sollstellungen()
  from public, anon, authenticated, service_role;

drop trigger if exists wirtschaftsplan_generate_missing_sollstellungen on public.wirtschaftsplan;
create trigger wirtschaftsplan_generate_missing_sollstellungen
  after insert on public.wirtschaftsplan
  for each row
  execute function public.tg_wirtschaftsplan_generate_missing_sollstellungen();

-- Backfill existing Wirtschaftspläne that were created after 0036 but before
-- this trigger existed. The helper is insert-only, so partial historical data
-- is not rewritten.
do $$
declare
  v_plan record;
begin
  for v_plan in
    select id
      from public.wirtschaftsplan
     order by tenant_id, id
  loop
    perform private._generate_sollstellungen_for_plan(v_plan.id);
  end loop;
end;
$$;
