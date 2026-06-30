-- WEG-Verwaltung migration 0056: finance allocation foundation.
--
-- Purpose:
--   Model stable allocation keys, versioned allocation rules, basis values,
--   and economic plan lines without changing the existing immutable
--   Sollstellung generator.
--
-- Risk posture:
--   - No existing Sollstellungen are recalculated.
--   - No change to activate_wirtschaftsplan().
--   - New tables are tenant-scoped with RLS/FORCE RLS and composite FKs.
--   - Same-WEG consistency is enforced across keys, versions, units, plans,
--     and optional resolution anchors.
--   - Agent actor writes are blocked because finance rules are critical.
--   - Plan lines are editable only while the parent Wirtschaftsplan is a draft.

-- ---------------------------------------------------------------------------
-- 1. Stable allocation keys
-- ---------------------------------------------------------------------------

create table if not exists public.verteilungsschluessel (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default public.tenant_id()
                  references public.tenant(id) on delete restrict,
  weg_id          uuid not null,
  name            text not null check (char_length(trim(name)) > 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, weg_id, name),
  constraint verteilungsschluessel_weg_fk
    foreign key (tenant_id, weg_id)
    references public.weg(tenant_id, id)
    on delete restrict
);

comment on table public.verteilungsschluessel is
  'Stable allocation key for a WEG. Concrete rules live in verteilungsschluessel_version.';

create index if not exists verteilungsschluessel_weg_idx
  on public.verteilungsschluessel (tenant_id, weg_id);

-- ---------------------------------------------------------------------------
-- 2. Versioned allocation rules
-- ---------------------------------------------------------------------------

create table if not exists public.verteilungsschluessel_version (
  id                         uuid primary key default gen_random_uuid(),
  tenant_id                  uuid not null default public.tenant_id()
                             references public.tenant(id) on delete restrict,
  verteilungsschluessel_id   uuid not null,
  typ                        text not null check (typ in (
                               'mea',
                               'einheit',
                               'flaeche',
                               'verbrauch',
                               'manuell',
                               'gemischt'
                             )),
  quelle                     text not null check (quelle in (
                               'gesetz',
                               'teilungserklaerung',
                               'gemeinschaftsordnung',
                               'beschluss',
                               'manuell'
                             )),
  resolution_id              uuid,
  gueltig_ab                 date not null,
  gueltig_bis                date,
  parameter                  jsonb not null default '{}'::jsonb,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, verteilungsschluessel_id, gueltig_ab),
  constraint verteilungsschluessel_version_key_fk
    foreign key (tenant_id, verteilungsschluessel_id)
    references public.verteilungsschluessel(tenant_id, id)
    on delete restrict,
  constraint verteilungsschluessel_version_resolution_fk
    foreign key (tenant_id, resolution_id)
    references public.resolution(tenant_id, id)
    on delete restrict,
  constraint verteilungsschluessel_version_period_valid
    check (gueltig_bis is null or gueltig_bis >= gueltig_ab)
);

comment on table public.verteilungsschluessel_version is
  'Versioned allocation rule. Mixed rules can store parameters such as heating 70 percent consumption and 30 percent area.';
comment on column public.verteilungsschluessel_version.parameter is
  'Rule parameters, e.g. {"parts":[{"typ":"verbrauch","gewicht":70},{"typ":"flaeche","gewicht":30}]}.';

create index if not exists verteilungsschluessel_version_key_idx
  on public.verteilungsschluessel_version (
    tenant_id,
    verteilungsschluessel_id,
    gueltig_ab desc
  );
create index if not exists verteilungsschluessel_version_resolution_idx
  on public.verteilungsschluessel_version (tenant_id, resolution_id)
  where resolution_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Allocation basis values
-- ---------------------------------------------------------------------------

create table if not exists public.verteilungsschluessel_basiswert (
  id                                uuid primary key default gen_random_uuid(),
  tenant_id                         uuid not null default public.tenant_id()
                                    references public.tenant(id) on delete restrict,
  verteilungsschluessel_version_id  uuid not null,
  unit_id                           uuid not null,
  wert                              numeric(18, 6) not null check (wert >= 0),
  einheit                           text not null check (char_length(trim(einheit)) > 0),
  gueltig_ab                        date not null,
  gueltig_bis                       date,
  notiz                             text,
  created_at                        timestamptz not null default now(),
  updated_at                        timestamptz not null default now(),
  unique (tenant_id, id),
  unique (
    tenant_id,
    verteilungsschluessel_version_id,
    unit_id,
    gueltig_ab
  ),
  constraint verteilungsschluessel_basiswert_version_fk
    foreign key (tenant_id, verteilungsschluessel_version_id)
    references public.verteilungsschluessel_version(tenant_id, id)
    on delete restrict,
  constraint verteilungsschluessel_basiswert_unit_fk
    foreign key (tenant_id, unit_id)
    references public.unit(tenant_id, id)
    on delete restrict,
  constraint verteilungsschluessel_basiswert_period_valid
    check (gueltig_bis is null or gueltig_bis >= gueltig_ab)
);

comment on table public.verteilungsschluessel_basiswert is
  'Versioned per-unit basis values for allocation rules, such as area, consumption, MEA snapshots, or manual shares.';

create index if not exists verteilungsschluessel_basiswert_version_idx
  on public.verteilungsschluessel_basiswert (
    tenant_id,
    verteilungsschluessel_version_id,
    gueltig_ab desc
  );
create index if not exists verteilungsschluessel_basiswert_unit_idx
  on public.verteilungsschluessel_basiswert (tenant_id, unit_id);

-- ---------------------------------------------------------------------------
-- 4. Economic plan positions
-- ---------------------------------------------------------------------------

create table if not exists public.wirtschaftsplan_position (
  id                                  uuid primary key default gen_random_uuid(),
  tenant_id                           uuid not null default public.tenant_id()
                                      references public.tenant(id) on delete restrict,
  wirtschaftsplan_id                  uuid not null,
  position                            integer not null check (position > 0),
  kostenart                           text not null check (char_length(trim(kostenart)) > 0),
  beschreibung                        text,
  jahresbetrag                        numeric(12, 2) not null check (jahresbetrag >= 0),
  verteilungsschluessel_version_id    uuid not null,
  verteilungsschluessel_snapshot      jsonb not null default '{}'::jsonb,
  created_at                          timestamptz not null default now(),
  updated_at                          timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, wirtschaftsplan_id, position),
  constraint wirtschaftsplan_position_plan_fk
    foreign key (tenant_id, wirtschaftsplan_id)
    references public.wirtschaftsplan(tenant_id, id)
    on delete restrict,
  constraint wirtschaftsplan_position_version_fk
    foreign key (tenant_id, verteilungsschluessel_version_id)
    references public.verteilungsschluessel_version(tenant_id, id)
    on delete restrict
);

comment on table public.wirtschaftsplan_position is
  'Line item of a Wirtschaftsplan. The current Sollstellung generator does not consume these rows yet.';
comment on column public.wirtschaftsplan_position.verteilungsschluessel_snapshot is
  'Immutable rule snapshot for future calculations. Kept explicit so later key edits do not silently reinterpret historical plan lines.';

create index if not exists wirtschaftsplan_position_plan_idx
  on public.wirtschaftsplan_position (tenant_id, wirtschaftsplan_id, position);
create index if not exists wirtschaftsplan_position_version_idx
  on public.wirtschaftsplan_position (tenant_id, verteilungsschluessel_version_id);

-- ---------------------------------------------------------------------------
-- 5. RLS and grants
-- ---------------------------------------------------------------------------

alter table public.verteilungsschluessel enable row level security;
alter table public.verteilungsschluessel force row level security;
revoke all on public.verteilungsschluessel
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.verteilungsschluessel to authenticated;

create policy verteilungsschluessel_select_own_tenant
  on public.verteilungsschluessel for select to authenticated
  using (tenant_id = (select public.tenant_id()));

create policy verteilungsschluessel_insert_own_tenant
  on public.verteilungsschluessel for insert to authenticated
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  );

create policy verteilungsschluessel_update_own_tenant
  on public.verteilungsschluessel for update to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  )
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  );

create policy verteilungsschluessel_delete_own_tenant
  on public.verteilungsschluessel for delete to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  );

alter table public.verteilungsschluessel_version enable row level security;
alter table public.verteilungsschluessel_version force row level security;
revoke all on public.verteilungsschluessel_version
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.verteilungsschluessel_version to authenticated;

create policy verteilungsschluessel_version_select_own_tenant
  on public.verteilungsschluessel_version for select to authenticated
  using (tenant_id = (select public.tenant_id()));

create policy verteilungsschluessel_version_insert_own_tenant
  on public.verteilungsschluessel_version for insert to authenticated
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  );

create policy verteilungsschluessel_version_update_own_tenant
  on public.verteilungsschluessel_version for update to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  )
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  );

create policy verteilungsschluessel_version_delete_own_tenant
  on public.verteilungsschluessel_version for delete to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  );

alter table public.verteilungsschluessel_basiswert enable row level security;
alter table public.verteilungsschluessel_basiswert force row level security;
revoke all on public.verteilungsschluessel_basiswert
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.verteilungsschluessel_basiswert to authenticated;

create policy verteilungsschluessel_basiswert_select_own_tenant
  on public.verteilungsschluessel_basiswert for select to authenticated
  using (tenant_id = (select public.tenant_id()));

create policy verteilungsschluessel_basiswert_insert_own_tenant
  on public.verteilungsschluessel_basiswert for insert to authenticated
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  );

create policy verteilungsschluessel_basiswert_update_own_tenant
  on public.verteilungsschluessel_basiswert for update to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  )
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  );

create policy verteilungsschluessel_basiswert_delete_own_tenant
  on public.verteilungsschluessel_basiswert for delete to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  );

alter table public.wirtschaftsplan_position enable row level security;
alter table public.wirtschaftsplan_position force row level security;
revoke all on public.wirtschaftsplan_position
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.wirtschaftsplan_position to authenticated;

create policy wirtschaftsplan_position_select_own_tenant
  on public.wirtschaftsplan_position for select to authenticated
  using (tenant_id = (select public.tenant_id()));

create policy wirtschaftsplan_position_insert_own_tenant
  on public.wirtschaftsplan_position for insert to authenticated
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  );

create policy wirtschaftsplan_position_update_own_tenant
  on public.wirtschaftsplan_position for update to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  )
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  );

create policy wirtschaftsplan_position_delete_own_tenant
  on public.wirtschaftsplan_position for delete to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Agent, WEG consistency, and lifecycle guards
-- ---------------------------------------------------------------------------

create or replace function public.tg_finance_allocation_block_agent_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(pg_catalog.current_setting('app.actor_type', true), 'user') = 'agent' then
    raise exception 'Agents cannot write finance allocation rules or plan positions.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.tg_finance_allocation_block_agent_writes()
  from public, anon, authenticated, service_role;

create trigger verteilungsschluessel_block_agent_writes
  before insert or update or delete on public.verteilungsschluessel
  for each row
  execute function public.tg_finance_allocation_block_agent_writes();

create trigger verteilungsschluessel_version_block_agent_writes
  before insert or update or delete on public.verteilungsschluessel_version
  for each row
  execute function public.tg_finance_allocation_block_agent_writes();

create trigger verteilungsschluessel_basiswert_block_agent_writes
  before insert or update or delete on public.verteilungsschluessel_basiswert
  for each row
  execute function public.tg_finance_allocation_block_agent_writes();

create trigger wirtschaftsplan_position_block_agent_writes
  before insert or update or delete on public.wirtschaftsplan_position
  for each row
  execute function public.tg_finance_allocation_block_agent_writes();

create or replace function public.tg_verteilungsschluessel_version_validate_weg()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key_weg_id uuid;
  v_resolution_weg_id uuid;
begin
  select k.weg_id
    into v_key_weg_id
    from public.verteilungsschluessel k
   where k.tenant_id = new.tenant_id
     and k.id = new.verteilungsschluessel_id;

  if v_key_weg_id is null then
    raise exception 'Allocation key not found for version.'
      using errcode = '23503';
  end if;

  if new.resolution_id is not null then
    select m.weg_id
      into v_resolution_weg_id
      from public.resolution r
      join public.meeting m
        on m.tenant_id = r.tenant_id
       and m.id = r.meeting_id
     where r.tenant_id = new.tenant_id
       and r.id = new.resolution_id;

    if v_resolution_weg_id is distinct from v_key_weg_id then
      raise exception 'Allocation key resolution anchor must belong to the same WEG.'
        using errcode = '23514';
    end if;
  end if;

  if exists (
    select 1
      from public.verteilungsschluessel_version existing
     where existing.tenant_id = new.tenant_id
       and existing.verteilungsschluessel_id = new.verteilungsschluessel_id
       and existing.id is distinct from new.id
       and existing.gueltig_ab <= coalesce(new.gueltig_bis, 'infinity'::date)
       and new.gueltig_ab <= coalesce(existing.gueltig_bis, 'infinity'::date)
  ) then
    raise exception 'Allocation key versions must not have overlapping validity periods.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.tg_verteilungsschluessel_version_validate_weg()
  from public, anon, authenticated, service_role;

create trigger verteilungsschluessel_version_validate_weg
  before insert or update of verteilungsschluessel_id, resolution_id,
    gueltig_ab, gueltig_bis
  on public.verteilungsschluessel_version
  for each row
  execute function public.tg_verteilungsschluessel_version_validate_weg();

create or replace function public.tg_verteilungsschluessel_basiswert_validate_weg()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key_weg_id uuid;
  v_unit_weg_id uuid;
begin
  select k.weg_id
    into v_key_weg_id
    from public.verteilungsschluessel_version kv
    join public.verteilungsschluessel k
      on k.tenant_id = kv.tenant_id
     and k.id = kv.verteilungsschluessel_id
   where kv.tenant_id = new.tenant_id
     and kv.id = new.verteilungsschluessel_version_id;

  select u.weg_id
    into v_unit_weg_id
    from public.unit u
   where u.tenant_id = new.tenant_id
     and u.id = new.unit_id;

  if v_key_weg_id is distinct from v_unit_weg_id then
    raise exception 'Allocation basis value unit must belong to the same WEG as the allocation key.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
      from public.verteilungsschluessel_basiswert existing
     where existing.tenant_id = new.tenant_id
       and existing.verteilungsschluessel_version_id = new.verteilungsschluessel_version_id
       and existing.unit_id = new.unit_id
       and existing.id is distinct from new.id
       and existing.gueltig_ab <= coalesce(new.gueltig_bis, 'infinity'::date)
       and new.gueltig_ab <= coalesce(existing.gueltig_bis, 'infinity'::date)
  ) then
    raise exception 'Allocation basis values must not have overlapping validity periods per unit.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.tg_verteilungsschluessel_basiswert_validate_weg()
  from public, anon, authenticated, service_role;

create trigger verteilungsschluessel_basiswert_validate_weg
  before insert or update of verteilungsschluessel_version_id, unit_id,
    gueltig_ab, gueltig_bis
  on public.verteilungsschluessel_basiswert
  for each row
  execute function public.tg_verteilungsschluessel_basiswert_validate_weg();

create or replace function public.tg_wirtschaftsplan_position_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_weg_id uuid;
  v_plan_status text;
  v_key_weg_id uuid;
  v_plan_id uuid;
  v_tenant_id uuid;
  v_version_id uuid;
begin
  if tg_op = 'DELETE' then
    v_plan_id := old.wirtschaftsplan_id;
    v_tenant_id := old.tenant_id;
    v_version_id := old.verteilungsschluessel_version_id;
  else
    v_plan_id := new.wirtschaftsplan_id;
    v_tenant_id := new.tenant_id;
    v_version_id := new.verteilungsschluessel_version_id;
  end if;

  select wp.weg_id, wp.status
    into v_plan_weg_id, v_plan_status
    from public.wirtschaftsplan wp
   where wp.tenant_id = v_tenant_id
     and wp.id = v_plan_id;

  if v_plan_status is distinct from 'entwurf' then
    raise exception 'Wirtschaftsplan positions can only be changed while the plan is a draft.'
      using errcode = '23514';
  end if;

  select k.weg_id
    into v_key_weg_id
    from public.verteilungsschluessel_version kv
    join public.verteilungsschluessel k
      on k.tenant_id = kv.tenant_id
     and k.id = kv.verteilungsschluessel_id
   where kv.tenant_id = v_tenant_id
     and kv.id = v_version_id;

  if v_key_weg_id is distinct from v_plan_weg_id then
    raise exception 'Wirtschaftsplan position allocation key must belong to the same WEG as the plan.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.tg_wirtschaftsplan_position_validate()
  from public, anon, authenticated, service_role;

create trigger wirtschaftsplan_position_validate
  before insert or update or delete on public.wirtschaftsplan_position
  for each row
  execute function public.tg_wirtschaftsplan_position_validate();

comment on function public.tg_finance_allocation_block_agent_writes() is
  'Blocks actor_type=agent writes to finance allocation rule tables and plan positions.';
comment on function public.tg_verteilungsschluessel_version_validate_weg() is
  'Ensures optional resolution anchors belong to the same WEG as the allocation key.';
comment on function public.tg_verteilungsschluessel_basiswert_validate_weg() is
  'Ensures basis value units belong to the same WEG as the allocation key.';
comment on function public.tg_wirtschaftsplan_position_validate() is
  'Ensures plan positions stay draft-only and use allocation keys from the same WEG.';

-- ---------------------------------------------------------------------------
-- 7. Audit integration
-- ---------------------------------------------------------------------------

drop trigger if exists verteilungsschluessel_audit_emit
  on public.verteilungsschluessel;
create trigger verteilungsschluessel_audit_emit
  after insert or update or delete on public.verteilungsschluessel
  for each row execute function audit_writer.tg_emit_audit_event();

drop trigger if exists verteilungsschluessel_version_audit_emit
  on public.verteilungsschluessel_version;
create trigger verteilungsschluessel_version_audit_emit
  after insert or update or delete on public.verteilungsschluessel_version
  for each row execute function audit_writer.tg_emit_audit_event();

drop trigger if exists verteilungsschluessel_basiswert_audit_emit
  on public.verteilungsschluessel_basiswert;
create trigger verteilungsschluessel_basiswert_audit_emit
  after insert or update or delete on public.verteilungsschluessel_basiswert
  for each row execute function audit_writer.tg_emit_audit_event();

drop trigger if exists wirtschaftsplan_position_audit_emit
  on public.wirtschaftsplan_position;
create trigger wirtschaftsplan_position_audit_emit
  after insert or update or delete on public.wirtschaftsplan_position
  for each row execute function audit_writer.tg_emit_audit_event();

notify pgrst, 'reload schema';
