-- WEG-Verwaltung migration 0063: Jahresabrechnung (§ 28 Abs. 2 WEG).
--
-- Purpose:
--   The third obligation from § 28 WEG, and the first one for which every input
--   now exists: Sollstellungen (the resolved advances), Ausgaben (0062),
--   allocation keys (0056/0060) and the reserve development (0062).
--
-- What is actually resolved:
--   Since the WEMoG the owners no longer resolve the statement as a whole, only
--   "die Einforderung von Nachschüssen oder die Anpassung der Vorschüsse"
--   (§ 28 Abs. 2) — the Abrechnungsspitze.
--
--   Spitze = anteilige tatsaechliche Kosten − beschlossene Vorschuesse (SOLL).
--
--   Deliberately against the Soll, not against payments received: arrears stay
--   owed from the Wirtschaftsplan in their own right. Subtracting actual
--   payments would move the arrears into the Spitze and replace the original
--   claim, which is exactly what the BGH case law avoids.
--
-- Debtor (Faelligkeitstheorie, BGH V ZR 113/11):
--   Whoever owns the unit when the resolution is passed owes the Spitze — not
--   whoever owned it during the accounting year. Claims here hang off the unit
--   and `ownership` resolves by date, so the stored beschlossen_am is enough to
--   determine the debtor at read time.
--
-- Zweitbeschluss:
--   A legally binding statement may still be corrected later by a second
--   resolution. The lifecycle therefore mirrors wirtschaftsplan (0047):
--   entwurf → beschlossen → abgeloest, with a predecessor chain.
--
-- Risk posture:
--   - Additive. No existing table, policy or function changes.
--   - Cost shares are SNAPSHOT at creation. Expenses booked later cannot
--     silently change a statement that was already resolved.
--   - The Spitze itself is derived, not stored: both of its inputs are already
--     immutable (snapshot shares, insert-only Sollstellungen), so a stored copy
--     could only ever drift.
--   - Distribution reuses private._verteilungsschluessel_version_unit_shares
--     (0060) — plan and statement cannot diverge in how they allocate, and
--     typ = 'gemischt' keeps failing closed with 0A000.
--   - Status transitions only through the RPCs, enforced by a lifecycle guard.
--   - Agent writes blocked, audit events on all three tables.

-- ---------------------------------------------------------------------------
-- 1. Kopf
-- ---------------------------------------------------------------------------

create table if not exists public.abrechnung (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null default public.tenant_id()
                            references public.tenant(id) on delete restrict,
  weg_id                    uuid not null,
  jahr                      integer not null check (jahr >= 1900 and jahr <= 2100),
  bezeichnung               text not null check (char_length(trim(bezeichnung)) > 0),
  status                    text not null default 'entwurf'
                            check (status in ('entwurf', 'beschlossen', 'abgeloest')),
  beschlossen_am            date,
  resolution_id             uuid,
  vorgaenger_abrechnung_id  uuid,
  version_nr                integer not null default 1 check (version_nr > 0),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (tenant_id, id),
  constraint abrechnung_weg_fk
    foreign key (tenant_id, weg_id)
    references public.weg(tenant_id, id)
    on delete restrict,
  constraint abrechnung_resolution_fk
    foreign key (tenant_id, resolution_id)
    references public.resolution(tenant_id, id)
    on delete restrict,
  constraint abrechnung_vorgaenger_fk
    foreign key (tenant_id, vorgaenger_abrechnung_id)
    references public.abrechnung(tenant_id, id)
    on delete restrict,
  constraint abrechnung_beschluss_vollstaendig
    check (
      (status = 'entwurf' and beschlossen_am is null)
      or (status <> 'entwurf' and beschlossen_am is not null)
    )
);

comment on table public.abrechnung is
  'Jahresabrechnung per WEG and year (§ 28 Abs. 2 WEG). Cost shares are snapshot at creation; the Abrechnungsspitze is derived from them.';
comment on column public.abrechnung.beschlossen_am is
  'Date of the resolution. Determines the debtor of the Spitze under the Faelligkeitstheorie (BGH V ZR 113/11), resolved through ownership at read time.';

-- Genau eine beschlossene Abrechnung je WEG und Jahr; ein Zweitbeschluss loest
-- die vorige auf 'abgeloest' um, bevor die neue gesetzt wird.
create unique index if not exists abrechnung_eine_beschlossene_idx
  on public.abrechnung (tenant_id, weg_id, jahr)
  where status = 'beschlossen';

create index if not exists abrechnung_weg_idx
  on public.abrechnung (tenant_id, weg_id, jahr desc);

-- ---------------------------------------------------------------------------
-- 2. Gesamtabrechnung: je Kostenart
-- ---------------------------------------------------------------------------

create table if not exists public.abrechnung_kostenposition (
  id                                uuid primary key default gen_random_uuid(),
  tenant_id                         uuid not null default public.tenant_id()
                                    references public.tenant(id) on delete restrict,
  abrechnung_id                     uuid not null,
  kostenart                         text not null check (char_length(trim(kostenart)) > 0),
  betrag_gesamt                     numeric(12, 2) not null check (betrag_gesamt >= 0),
  verteilungsschluessel_version_id  uuid not null,
  created_at                        timestamptz not null default now(),
  updated_at                        timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, abrechnung_id, kostenart, verteilungsschluessel_version_id),
  constraint abrechnung_kostenposition_abrechnung_fk
    foreign key (tenant_id, abrechnung_id)
    references public.abrechnung(tenant_id, id)
    on delete cascade,
  constraint abrechnung_kostenposition_version_fk
    foreign key (tenant_id, verteilungsschluessel_version_id)
    references public.verteilungsschluessel_version(tenant_id, id)
    on delete restrict
);

comment on table public.abrechnung_kostenposition is
  'One line of the Gesamtabrechnung: total spent per cost type, with the allocation key that was used. Two expenses sharing a cost type but not a key stay two lines — the distribution differs, so merging them would hide it.';

create index if not exists abrechnung_kostenposition_abrechnung_idx
  on public.abrechnung_kostenposition (tenant_id, abrechnung_id);

-- ---------------------------------------------------------------------------
-- 3. Einzelabrechnung: Anteil je Einheit an einer Kostenposition
-- ---------------------------------------------------------------------------

create table if not exists public.abrechnung_anteil (
  id                              uuid primary key default gen_random_uuid(),
  tenant_id                       uuid not null default public.tenant_id()
                                  references public.tenant(id) on delete restrict,
  abrechnung_kostenposition_id    uuid not null,
  unit_id                         uuid not null,
  betrag                          numeric(12, 2) not null check (betrag >= 0),
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, abrechnung_kostenposition_id, unit_id),
  constraint abrechnung_anteil_kostenposition_fk
    foreign key (tenant_id, abrechnung_kostenposition_id)
    references public.abrechnung_kostenposition(tenant_id, id)
    on delete cascade,
  constraint abrechnung_anteil_unit_fk
    foreign key (tenant_id, unit_id)
    references public.unit(tenant_id, id)
    on delete restrict
);

comment on table public.abrechnung_anteil is
  'A unit''s share of one cost line. Kept per line rather than only per unit so an owner can retrace the calculation — a total he cannot check is worth little.';

create index if not exists abrechnung_anteil_kostenposition_idx
  on public.abrechnung_anteil (tenant_id, abrechnung_kostenposition_id);
create index if not exists abrechnung_anteil_unit_idx
  on public.abrechnung_anteil (tenant_id, unit_id);

-- ---------------------------------------------------------------------------
-- 4. RLS (Muster aus 0056/0061/0062)
-- ---------------------------------------------------------------------------

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'abrechnung', 'abrechnung_kostenposition', 'abrechnung_anteil'
  ]
  loop
    execute pg_catalog.format(
      'alter table public.%I enable row level security', v_table);
    execute pg_catalog.format(
      'alter table public.%I force row level security', v_table);
    execute pg_catalog.format(
      'revoke all on public.%I from public, anon, authenticated, service_role',
      v_table);
    execute pg_catalog.format(
      'grant select, insert, update, delete on public.%I to authenticated',
      v_table);

    execute pg_catalog.format(
      'create policy %I on public.%I for select to authenticated
         using (tenant_id = (select public.tenant_id()))',
      v_table || '_select_own_tenant', v_table);

    execute pg_catalog.format(
      'create policy %I on public.%I for insert to authenticated
         with check (
           tenant_id = (select public.tenant_id())
           and (
             (select public.has_role(''tenant_admin''))
             or (select public.has_role(''verwalter_mitarbeiter''))
           )
         )',
      v_table || '_insert_own_tenant', v_table);

    execute pg_catalog.format(
      'create policy %I on public.%I for update to authenticated
         using (
           tenant_id = (select public.tenant_id())
           and (
             (select public.has_role(''tenant_admin''))
             or (select public.has_role(''verwalter_mitarbeiter''))
           )
         )
         with check (
           tenant_id = (select public.tenant_id())
           and (
             (select public.has_role(''tenant_admin''))
             or (select public.has_role(''verwalter_mitarbeiter''))
           )
         )',
      v_table || '_update_own_tenant', v_table);

    execute pg_catalog.format(
      'create policy %I on public.%I for delete to authenticated
         using (
           tenant_id = (select public.tenant_id())
           and (
             (select public.has_role(''tenant_admin''))
             or (select public.has_role(''verwalter_mitarbeiter''))
           )
         )',
      v_table || '_delete_own_tenant', v_table);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Agent-Guard und Audit
-- ---------------------------------------------------------------------------

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'abrechnung', 'abrechnung_kostenposition', 'abrechnung_anteil'
  ]
  loop
    execute pg_catalog.format(
      'drop trigger if exists %I on public.%I',
      v_table || '_block_agent_writes', v_table);
    execute pg_catalog.format(
      'create trigger %I before insert or update or delete on public.%I
         for each row execute function public.tg_finance_allocation_block_agent_writes()',
      v_table || '_block_agent_writes', v_table);

    execute pg_catalog.format(
      'drop trigger if exists %I on public.%I',
      v_table || '_audit_emit', v_table);
    execute pg_catalog.format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function audit_writer.tg_emit_audit_event()',
      v_table || '_audit_emit', v_table);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Lebenszyklus-Guard: Status nur ueber die RPCs
-- ---------------------------------------------------------------------------

create or replace function public.tg_abrechnung_lifecycle_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_manager text;
begin
  -- `is distinct from` statt `<>`: die Einstellung ist im Normalfall gar nicht
  -- gesetzt, `v_manager` also NULL — und `NULL <> '1'` ergibt NULL, nicht TRUE.
  -- Mit `<>` wuerde der Guard deshalb nie greifen.
  v_manager := nullif(pg_catalog.current_setting('app.abrechnung_lifecycle_manager', true), '');

  if tg_op = 'INSERT' then
    if new.status is null then
      new.status := 'entwurf';
    end if;

    if new.status <> 'entwurf' and v_manager is distinct from '1' then
      raise exception 'Eine Abrechnung muss als Entwurf angelegt werden.'
        using errcode = '23514';
    end if;

    return new;
  end if;

  if (
    old.status is distinct from new.status
    or old.beschlossen_am is distinct from new.beschlossen_am
    or old.version_nr is distinct from new.version_nr
  ) and v_manager is distinct from '1' then
    raise exception 'Statuswechsel einer Abrechnung laufen über beschliesse_abrechnung().'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.tg_abrechnung_lifecycle_guard()
  from public, anon, authenticated, service_role;

drop trigger if exists abrechnung_lifecycle_guard on public.abrechnung;
create trigger abrechnung_lifecycle_guard
  before insert or update on public.abrechnung
  for each row execute function public.tg_abrechnung_lifecycle_guard();

-- ---------------------------------------------------------------------------
-- 7. Positionen sind nur im Entwurf aenderbar
-- ---------------------------------------------------------------------------

create or replace function public.tg_abrechnung_kind_draft_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_abrechnung_id uuid;
  v_tenant_id uuid;
  v_status text;
begin
  if tg_table_name = 'abrechnung_kostenposition' then
    v_abrechnung_id := case when tg_op = 'DELETE' then old.abrechnung_id else new.abrechnung_id end;
    v_tenant_id := case when tg_op = 'DELETE' then old.tenant_id else new.tenant_id end;
  else
    select k.abrechnung_id, k.tenant_id
      into v_abrechnung_id, v_tenant_id
      from public.abrechnung_kostenposition k
     where k.tenant_id = case when tg_op = 'DELETE' then old.tenant_id else new.tenant_id end
       and k.id = case when tg_op = 'DELETE' then old.abrechnung_kostenposition_id
                       else new.abrechnung_kostenposition_id end;
  end if;

  select a.status
    into v_status
    from public.abrechnung a
   where a.tenant_id = v_tenant_id
     and a.id = v_abrechnung_id;

  if v_status is distinct from 'entwurf' then
    raise exception 'Eine beschlossene Abrechnung kann nicht mehr geändert werden. Für Korrekturen einen Zweitbeschluss anlegen.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.tg_abrechnung_kind_draft_only()
  from public, anon, authenticated, service_role;

drop trigger if exists abrechnung_kostenposition_draft_only on public.abrechnung_kostenposition;
create trigger abrechnung_kostenposition_draft_only
  before insert or update or delete on public.abrechnung_kostenposition
  for each row execute function public.tg_abrechnung_kind_draft_only();

drop trigger if exists abrechnung_anteil_draft_only on public.abrechnung_anteil;
create trigger abrechnung_anteil_draft_only
  before insert or update or delete on public.abrechnung_anteil
  for each row execute function public.tg_abrechnung_kind_draft_only();

-- ---------------------------------------------------------------------------
-- 8. Gleiche WEG fuer Schluessel und Einheit
-- ---------------------------------------------------------------------------

create or replace function public.tg_abrechnung_kostenposition_validate_weg()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_abrechnung_weg_id uuid;
  v_key_weg_id uuid;
begin
  select a.weg_id
    into v_abrechnung_weg_id
    from public.abrechnung a
   where a.tenant_id = new.tenant_id
     and a.id = new.abrechnung_id;

  select k.weg_id
    into v_key_weg_id
    from public.verteilungsschluessel_version kv
    join public.verteilungsschluessel k
      on k.tenant_id = kv.tenant_id
     and k.id = kv.verteilungsschluessel_id
   where kv.tenant_id = new.tenant_id
     and kv.id = new.verteilungsschluessel_version_id;

  if v_key_weg_id is distinct from v_abrechnung_weg_id then
    raise exception 'Der Verteilungsschlüssel gehört zu einer anderen WEG.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.tg_abrechnung_kostenposition_validate_weg()
  from public, anon, authenticated, service_role;

drop trigger if exists abrechnung_kostenposition_validate_weg on public.abrechnung_kostenposition;
create trigger abrechnung_kostenposition_validate_weg
  before insert or update on public.abrechnung_kostenposition
  for each row execute function public.tg_abrechnung_kostenposition_validate_weg();

-- ---------------------------------------------------------------------------
-- 9. Abrechnung erstellen (Snapshot)
-- ---------------------------------------------------------------------------

create or replace function public.erstelle_abrechnung(
  p_weg_id uuid,
  p_jahr integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_tenant_id uuid;
  v_weg_exists boolean;
  v_abrechnung_id uuid;
  v_reference_date date;
  v_position record;
  v_kostenposition_id uuid;
begin
  if coalesce(pg_catalog.current_setting('app.actor_type', true), 'user') = 'agent' then
    raise exception 'Agents cannot create Jahresabrechnungen.'
      using errcode = '42501';
  end if;

  v_request_tenant_id := public.tenant_id();
  if v_request_tenant_id is null then
    raise exception 'WEG not found or access denied.'
      using errcode = '42501';
  end if;

  select true
    into v_weg_exists
    from public.weg w
   where w.tenant_id = v_request_tenant_id
     and w.id = p_weg_id;

  if not found then
    raise exception 'WEG not found or access denied.'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_request_tenant_id::text || ':' || p_weg_id::text || ':' || p_jahr::text,
      63
    )
  );

  if exists (
    select 1
      from public.abrechnung a
     where a.tenant_id = v_request_tenant_id
       and a.weg_id = p_weg_id
       and a.jahr = p_jahr
       and a.status = 'entwurf'
  ) then
    raise exception 'Für dieses Jahr existiert bereits ein Abrechnungsentwurf.'
      using errcode = '23505';
  end if;

  -- Stichtag wie in 0060: die Abrechnung betrifft das Kalenderjahr.
  v_reference_date := pg_catalog.make_date(p_jahr, 1, 1);

  insert into public.abrechnung (tenant_id, weg_id, jahr, bezeichnung)
  values (
    v_request_tenant_id,
    p_weg_id,
    p_jahr,
    'Jahresabrechnung ' || p_jahr::text
  )
  returning id into v_abrechnung_id;

  -- Je Kostenart UND Schluessel eine Position: zwei Ausgaben derselben
  -- Kostenart mit verschiedenen Schluesseln verteilen sich verschieden.
  for v_position in
    select
      a.kostenart,
      a.verteilungsschluessel_version_id,
      sum(a.betrag)::numeric(12, 2) as betrag_gesamt
    from public.ausgabe a
   where a.tenant_id = v_request_tenant_id
     and a.weg_id = p_weg_id
     and pg_catalog.date_part('year', a.wert_datum)::int = p_jahr
   group by a.kostenart, a.verteilungsschluessel_version_id
   order by a.kostenart
  loop
    insert into public.abrechnung_kostenposition (
      tenant_id, abrechnung_id, kostenart, betrag_gesamt,
      verteilungsschluessel_version_id
    )
    values (
      v_request_tenant_id,
      v_abrechnung_id,
      v_position.kostenart,
      v_position.betrag_gesamt,
      v_position.verteilungsschluessel_version_id
    )
    returning id into v_kostenposition_id;

    -- Dieselbe Funktion, die auch die Sollstellungen verteilt (0060). Plan und
    -- Abrechnung koennen dadurch nicht auseinanderlaufen; typ = 'gemischt'
    -- scheitert hier genauso fail-closed mit 0A000.
    insert into public.abrechnung_anteil (
      tenant_id, abrechnung_kostenposition_id, unit_id, betrag
    )
    select
      v_request_tenant_id,
      v_kostenposition_id,
      shares.unit_id,
      pg_catalog.round(v_position.betrag_gesamt * shares.anteil, 2)::numeric(12, 2)
    from private._verteilungsschluessel_version_unit_shares(
      v_request_tenant_id,
      v_position.verteilungsschluessel_version_id,
      p_weg_id,
      v_reference_date
    ) as shares;
  end loop;

  return v_abrechnung_id;
end;
$$;

revoke all on function public.erstelle_abrechnung(uuid, integer)
  from public, anon, service_role;
grant execute on function public.erstelle_abrechnung(uuid, integer) to authenticated;

comment on function public.erstelle_abrechnung(uuid, integer) is
  'Snapshots the year''s expenses into a draft Jahresabrechnung, distributing each cost line through the same allocation helper the Sollstellung generator uses.';

-- ---------------------------------------------------------------------------
-- 10. Abrechnung beschliessen (inkl. Zweitbeschluss)
-- ---------------------------------------------------------------------------

create or replace function public.beschliesse_abrechnung(
  p_abrechnung_id uuid,
  p_beschlossen_am date,
  p_resolution_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_tenant_id uuid;
  v_abrechnung record;
  v_vorgaenger record;
begin
  if coalesce(pg_catalog.current_setting('app.actor_type', true), 'user') = 'agent' then
    raise exception 'Agents cannot resolve Jahresabrechnungen.'
      using errcode = '42501';
  end if;

  if p_beschlossen_am is null then
    raise exception 'Ein Beschlussdatum ist erforderlich.'
      using errcode = '23514';
  end if;

  v_request_tenant_id := public.tenant_id();
  if v_request_tenant_id is null then
    raise exception 'Abrechnung not found or access denied.'
      using errcode = '42501';
  end if;

  select a.*
    into v_abrechnung
    from public.abrechnung a
   where a.id = p_abrechnung_id
   for update;

  if not found or v_abrechnung.tenant_id is distinct from v_request_tenant_id then
    raise exception 'Abrechnung not found or access denied.'
      using errcode = '42501';
  end if;

  if v_abrechnung.status <> 'entwurf' then
    raise exception 'Nur ein Abrechnungsentwurf kann beschlossen werden.'
      using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_abrechnung.tenant_id::text || ':' || v_abrechnung.weg_id::text
        || ':' || v_abrechnung.jahr::text,
      63
    )
  );

  perform pg_catalog.set_config('app.abrechnung_lifecycle_manager', '1', true);

  -- Zweitbeschluss: die bisher beschlossene Abrechnung desselben Jahres wird
  -- abgeloest, BEVOR die neue gesetzt wird — sonst greift der Unique-Index.
  select a.*
    into v_vorgaenger
    from public.abrechnung a
   where a.tenant_id = v_abrechnung.tenant_id
     and a.weg_id = v_abrechnung.weg_id
     and a.jahr = v_abrechnung.jahr
     and a.status = 'beschlossen'
   for update;

  if found then
    update public.abrechnung
       set status = 'abgeloest',
           updated_at = now()
     where tenant_id = v_vorgaenger.tenant_id
       and id = v_vorgaenger.id;
  end if;

  update public.abrechnung
     set status = 'beschlossen',
         beschlossen_am = p_beschlossen_am,
         resolution_id = p_resolution_id,
         vorgaenger_abrechnung_id = case when v_vorgaenger.id is not null
                                         then v_vorgaenger.id else null end,
         version_nr = coalesce(v_vorgaenger.version_nr, 0) + 1,
         updated_at = now()
   where tenant_id = v_abrechnung.tenant_id
     and id = v_abrechnung.id;

  perform pg_catalog.set_config('app.abrechnung_lifecycle_manager', '', true);
end;
$$;

revoke all on function public.beschliesse_abrechnung(uuid, date, uuid)
  from public, anon, service_role;
grant execute on function public.beschliesse_abrechnung(uuid, date, uuid) to authenticated;

comment on function public.beschliesse_abrechnung(uuid, date, uuid) is
  'Resolves a draft statement. A previously resolved statement for the same year becomes abgeloest first — a Zweitbeschluss is expressly permitted and must not be blocked.';

-- ---------------------------------------------------------------------------
-- 11. Abrechnungsspitze je Einheit
-- ---------------------------------------------------------------------------

create or replace view public.abrechnung_spitze
with (security_invoker = on) as
select
  a.id                                        as abrechnung_id,
  a.tenant_id,
  a.weg_id,
  a.jahr,
  u.id                                        as unit_id,
  u.bezeichnung                               as unit_bezeichnung,
  coalesce(anteile.summe, 0)::numeric(12, 2)  as kostenanteil,
  coalesce(soll.summe, 0)::numeric(12, 2)     as soll_vorschuesse,
  (coalesce(anteile.summe, 0) - coalesce(soll.summe, 0))::numeric(12, 2) as spitze
from public.abrechnung a
join public.unit u
  on u.tenant_id = a.tenant_id
 and u.weg_id = a.weg_id
left join lateral (
  select sum(an.betrag) as summe
    from public.abrechnung_anteil an
    join public.abrechnung_kostenposition k
      on k.tenant_id = an.tenant_id
     and k.id = an.abrechnung_kostenposition_id
   where an.tenant_id = a.tenant_id
     and k.abrechnung_id = a.id
     and an.unit_id = u.id
) as anteile on true
left join lateral (
  -- Beschlossene Vorschuesse: Sollstellungen des Jahres aus Plaenen, die den
  -- Entwurfsstatus verlassen haben. Entwuerfe sind nicht beschlossen und
  -- zaehlen deshalb nicht.
  select sum(s.betrag) as summe
    from public.sollstellung s
    join public.wirtschaftsplan wp
      on wp.tenant_id = s.tenant_id
     and wp.id = s.wirtschaftsplan_id
   where s.tenant_id = a.tenant_id
     and s.unit_id = u.id
     and wp.weg_id = a.weg_id
     and wp.jahr = a.jahr
     and wp.status <> 'entwurf'
) as soll on true;

comment on view public.abrechnung_spitze is
  'Abrechnungsspitze per unit: snapshot cost share minus the RESOLVED advances (Soll), never minus payments received — arrears stay owed from the Wirtschaftsplan in their own right. Positive = Nachschuss, negative = Guthaben.';

grant select on public.abrechnung_spitze to authenticated;

notify pgrst, 'reload schema';
