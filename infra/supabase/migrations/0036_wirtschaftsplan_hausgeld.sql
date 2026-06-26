-- WEG-Verwaltung migration 0036: Wirtschaftsplan and Sollstellung
-- See docs/01-system-design.md § 4.1.

-- ---------------------------------------------------------------------------
-- 1. Table Definitions
-- ---------------------------------------------------------------------------

create table if not exists public.wirtschaftsplan (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default public.tenant_id()
                  references public.tenant(id) on delete restrict,
  weg_id          uuid not null,
  jahr            integer not null check (jahr >= 1900 and jahr <= 2100),
  bezeichnung     text not null check (char_length(trim(bezeichnung)) > 0),
  gesamtkosten    numeric(12, 2) not null check (gesamtkosten >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, weg_id, jahr),
  constraint wirtschaftsplan_weg_fk
    foreign key (tenant_id, weg_id)
    references public.weg(tenant_id, id)
    on delete restrict
);

comment on table public.wirtschaftsplan is
  'Wirtschaftsplan (annual budget) for a WEG. Includes total annual costs.';

create table if not exists public.sollstellung (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null default public.tenant_id()
                      references public.tenant(id) on delete restrict,
  wirtschaftsplan_id  uuid not null,
  unit_id             uuid not null,
  monat               integer not null check (monat >= 1 and monat <= 12),
  betrag              numeric(12, 2) not null check (betrag >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, wirtschaftsplan_id, unit_id, monat),
  constraint sollstellung_wirtschaftsplan_fk
    foreign key (tenant_id, wirtschaftsplan_id)
    references public.wirtschaftsplan(tenant_id, id)
    on delete cascade,
  constraint sollstellung_unit_fk
    foreign key (tenant_id, unit_id)
    references public.unit(tenant_id, id)
    on delete restrict
);

comment on table public.sollstellung is
  'Monthly Hausgeld target payment (Sollstellung) for a unit under a Wirtschaftsplan.';

-- Indexes for foreign keys
create index if not exists wirtschaftsplan_weg_idx on public.wirtschaftsplan (tenant_id, weg_id);
create index if not exists sollstellung_wp_idx on public.sollstellung (tenant_id, wirtschaftsplan_id);
create index if not exists sollstellung_unit_idx on public.sollstellung (tenant_id, unit_id);

-- ---------------------------------------------------------------------------
-- 2. Row Level Security (RLS)
-- ---------------------------------------------------------------------------

-- public.wirtschaftsplan RLS
alter table public.wirtschaftsplan enable row level security;
alter table public.wirtschaftsplan force row level security;
revoke all on public.wirtschaftsplan from public;
grant select, insert, update, delete on public.wirtschaftsplan to authenticated;

create policy wirtschaftsplan_select_own_tenant
  on public.wirtschaftsplan for select to authenticated
  using (tenant_id = (select public.tenant_id()));

create policy wirtschaftsplan_insert_own_tenant
  on public.wirtschaftsplan for insert to authenticated
  with check (tenant_id = (select public.tenant_id()));

create policy wirtschaftsplan_update_own_tenant
  on public.wirtschaftsplan for update to authenticated
  using (tenant_id = (select public.tenant_id()))
  with check (tenant_id = (select public.tenant_id()));

create policy wirtschaftsplan_delete_own_tenant
  on public.wirtschaftsplan for delete to authenticated
  using (tenant_id = (select public.tenant_id()));

-- public.sollstellung RLS
alter table public.sollstellung enable row level security;
alter table public.sollstellung force row level security;
revoke all on public.sollstellung from public;
grant select, insert, update, delete on public.sollstellung to authenticated;

create policy sollstellung_select_own_tenant
  on public.sollstellung for select to authenticated
  using (tenant_id = (select public.tenant_id()));

create policy sollstellung_insert_own_tenant
  on public.sollstellung for insert to authenticated
  with check (tenant_id = (select public.tenant_id()));

create policy sollstellung_update_own_tenant
  on public.sollstellung for update to authenticated
  using (tenant_id = (select public.tenant_id()))
  with check (tenant_id = (select public.tenant_id()));

create policy sollstellung_delete_own_tenant
  on public.sollstellung for delete to authenticated
  using (tenant_id = (select public.tenant_id()));

-- ---------------------------------------------------------------------------
-- 3. Audit Trail Trigger Integration
-- ---------------------------------------------------------------------------

drop trigger if exists wirtschaftsplan_audit_emit on public.wirtschaftsplan;
create trigger wirtschaftsplan_audit_emit
  after insert or update or delete on public.wirtschaftsplan
  for each row execute function audit_writer.tg_emit_audit_event();

drop trigger if exists sollstellung_audit_emit on public.sollstellung;
create trigger sollstellung_audit_emit
  after insert or update or delete on public.sollstellung
  for each row execute function audit_writer.tg_emit_audit_event();

-- ---------------------------------------------------------------------------
-- 4. public.generate_sollstellungen() Helper Function
-- ---------------------------------------------------------------------------

create or replace function public.generate_sollstellungen(p_wirtschaftsplan_id uuid)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_tenant_id uuid;
  v_weg_id uuid;
  v_gesamtkosten numeric(12, 2);
  v_unit record;
  v_monat integer;
  v_betrag numeric(12, 2);
begin
  -- Fetch the Wirtschaftsplan details. If RLS blocks it, this returns null/no rows.
  select tenant_id, weg_id, gesamtkosten
    into v_tenant_id, v_weg_id, v_gesamtkosten
    from public.wirtschaftsplan
   where id = p_wirtschaftsplan_id;

  if not found then
    raise exception 'Wirtschaftsplan not found or access denied.'
      using errcode = 'P0002';
  end if;

  -- Loop through each unit in the WEG
  for v_unit in
    select id, mea_zaehler, mea_nenner
      from public.unit
     where tenant_id = v_tenant_id
       and weg_id = v_weg_id
  loop
    -- Calculate betrag: (gesamtkosten * (mea_zaehler / mea_nenner)) / 12.
    -- Units with no usable MEA denominator receive a 0.00 Sollstellung instead
    -- of aborting the whole plan with division-by-zero.
    if v_unit.mea_nenner <= 0 or v_unit.mea_zaehler <= 0 then
      v_betrag := 0;
    else
      v_betrag := round(((v_unit.mea_zaehler::numeric / v_unit.mea_nenner::numeric) * v_gesamtkosten) / 12.0, 2);
    end if;

    -- Insert 12 monthly Sollstellungen
    for v_monat in 1..12 loop
      insert into public.sollstellung (
        tenant_id,
        wirtschaftsplan_id,
        unit_id,
        monat,
        betrag
      ) values (
        v_tenant_id,
        p_wirtschaftsplan_id,
        v_unit.id,
        v_monat,
        v_betrag
      )
      on conflict (tenant_id, wirtschaftsplan_id, unit_id, monat) do update
        set betrag = excluded.betrag,
            updated_at = now();
    end loop;
  end loop;
end;
$$;

revoke all on function public.generate_sollstellungen(uuid) from public;
grant execute on function public.generate_sollstellungen(uuid) to authenticated, service_role;

comment on function public.generate_sollstellungen(uuid) is
  'Automatically computes and inserts 12 monthly Sollstellungen for all units in the WEG associated with the given Wirtschaftsplan.';
