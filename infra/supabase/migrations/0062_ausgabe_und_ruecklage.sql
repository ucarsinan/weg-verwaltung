-- WEG-Verwaltung migration 0062: Ausgaben und Erhaltungsruecklage.
--
-- Purpose:
--   Unblock the Jahresabrechnung (§ 28 Abs. 2 WEG). Until now the schema had no
--   table for expenses at all, so there was no way to record the costs an
--   annual statement is supposed to distribute.
--
-- Why an expense is just "money out":
--   The WEG-Jahresabrechnung is not a balance sheet. It follows the
--   Zufluss-/Abflussprinzip strictly, and accrual accounting is not merely
--   unnecessary but makes the resolution contestable (BGH V ZR 251/10 — a
--   statement that spread heating costs across periods was void). So an expense
--   carries a value date, an amount, a cost type and an allocation key. No
--   creditor ledger, no invoices, no period boundaries.
--
-- Why the reserve is a separate ledger:
--   A Zufuehrung is two things at once — an outflow from the operating account
--   (hence a distributed expense) AND an increase of the reserve. An Entnahme is
--   neither: it funds an expense that is already booked. Modelling it as an
--   expense would distribute the same cost twice. Keeping the reserve as its own
--   ledger avoids that and makes the four figures § 28 Abs. 2 demands
--   (Anfangsbestand, Zufuehrungen, Entnahmen, Endbestand) directly derivable.
--
-- Risk posture:
--   - Purely additive. No existing table, policy, trigger or function changes.
--   - The reserve balance is derived, never stored.
--   - An Entnahme that would push the balance below zero at its own value date
--     fails closed (23514). A reserve cannot go negative.
--   - Agent writes blocked, audit events emitted, RLS/FORCE RLS as in 0056/0061.
--   - Read path is a security_invoker view, not a SECURITY DEFINER function.
--
-- Deliberately absent:
--   Freezing expenses once an annual statement is resolved. There is no
--   resolution to freeze against yet; that belongs to the Jahresabrechnung
--   slice, together with the question what a resolved accounting year locks.

-- ---------------------------------------------------------------------------
-- 1. Ausgabe
-- ---------------------------------------------------------------------------

create table if not exists public.ausgabe (
  id                                uuid primary key default gen_random_uuid(),
  tenant_id                         uuid not null default public.tenant_id()
                                    references public.tenant(id) on delete restrict,
  weg_id                            uuid not null,
  betrag                            numeric(12, 2) not null check (betrag > 0),
  wert_datum                        date not null,
  empfaenger                        text not null check (char_length(trim(empfaenger)) > 0),
  kostenart                         text not null check (char_length(trim(kostenart)) > 0),
  art                               text not null default 'kosten'
                                    check (art in ('kosten', 'ruecklage_zufuehrung')),
  verteilungsschluessel_version_id  uuid not null,
  quelle                            text not null default 'manuell'
                                    check (quelle in ('manuell', 'camt')),
  notiz                             text,
  created_at                        timestamptz not null default now(),
  updated_at                        timestamptz not null default now(),
  unique (tenant_id, id),
  constraint ausgabe_weg_fk
    foreign key (tenant_id, weg_id)
    references public.weg(tenant_id, id)
    on delete restrict,
  constraint ausgabe_version_fk
    foreign key (tenant_id, verteilungsschluessel_version_id)
    references public.verteilungsschluessel_version(tenant_id, id)
    on delete restrict
);

comment on table public.ausgabe is
  'One outflow of money, cash-basis (Zufluss-/Abflussprinzip). Every expense carries an allocation key because every expense in a Jahresabrechnung is distributed to the units.';
comment on column public.ausgabe.art is
  'kosten = ordinary cost; ruecklage_zufuehrung = transfer into the Erhaltungsruecklage, which is also a distributed cost for the owners.';

create index if not exists ausgabe_weg_idx
  on public.ausgabe (tenant_id, weg_id, wert_datum desc);
create index if not exists ausgabe_version_idx
  on public.ausgabe (tenant_id, verteilungsschluessel_version_id);

-- ---------------------------------------------------------------------------
-- 2. Erhaltungsruecklage als eigenes Konto
-- ---------------------------------------------------------------------------

create table if not exists public.ruecklage_bewegung (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default public.tenant_id()
                references public.tenant(id) on delete restrict,
  weg_id        uuid not null,
  datum         date not null,
  betrag        numeric(12, 2) not null check (betrag > 0),
  richtung      text not null check (richtung in ('anfangsbestand', 'zufuehrung', 'entnahme')),
  ausgabe_id    uuid,
  notiz         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, id),
  constraint ruecklage_bewegung_weg_fk
    foreign key (tenant_id, weg_id)
    references public.weg(tenant_id, id)
    on delete restrict,
  constraint ruecklage_bewegung_ausgabe_fk
    foreign key (tenant_id, ausgabe_id)
    references public.ausgabe(tenant_id, id)
    on delete restrict
);

comment on table public.ruecklage_bewegung is
  'Ledger of the Erhaltungsruecklage (§ 19 Abs. 2 WEG). The balance is always derived from these rows, never stored.';

-- Ein Eroeffnungsbestand je WEG — alles Weitere sind Bewegungen.
create unique index if not exists ruecklage_bewegung_eine_eroeffnung_idx
  on public.ruecklage_bewegung (tenant_id, weg_id)
  where richtung = 'anfangsbestand';

create index if not exists ruecklage_bewegung_weg_idx
  on public.ruecklage_bewegung (tenant_id, weg_id, datum);

-- ---------------------------------------------------------------------------
-- 3. RLS (Muster aus 0056/0061)
-- ---------------------------------------------------------------------------

alter table public.ausgabe enable row level security;
alter table public.ausgabe force row level security;
revoke all on public.ausgabe
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.ausgabe to authenticated;

create policy ausgabe_select_own_tenant
  on public.ausgabe for select to authenticated
  using (tenant_id = (select public.tenant_id()));

create policy ausgabe_insert_own_tenant
  on public.ausgabe for insert to authenticated
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  );

create policy ausgabe_update_own_tenant
  on public.ausgabe for update to authenticated
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

create policy ausgabe_delete_own_tenant
  on public.ausgabe for delete to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  );

alter table public.ruecklage_bewegung enable row level security;
alter table public.ruecklage_bewegung force row level security;
revoke all on public.ruecklage_bewegung
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.ruecklage_bewegung to authenticated;

create policy ruecklage_bewegung_select_own_tenant
  on public.ruecklage_bewegung for select to authenticated
  using (tenant_id = (select public.tenant_id()));

create policy ruecklage_bewegung_insert_own_tenant
  on public.ruecklage_bewegung for insert to authenticated
  with check (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  );

create policy ruecklage_bewegung_update_own_tenant
  on public.ruecklage_bewegung for update to authenticated
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

create policy ruecklage_bewegung_delete_own_tenant
  on public.ruecklage_bewegung for delete to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (
      (select public.has_role('tenant_admin'))
      or (select public.has_role('verwalter_mitarbeiter'))
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Agent-Guard (Funktion aus 0056 wiederverwendet)
-- ---------------------------------------------------------------------------

drop trigger if exists ausgabe_block_agent_writes on public.ausgabe;
create trigger ausgabe_block_agent_writes
  before insert or update or delete on public.ausgabe
  for each row
  execute function public.tg_finance_allocation_block_agent_writes();

drop trigger if exists ruecklage_bewegung_block_agent_writes on public.ruecklage_bewegung;
create trigger ruecklage_bewegung_block_agent_writes
  before insert or update or delete on public.ruecklage_bewegung
  for each row
  execute function public.tg_finance_allocation_block_agent_writes();

-- ---------------------------------------------------------------------------
-- 5. Ausgabe: Verteilungsschluessel muss zur selben WEG gehoeren
-- ---------------------------------------------------------------------------

create or replace function public.tg_ausgabe_validate_weg()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key_weg_id uuid;
begin
  select k.weg_id
    into v_key_weg_id
    from public.verteilungsschluessel_version kv
    join public.verteilungsschluessel k
      on k.tenant_id = kv.tenant_id
     and k.id = kv.verteilungsschluessel_id
   where kv.tenant_id = new.tenant_id
     and kv.id = new.verteilungsschluessel_version_id;

  if v_key_weg_id is distinct from new.weg_id then
    raise exception 'Der Verteilungsschlüssel gehört zu einer anderen WEG.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.tg_ausgabe_validate_weg()
  from public, anon, authenticated, service_role;

drop trigger if exists ausgabe_validate_weg on public.ausgabe;
create trigger ausgabe_validate_weg
  before insert or update on public.ausgabe
  for each row
  execute function public.tg_ausgabe_validate_weg();

-- ---------------------------------------------------------------------------
-- 6. Ruecklage: gleiche WEG, und der Bestand darf nie negativ werden
-- ---------------------------------------------------------------------------

create or replace function public.tg_ruecklage_bewegung_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ausgabe_weg_id uuid;
  v_bestand numeric(12, 2);
begin
  if new.ausgabe_id is not null then
    select a.weg_id
      into v_ausgabe_weg_id
      from public.ausgabe a
     where a.tenant_id = new.tenant_id
       and a.id = new.ausgabe_id;

    if v_ausgabe_weg_id is distinct from new.weg_id then
      raise exception 'Die verknüpfte Ausgabe gehört zu einer anderen WEG.'
        using errcode = '23514';
    end if;
  end if;

  if new.richtung = 'entnahme' then
    -- Bestand zum Stichtag der Entnahme, inklusive dieser Bewegung. Eine
    -- Entnahme darf nicht aus Mitteln gedeckt werden, die erst spaeter
    -- zugefuehrt wurden — deshalb die Stichtagsbetrachtung statt einer
    -- Gesamtsumme.
    select coalesce(sum(
             case b.richtung
               when 'entnahme' then -b.betrag
               else b.betrag
             end
           ), 0)
      into v_bestand
      from public.ruecklage_bewegung b
     where b.tenant_id = new.tenant_id
       and b.weg_id = new.weg_id
       and b.datum <= new.datum
       and b.id is distinct from new.id;

    if v_bestand - new.betrag < 0 then
      raise exception 'Die Entnahme übersteigt den Rücklagenbestand zum % (verfügbar: %).',
        new.datum, v_bestand
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.tg_ruecklage_bewegung_validate()
  from public, anon, authenticated, service_role;

drop trigger if exists ruecklage_bewegung_validate on public.ruecklage_bewegung;
create trigger ruecklage_bewegung_validate
  before insert or update on public.ruecklage_bewegung
  for each row
  execute function public.tg_ruecklage_bewegung_validate();

-- ---------------------------------------------------------------------------
-- 7. Audit-Emitter
-- ---------------------------------------------------------------------------

drop trigger if exists ausgabe_audit_emit on public.ausgabe;
create trigger ausgabe_audit_emit
  after insert or update or delete on public.ausgabe
  for each row execute function audit_writer.tg_emit_audit_event();

drop trigger if exists ruecklage_bewegung_audit_emit on public.ruecklage_bewegung;
create trigger ruecklage_bewegung_audit_emit
  after insert or update or delete on public.ruecklage_bewegung
  for each row execute function audit_writer.tg_emit_audit_event();

-- ---------------------------------------------------------------------------
-- 8. Entwicklung der Ruecklage je Jahr (§ 28 Abs. 2 WEG)
-- ---------------------------------------------------------------------------

create or replace view public.ruecklage_entwicklung
with (security_invoker = on) as
with je_jahr as (
  select
    b.tenant_id,
    b.weg_id,
    pg_catalog.date_part('year', b.datum)::int as jahr,
    sum(case when b.richtung = 'anfangsbestand' then b.betrag else 0 end) as eroeffnung,
    sum(case when b.richtung = 'zufuehrung' then b.betrag else 0 end) as zufuehrungen,
    sum(case when b.richtung = 'entnahme' then b.betrag else 0 end) as entnahmen
  from public.ruecklage_bewegung b
  group by b.tenant_id, b.weg_id, pg_catalog.date_part('year', b.datum)
)
select
  tenant_id,
  weg_id,
  jahr,
  -- Endbestand = laufende Summe aller Bewegungen bis einschliesslich dieses
  -- Jahres. Der Anfangsbestand ergibt sich rueckwaerts daraus, damit ein
  -- eingebuchter Eroeffnungsbestand im Anfang seines eigenen Jahres steht und
  -- nicht als Zufuehrung erscheint.
  (sum(eroeffnung + zufuehrungen - entnahmen) over w
     - zufuehrungen + entnahmen)::numeric(12, 2) as anfangsbestand,
  zufuehrungen::numeric(12, 2) as zufuehrungen,
  entnahmen::numeric(12, 2) as entnahmen,
  (sum(eroeffnung + zufuehrungen - entnahmen) over w)::numeric(12, 2) as endbestand
from je_jahr
window w as (
  partition by tenant_id, weg_id
  order by jahr
  rows between unbounded preceding and current row
);

comment on view public.ruecklage_entwicklung is
  'The four figures § 28 Abs. 2 WEG requires per year: Anfangsbestand, Zufuehrungen, Entnahmen, Endbestand. Derived from ruecklage_bewegung; security_invoker keeps the base table RLS in force.';

grant select on public.ruecklage_entwicklung to authenticated;

notify pgrst, 'reload schema';
