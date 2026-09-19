-- WEG-Verwaltung migration 0061: Zahlungseingaenge und offene Posten.
--
-- Purpose:
--   Give the Forderungsseite a counterpart. public.sollstellung already IS the
--   open item (0036/0039/0040/0042/0047): one immutable row per unit and month.
--   What was missing is the payment side and the link between them, so that an
--   open amount can be derived instead of stored.
--
--   This is the first slice towards § 28 WEG's Jahresabrechnung: without real
--   payment data there is nothing to settle at year end.
--
-- Model:
--   sollstellung (existing) ──< zahlungszuordnung >── zahlung (new)
--   offener Posten = sollstellung.betrag − sum(zahlungszuordnung.betrag)
--
--   A payment is never written into the Sollstellung — that table stays
--   insert-only and historically correct. Partial payments therefore need no
--   special case: allocating less than the open amount simply leaves a rest,
--   and one payment covering several months becomes several allocations.
--
-- Scope (per Nutzerentscheidung 2026-09-19):
--   - manual entry only; `quelle` already allows 'camt' so the import slice
--     needs no further migration.
--   - Ueberweisung only. No SEPA direct debit: that needs a Glaeubiger-ID from
--     the Bundesbank, mandate handling and return processing — its own slice.
--
-- Risk posture:
--   - No change to sollstellung, wirtschaftsplan, the generator, or any
--     existing policy/trigger. Only additive.
--   - Over-allocation fails closed, per payment AND per Sollstellung (23514):
--     money must not be booked twice.
--   - A payment locks once anything is allocated to it (23514), mirroring the
--     draft-only rule wirtschaftsplan_position already uses. Corrections stay
--     possible while nothing is booked; afterwards they need a storno concept,
--     which this slice deliberately does not invent.
--   - Agent writes are blocked on both tables, like every other finance table.
--   - Both tables emit audit events: this is a money path.
--   - The read path is a view with security_invoker, NOT a SECURITY DEFINER
--     function — it inherits the base tables' RLS and adds no new privileged
--     surface for the advisors to flag.
--
-- Debtor note:
--   The claim hangs off the unit, not the person. Resolving "who owes this"
--   goes through public.ownership (von/bis) at read time. Nothing is re-booked
--   when a unit changes hands, because Sollstellungen are historical records.

-- ---------------------------------------------------------------------------
-- 1. Zahlungseingang
-- ---------------------------------------------------------------------------

create table if not exists public.zahlung (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null default public.tenant_id()
                    references public.tenant(id) on delete restrict,
  weg_id            uuid not null,
  betrag            numeric(12, 2) not null check (betrag > 0),
  wert_datum        date not null,
  zahler_referenz   text not null check (char_length(trim(zahler_referenz)) > 0),
  quelle            text not null default 'manuell' check (quelle in ('manuell', 'camt')),
  notiz             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, id),
  constraint zahlung_weg_fk
    foreign key (tenant_id, weg_id)
    references public.weg(tenant_id, id)
    on delete restrict
);

comment on table public.zahlung is
  'Incoming payment for a WEG. Never rewrites a Sollstellung; the link lives in zahlungszuordnung.';
comment on column public.zahlung.zahler_referenz is
  'Payer name or transfer reference as it appeared on the statement — the text a human matches against.';
comment on column public.zahlung.quelle is
  'manuell = entered by hand; camt = imported from a bank statement (import slice pending).';

create index if not exists zahlung_weg_idx
  on public.zahlung (tenant_id, weg_id, wert_datum desc);

-- ---------------------------------------------------------------------------
-- 2. Zuordnung Zahlung -> Sollstellung
-- ---------------------------------------------------------------------------

create table if not exists public.zahlungszuordnung (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null default public.tenant_id()
                    references public.tenant(id) on delete restrict,
  zahlung_id        uuid not null,
  sollstellung_id   uuid not null,
  betrag            numeric(12, 2) not null check (betrag > 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, zahlung_id, sollstellung_id),
  constraint zahlungszuordnung_zahlung_fk
    foreign key (tenant_id, zahlung_id)
    references public.zahlung(tenant_id, id)
    on delete restrict,
  constraint zahlungszuordnung_sollstellung_fk
    foreign key (tenant_id, sollstellung_id)
    references public.sollstellung(tenant_id, id)
    on delete restrict
);

comment on table public.zahlungszuordnung is
  'Allocates part or all of a payment to one Sollstellung. Several rows per payment model a payment covering several months; allocating less than the open amount leaves a partial payment.';

create index if not exists zahlungszuordnung_zahlung_idx
  on public.zahlungszuordnung (tenant_id, zahlung_id);
create index if not exists zahlungszuordnung_sollstellung_idx
  on public.zahlungszuordnung (tenant_id, sollstellung_id);

-- ---------------------------------------------------------------------------
-- 3. RLS (Muster aus 0056)
-- ---------------------------------------------------------------------------

alter table public.zahlung enable row level security;
alter table public.zahlung force row level security;
revoke all on public.zahlung
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.zahlung to authenticated;

create policy zahlung_select_own_tenant
  on public.zahlung for select to authenticated
  using (tenant_id = (select public.tenant_id()));

create policy zahlung_insert_own_tenant
  on public.zahlung for insert to authenticated
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  );

create policy zahlung_update_own_tenant
  on public.zahlung for update to authenticated
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

create policy zahlung_delete_own_tenant
  on public.zahlung for delete to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  );

alter table public.zahlungszuordnung enable row level security;
alter table public.zahlungszuordnung force row level security;
revoke all on public.zahlungszuordnung
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.zahlungszuordnung to authenticated;

create policy zahlungszuordnung_select_own_tenant
  on public.zahlungszuordnung for select to authenticated
  using (tenant_id = (select public.tenant_id()));

create policy zahlungszuordnung_insert_own_tenant
  on public.zahlungszuordnung for insert to authenticated
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  );

create policy zahlungszuordnung_update_own_tenant
  on public.zahlungszuordnung for update to authenticated
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

create policy zahlungszuordnung_delete_own_tenant
  on public.zahlungszuordnung for delete to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Agent-Guard (bestehende Funktion aus 0056 wiederverwendet)
-- ---------------------------------------------------------------------------

drop trigger if exists zahlung_block_agent_writes on public.zahlung;
create trigger zahlung_block_agent_writes
  before insert or update or delete on public.zahlung
  for each row
  execute function public.tg_finance_allocation_block_agent_writes();

drop trigger if exists zahlungszuordnung_block_agent_writes on public.zahlungszuordnung;
create trigger zahlungszuordnung_block_agent_writes
  before insert or update or delete on public.zahlungszuordnung
  for each row
  execute function public.tg_finance_allocation_block_agent_writes();

-- ---------------------------------------------------------------------------
-- 5. Zahlung ist gesperrt, sobald etwas zugeordnet ist
-- ---------------------------------------------------------------------------

create or replace function public.tg_zahlung_lock_when_allocated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  v_id := case when tg_op = 'DELETE' then old.id else new.id end;

  if exists (
    select 1
      from public.zahlungszuordnung z
     where z.tenant_id = case when tg_op = 'DELETE' then old.tenant_id else new.tenant_id end
       and z.zahlung_id = v_id
  ) then
    raise exception 'Eine zugeordnete Zahlung kann nicht mehr geändert oder gelöscht werden. Zuerst die Zuordnung auflösen.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.tg_zahlung_lock_when_allocated()
  from public, anon, authenticated, service_role;

drop trigger if exists zahlung_lock_when_allocated on public.zahlung;
create trigger zahlung_lock_when_allocated
  before update or delete on public.zahlung
  for each row
  execute function public.tg_zahlung_lock_when_allocated();

-- ---------------------------------------------------------------------------
-- 6. Zuordnungs-Guards: gleiche WEG, keine Ueberzuordnung
-- ---------------------------------------------------------------------------

create or replace function public.tg_zahlungszuordnung_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zahlung_weg_id uuid;
  v_zahlung_betrag numeric(12, 2);
  v_soll_weg_id uuid;
  v_soll_betrag numeric(12, 2);
  v_zugeordnet_zahlung numeric(12, 2);
  v_zugeordnet_soll numeric(12, 2);
begin
  select z.weg_id, z.betrag
    into v_zahlung_weg_id, v_zahlung_betrag
    from public.zahlung z
   where z.tenant_id = new.tenant_id
     and z.id = new.zahlung_id
   for update;

  if not found then
    raise exception 'Zahlung nicht gefunden.'
      using errcode = 'P0002';
  end if;

  select u.weg_id, s.betrag
    into v_soll_weg_id, v_soll_betrag
    from public.sollstellung s
    join public.unit u
      on u.tenant_id = s.tenant_id
     and u.id = s.unit_id
   where s.tenant_id = new.tenant_id
     and s.id = new.sollstellung_id
   for update of s;

  if not found then
    raise exception 'Sollstellung nicht gefunden.'
      using errcode = 'P0002';
  end if;

  if v_zahlung_weg_id is distinct from v_soll_weg_id then
    raise exception 'Zahlung und Sollstellung gehören zu verschiedenen WEGs.'
      using errcode = '23514';
  end if;

  -- Summe der uebrigen Zuordnungen dieser Zahlung (bei UPDATE ohne sich selbst).
  select coalesce(sum(z.betrag), 0)
    into v_zugeordnet_zahlung
    from public.zahlungszuordnung z
   where z.tenant_id = new.tenant_id
     and z.zahlung_id = new.zahlung_id
     and z.id is distinct from new.id;

  if v_zugeordnet_zahlung + new.betrag > v_zahlung_betrag then
    raise exception 'Die Zuordnungen überschreiten den Zahlbetrag (% von %).',
      v_zugeordnet_zahlung + new.betrag, v_zahlung_betrag
      using errcode = '23514';
  end if;

  select coalesce(sum(z.betrag), 0)
    into v_zugeordnet_soll
    from public.zahlungszuordnung z
   where z.tenant_id = new.tenant_id
     and z.sollstellung_id = new.sollstellung_id
     and z.id is distinct from new.id;

  if v_zugeordnet_soll + new.betrag > v_soll_betrag then
    raise exception 'Die Sollstellung wäre überzahlt (% von %).',
      v_zugeordnet_soll + new.betrag, v_soll_betrag
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.tg_zahlungszuordnung_validate()
  from public, anon, authenticated, service_role;

drop trigger if exists zahlungszuordnung_validate on public.zahlungszuordnung;
create trigger zahlungszuordnung_validate
  before insert or update on public.zahlungszuordnung
  for each row
  execute function public.tg_zahlungszuordnung_validate();

-- ---------------------------------------------------------------------------
-- 7. Audit-Emitter
-- ---------------------------------------------------------------------------

drop trigger if exists zahlung_audit_emit on public.zahlung;
create trigger zahlung_audit_emit
  after insert or update or delete on public.zahlung
  for each row execute function audit_writer.tg_emit_audit_event();

drop trigger if exists zahlungszuordnung_audit_emit on public.zahlungszuordnung;
create trigger zahlungszuordnung_audit_emit
  after insert or update or delete on public.zahlungszuordnung
  for each row execute function audit_writer.tg_emit_audit_event();

-- ---------------------------------------------------------------------------
-- 8. Offene Posten als abgeleitete Sicht
-- ---------------------------------------------------------------------------

create or replace view public.offener_posten
with (security_invoker = on) as
select
  s.id                                          as sollstellung_id,
  s.tenant_id,
  u.weg_id,
  s.unit_id,
  u.bezeichnung                                 as unit_bezeichnung,
  wp.jahr,
  s.monat,
  s.betrag                                      as soll_betrag,
  coalesce(sum(z.betrag), 0)::numeric(12, 2)    as gezahlt_betrag,
  (s.betrag - coalesce(sum(z.betrag), 0))::numeric(12, 2) as offen_betrag
from public.sollstellung s
join public.unit u
  on u.tenant_id = s.tenant_id
 and u.id = s.unit_id
join public.wirtschaftsplan wp
  on wp.tenant_id = s.tenant_id
 and wp.id = s.wirtschaftsplan_id
left join public.zahlungszuordnung z
  on z.tenant_id = s.tenant_id
 and z.sollstellung_id = s.id
group by s.id, s.tenant_id, u.weg_id, s.unit_id, u.bezeichnung, wp.jahr, s.monat, s.betrag;

comment on view public.offener_posten is
  'Derived open items: Sollstellung minus allocated payments. security_invoker keeps the base tables RLS in force — no privileged read surface is added.';

grant select on public.offener_posten to authenticated;

notify pgrst, 'reload schema';
