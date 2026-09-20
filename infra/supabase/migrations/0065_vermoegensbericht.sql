-- WEG-Verwaltung migration 0065: Vermoegensbericht (§ 28 Abs. 4 WEG).
--
-- Purpose:
--   The third and last obligation from § 28 WEG. With Wirtschaftsplan and
--   Jahresabrechnung already in place, this completes the statutory set.
--
-- How it differs from the other two, and why the schema looks different:
--
--   NOT RESOLVED. § 28 Abs. 4 says the report is "zu erstellen" and "jedem
--   Wohnungseigentuemer zur Verfuegung zu stellen" — it is not a
--   Beschlussgegenstand. A faulty report is therefore not voidable; it gives
--   every owner a claim to a corrected one (LG Dortmund 2022, LG Frankfurt
--   a. M. 2023). The lifecycle is entwurf → erstellt → abgeloest, never
--   'beschlossen', and the predecessor chain models a correction, not a
--   Zweitbeschluss.
--
--   NOT A BALANCE SHEET. "Die Bestandteile des Vermoegens beduerfen keiner
--   Bewertung" — a lawn tractor is named, not valued, and nothing is
--   depreciated. Hence vermoegensbericht_position.betrag is NULLABLE, and a
--   check constraint allows exactly one section (sachwert) to carry no figure.
--
--   AS OF 31 DECEMBER, not as of today. public.offener_posten (0061) sums every
--   allocation regardless of when the money arrived, which is right for the
--   day-to-day view and wrong for a report dated 31.12. that is written in
--   March. This migration adds private._offene_posten_zum_stichtag instead of
--   touching that view.
--
-- Risk posture:
--   - Additive. No existing table, policy, view or function changes.
--   - Derived figures are SNAPSHOT when the report is created, so a payment
--     booked later cannot silently rewrite a report already handed to owners.
--   - Account balances, third-party debts and movable assets are entered by
--     hand: the database has no account entity, and Zahlung minus Ausgabe is
--     not a bank balance (no opening balance exists anywhere).
--   - Lifecycle guard uses `is distinct from`, never `<>` — that comparison
--     silently disabled two guards until 0064.
--   - Agent writes blocked, audit events on both tables, RLS as in 0063.

-- ---------------------------------------------------------------------------
-- 1. Kopf
-- ---------------------------------------------------------------------------

create table if not exists public.vermoegensbericht (
  id                               uuid primary key default gen_random_uuid(),
  tenant_id                        uuid not null default public.tenant_id()
                                   references public.tenant(id) on delete restrict,
  weg_id                           uuid not null,
  jahr                             integer not null check (jahr >= 1900 and jahr <= 2100),
  stichtag                         date not null,
  bezeichnung                      text not null check (char_length(trim(bezeichnung)) > 0),
  status                           text not null default 'entwurf'
                                   check (status in ('entwurf', 'erstellt', 'abgeloest')),
  erstellt_am                      date,
  vorgaenger_vermoegensbericht_id  uuid,
  version_nr                       integer not null default 1 check (version_nr > 0),
  created_at                       timestamptz not null default now(),
  updated_at                       timestamptz not null default now(),
  unique (tenant_id, id),
  constraint vermoegensbericht_weg_fk
    foreign key (tenant_id, weg_id)
    references public.weg(tenant_id, id)
    on delete restrict,
  constraint vermoegensbericht_vorgaenger_fk
    foreign key (tenant_id, vorgaenger_vermoegensbericht_id)
    references public.vermoegensbericht(tenant_id, id)
    on delete restrict,
  -- Der Bericht steht immer auf dem Jahresende. Ein abweichender Stichtag waere
  -- kein Vermoegensbericht im Sinne des § 28 Abs. 4.
  constraint vermoegensbericht_stichtag_jahresende
    check (stichtag = pg_catalog.make_date(jahr, 12, 31)),
  constraint vermoegensbericht_erstellung_vollstaendig
    check (
      (status = 'entwurf' and erstellt_am is null)
      or (status <> 'entwurf' and erstellt_am is not null)
    )
);

comment on table public.vermoegensbericht is
  'Vermoegensbericht per WEG and year (§ 28 Abs. 4 WEG). Derived figures are snapshot into vermoegensbericht_position at creation. Not a Beschlussgegenstand: a faulty report is corrected by a new version, not contested.';
comment on column public.vermoegensbericht.erstellt_am is
  'Date the report was finalised and made available to the owners. Set only when the report leaves entwurf.';
comment on column public.vermoegensbericht.vorgaenger_vermoegensbericht_id is
  'The report this one corrects (§ 28 Abs. 4 gives every owner a Berichtigungsanspruch).';

-- Genau ein fertiggestellter Bericht je WEG und Jahr; eine Berichtigung loest
-- den vorigen auf 'abgeloest' um, bevor der neue gesetzt wird.
create unique index if not exists vermoegensbericht_einer_erstellt_idx
  on public.vermoegensbericht (tenant_id, weg_id, jahr)
  where status = 'erstellt';

create index if not exists vermoegensbericht_weg_idx
  on public.vermoegensbericht (tenant_id, weg_id, jahr desc);

-- ---------------------------------------------------------------------------
-- 2. Positionen: die fuenf Abschnitte des Berichts
-- ---------------------------------------------------------------------------

create table if not exists public.vermoegensbericht_position (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null default public.tenant_id()
                         references public.tenant(id) on delete restrict,
  vermoegensbericht_id   uuid not null,
  abschnitt              text not null
                         check (abschnitt in ('konto', 'ruecklage', 'forderung',
                                              'verbindlichkeit', 'sachwert')),
  bezeichnung            text not null check (char_length(trim(bezeichnung)) > 0),
  betrag_anfang          numeric(12, 2),
  betrag                 numeric(12, 2),
  quelle                 text not null default 'manuell'
                         check (quelle in ('abgeleitet', 'manuell')),
  unit_id                uuid,
  sortierung             integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (tenant_id, id),
  constraint vermoegensbericht_position_bericht_fk
    foreign key (tenant_id, vermoegensbericht_id)
    references public.vermoegensbericht(tenant_id, id)
    on delete cascade,
  constraint vermoegensbericht_position_unit_fk
    foreign key (tenant_id, unit_id)
    references public.unit(tenant_id, id)
    on delete restrict,
  -- Ein Anfangsbestand ergibt nur fuer Bestandsgroessen einen Sinn. Eine
  -- Forderung hat keinen Anfangsbestand, sie besteht oder sie besteht nicht.
  constraint vermoegensbericht_position_anfang_nur_bestand
    check (betrag_anfang is null or abschnitt in ('konto', 'ruecklage')),
  -- "Die Bestandteile des Vermoegens beduerfen keiner Bewertung": genau ein
  -- Abschnitt darf ohne Zahl auskommen. Ein Rasentraktor wird genannt, eine
  -- Forderung ohne Betrag waere dagegen wertlos.
  constraint vermoegensbericht_position_betrag_nur_sachwert_optional
    check (betrag is not null or abschnitt = 'sachwert')
);

comment on table public.vermoegensbericht_position is
  'One line of a Vermoegensbericht. Five sections after the layout established in practice: Konten, Ruecklagen, Forderungen, Verbindlichkeiten, sonstige Vermoegensgegenstaende.';
comment on column public.vermoegensbericht_position.betrag is
  'Amount at the Stichtag. NULL only for sachwert — the law requires naming, not valuation.';
comment on column public.vermoegensbericht_position.quelle is
  'abgeleitet = snapshot from the ledgers at creation; manuell = entered by the Verwalter (account balances, third-party debts, movable assets).';

create index if not exists vermoegensbericht_position_bericht_idx
  on public.vermoegensbericht_position (tenant_id, vermoegensbericht_id, abschnitt, sortierung);
create index if not exists vermoegensbericht_position_unit_idx
  on public.vermoegensbericht_position (tenant_id, unit_id);

-- ---------------------------------------------------------------------------
-- 3. RLS (Muster aus 0056/0061/0062/0063)
-- ---------------------------------------------------------------------------

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'vermoegensbericht', 'vermoegensbericht_position'
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
-- 4. Agent-Guard und Audit
-- ---------------------------------------------------------------------------

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'vermoegensbericht', 'vermoegensbericht_position'
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
-- 5. Lebenszyklus-Guard: Status nur ueber die RPCs
-- ---------------------------------------------------------------------------

create or replace function public.tg_vermoegensbericht_lifecycle_guard()
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
  -- Mit `<>` wuerde der Guard deshalb nie greifen (siehe 0064).
  v_manager := nullif(pg_catalog.current_setting('app.vermoegensbericht_lifecycle_manager', true), '');

  if tg_op = 'INSERT' then
    if new.status is null then
      new.status := 'entwurf';
    end if;

    if new.status <> 'entwurf' and v_manager is distinct from '1' then
      raise exception 'Ein Vermögensbericht muss als Entwurf angelegt werden.'
        using errcode = '23514';
    end if;

    return new;
  end if;

  if (
    old.status is distinct from new.status
    or old.erstellt_am is distinct from new.erstellt_am
    or old.version_nr is distinct from new.version_nr
  ) and v_manager is distinct from '1' then
    raise exception 'Statuswechsel eines Vermögensberichts laufen über stelle_vermoegensbericht_fertig().'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.tg_vermoegensbericht_lifecycle_guard()
  from public, anon, authenticated, service_role;

drop trigger if exists vermoegensbericht_lifecycle_guard on public.vermoegensbericht;
create trigger vermoegensbericht_lifecycle_guard
  before insert or update on public.vermoegensbericht
  for each row execute function public.tg_vermoegensbericht_lifecycle_guard();

-- ---------------------------------------------------------------------------
-- 6. Positionen sind nur im Entwurf aenderbar
-- ---------------------------------------------------------------------------

create or replace function public.tg_vermoegensbericht_position_draft_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select b.status
    into v_status
    from public.vermoegensbericht b
   where b.tenant_id = case when tg_op = 'DELETE' then old.tenant_id else new.tenant_id end
     and b.id = case when tg_op = 'DELETE' then old.vermoegensbericht_id
                     else new.vermoegensbericht_id end;

  -- Kaskade: beim Loeschen des Berichts ist die Kopfzeile schon weg, wenn der
  -- RI-Trigger die Positionen raeumt. Ohne diese Ausnahme waere v_status NULL
  -- und der Guard wuerde das Loeschen eines Entwurfs verhindern. Sicher ist
  -- das, weil ein fertiggestellter Bericht gar nicht erst geloescht werden darf
  -- (tg_vermoegensbericht_delete_draft_only).
  if v_status is null and tg_op = 'DELETE' then
    return old;
  end if;

  if v_status is distinct from 'entwurf' then
    raise exception 'Ein fertiggestellter Vermögensbericht kann nicht mehr geändert werden. Für Korrekturen einen neuen Bericht anlegen.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.tg_vermoegensbericht_position_draft_only()
  from public, anon, authenticated, service_role;

drop trigger if exists vermoegensbericht_position_draft_only on public.vermoegensbericht_position;
create trigger vermoegensbericht_position_draft_only
  before insert or update or delete on public.vermoegensbericht_position
  for each row execute function public.tg_vermoegensbericht_position_draft_only();

-- ---------------------------------------------------------------------------
-- 6a. Nur ein Entwurf darf geloescht werden
-- ---------------------------------------------------------------------------
--
-- Ein fertiggestellter Bericht wurde den Eigentuemern ausgehaendigt. Er wird
-- durch eine Berichtigung abgeloest, nicht entfernt — sonst waere nicht mehr
-- nachvollziehbar, was wann herausgegeben wurde.

create or replace function public.tg_vermoegensbericht_delete_draft_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from 'entwurf' then
    raise exception 'Ein fertiggestellter Vermögensbericht kann nicht gelöscht werden. Für Korrekturen einen neuen Bericht anlegen.'
      using errcode = '23514';
  end if;

  return old;
end;
$$;

revoke all on function public.tg_vermoegensbericht_delete_draft_only()
  from public, anon, authenticated, service_role;

drop trigger if exists vermoegensbericht_delete_draft_only on public.vermoegensbericht;
create trigger vermoegensbericht_delete_draft_only
  before delete on public.vermoegensbericht
  for each row execute function public.tg_vermoegensbericht_delete_draft_only();

-- ---------------------------------------------------------------------------
-- 7. Eine referenzierte Einheit gehoert zur WEG des Berichts
-- ---------------------------------------------------------------------------

create or replace function public.tg_vermoegensbericht_position_validate_weg()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bericht_weg_id uuid;
  v_unit_weg_id uuid;
begin
  if new.unit_id is null then
    return new;
  end if;

  select b.weg_id
    into v_bericht_weg_id
    from public.vermoegensbericht b
   where b.tenant_id = new.tenant_id
     and b.id = new.vermoegensbericht_id;

  select u.weg_id
    into v_unit_weg_id
    from public.unit u
   where u.tenant_id = new.tenant_id
     and u.id = new.unit_id;

  if v_unit_weg_id is distinct from v_bericht_weg_id then
    raise exception 'Die Einheit gehört zu einer anderen WEG.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.tg_vermoegensbericht_position_validate_weg()
  from public, anon, authenticated, service_role;

drop trigger if exists vermoegensbericht_position_validate_weg on public.vermoegensbericht_position;
create trigger vermoegensbericht_position_validate_weg
  before insert or update on public.vermoegensbericht_position
  for each row execute function public.tg_vermoegensbericht_position_validate_weg();

-- ---------------------------------------------------------------------------
-- 8. Offene Posten ZUM STICHTAG
-- ---------------------------------------------------------------------------
--
-- Warum nicht public.offener_posten: jene View zieht jede zugeordnete Zahlung
-- ab, unabhaengig vom Wertstellungsdatum. Fuer die Tagesansicht ist das
-- richtig. Fuer einen Bericht auf den 31.12., der im Maerz geschrieben wird,
-- waere es falsch — eine Maerzzahlung wuerde den Rueckstand des Vorjahres
-- ruckwirkend senken. Die View bleibt deshalb unangetastet.

create or replace function private._offene_posten_zum_stichtag(
  p_tenant_id uuid,
  p_weg_id uuid,
  p_stichtag date
)
returns table(unit_id uuid, offen numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.unit_id,
    (sum(s.betrag) - coalesce(sum(zug.zugeordnet), 0))::numeric(12, 2) as offen
  from public.sollstellung s
  join public.unit u
    on u.tenant_id = s.tenant_id
   and u.id = s.unit_id
  join public.wirtschaftsplan wp
    on wp.tenant_id = s.tenant_id
   and wp.id = s.wirtschaftsplan_id
  left join lateral (
    -- Nur Zahlungen, die bis zum Stichtag wertgestellt waren.
    select sum(z.betrag) as zugeordnet
      from public.zahlungszuordnung z
      join public.zahlung za
        on za.tenant_id = z.tenant_id
       and za.id = z.zahlung_id
     where z.tenant_id = s.tenant_id
       and z.sollstellung_id = s.id
       and za.wert_datum <= p_stichtag
  ) as zug on true
  where s.tenant_id = p_tenant_id
    and u.weg_id = p_weg_id
    -- Beschlossene Vorschuesse: Entwuerfe schulden noch niemandem etwas.
    and wp.status <> 'entwurf'
    -- Ein Soll fuer Januar des Folgejahres gehoert nicht in diesen Bericht.
    and pg_catalog.make_date(wp.jahr, s.monat, 1) <= p_stichtag
  group by s.unit_id
  having (sum(s.betrag) - coalesce(sum(zug.zugeordnet), 0)) > 0;
$$;

revoke all on function private._offene_posten_zum_stichtag(uuid, uuid, date)
  from public, anon, authenticated, service_role;

comment on function private._offene_posten_zum_stichtag(uuid, uuid, date) is
  'Internal report helper. Per-unit arrears as they stood on a given date: resolved Sollstellungen due up to that date, minus allocations whose payment was value-dated on or before it. Deliberately separate from public.offener_posten, which is an as-of-today view.';

-- ---------------------------------------------------------------------------
-- 9. Ruecklagenbestand ZUM STICHTAG
-- ---------------------------------------------------------------------------
--
-- public.ruecklage_entwicklung liefert Jahreszeilen nur fuer Jahre MIT
-- Bewegungen. Eine WEG, die im Berichtsjahr nichts bewegt hat, haette dort
-- keine Zeile — der Bericht wuerde die Ruecklage dann verschweigen, obwohl sie
-- besteht. Deshalb hier direkt aus dem Journal.

create or replace function private._ruecklage_bestand_zum_stichtag(
  p_tenant_id uuid,
  p_weg_id uuid,
  p_stichtag date
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
    case when b.richtung = 'entnahme' then -b.betrag else b.betrag end
  ), 0)::numeric(12, 2)
  from public.ruecklage_bewegung b
  where b.tenant_id = p_tenant_id
    and b.weg_id = p_weg_id
    and b.datum <= p_stichtag;
$$;

revoke all on function private._ruecklage_bestand_zum_stichtag(uuid, uuid, date)
  from public, anon, authenticated, service_role;

comment on function private._ruecklage_bestand_zum_stichtag(uuid, uuid, date) is
  'Internal report helper. Erhaltungsruecklage balance on a given date. Mirrors bestandZumStichtag in modules/finanzen/ausgabe.ts and the value-date guard in 0062.';

-- ---------------------------------------------------------------------------
-- 10. Bericht erstellen (Snapshot der abgeleiteten Groessen)
-- ---------------------------------------------------------------------------

create or replace function public.erstelle_vermoegensbericht(
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
  v_bericht_id uuid;
  v_stichtag date;
  v_vorjahr_stichtag date;
  v_row record;
  v_sortierung integer;
begin
  if coalesce(pg_catalog.current_setting('app.actor_type', true), 'user') = 'agent' then
    raise exception 'Agents cannot create Vermoegensberichte.'
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
      v_request_tenant_id::text || ':' || p_weg_id::text || ':vb:' || p_jahr::text,
      63
    )
  );

  if exists (
    select 1
      from public.vermoegensbericht b
     where b.tenant_id = v_request_tenant_id
       and b.weg_id = p_weg_id
       and b.jahr = p_jahr
       and b.status = 'entwurf'
  ) then
    raise exception 'Für dieses Jahr existiert bereits ein Berichtsentwurf.'
      using errcode = '23505';
  end if;

  v_stichtag := pg_catalog.make_date(p_jahr, 12, 31);
  v_vorjahr_stichtag := pg_catalog.make_date(p_jahr - 1, 12, 31);

  insert into public.vermoegensbericht (tenant_id, weg_id, jahr, stichtag, bezeichnung)
  values (
    v_request_tenant_id,
    p_weg_id,
    p_jahr,
    v_stichtag,
    'Vermögensbericht ' || p_jahr::text
  )
  returning id into v_bericht_id;

  -- II. Ruecklagenbestand. Immer ausweisen, auch mit 0,00: § 28 Abs. 4 nennt
  -- den Stand der Ruecklagen ausdruecklich, und "keine Zeile" waere keine
  -- Auskunft.
  insert into public.vermoegensbericht_position (
    tenant_id, vermoegensbericht_id, abschnitt, bezeichnung,
    betrag_anfang, betrag, quelle, sortierung
  )
  values (
    v_request_tenant_id,
    v_bericht_id,
    'ruecklage',
    'Erhaltungsrücklage',
    private._ruecklage_bestand_zum_stichtag(v_request_tenant_id, p_weg_id, v_vorjahr_stichtag),
    private._ruecklage_bestand_zum_stichtag(v_request_tenant_id, p_weg_id, v_stichtag),
    'abgeleitet',
    0
  );

  -- III. Forderungen: rueckstaendige Hausgeldvorschuesse je Einheit.
  v_sortierung := 0;
  for v_row in
    select o.unit_id, o.offen, u.bezeichnung
      from private._offene_posten_zum_stichtag(v_request_tenant_id, p_weg_id, v_stichtag) as o
      join public.unit u
        on u.tenant_id = v_request_tenant_id
       and u.id = o.unit_id
     order by u.bezeichnung
  loop
    insert into public.vermoegensbericht_position (
      tenant_id, vermoegensbericht_id, abschnitt, bezeichnung,
      betrag, quelle, unit_id, sortierung
    )
    values (
      v_request_tenant_id,
      v_bericht_id,
      'forderung',
      'Rückständige Hausgeldvorschüsse ' || v_row.bezeichnung,
      v_row.offen,
      'abgeleitet',
      v_row.unit_id,
      v_sortierung
    );
    v_sortierung := v_sortierung + 1;
  end loop;

  -- III./IV. Abrechnungsspitzen aus beschlossenen Jahresabrechnungen bis
  -- einschliesslich des Berichtsjahres. Positive Spitze = Nachschuss, also eine
  -- Forderung; negative = Guthaben, also eine Verbindlichkeit gegenueber dem
  -- Eigentuemer.
  for v_row in
    select sp.unit_id, sp.unit_bezeichnung, sp.spitze, sp.jahr
      from public.abrechnung_spitze sp
      join public.abrechnung a
        on a.tenant_id = sp.tenant_id
       and a.id = sp.abrechnung_id
     where sp.tenant_id = v_request_tenant_id
       and sp.weg_id = p_weg_id
       and a.status = 'beschlossen'
       and a.jahr <= p_jahr
       and sp.spitze <> 0
     order by sp.jahr, sp.unit_bezeichnung
  loop
    insert into public.vermoegensbericht_position (
      tenant_id, vermoegensbericht_id, abschnitt, bezeichnung,
      betrag, quelle, unit_id, sortierung
    )
    values (
      v_request_tenant_id,
      v_bericht_id,
      case when v_row.spitze > 0 then 'forderung' else 'verbindlichkeit' end,
      case when v_row.spitze > 0
           then 'Nachschuss Jahresabrechnung ' || v_row.jahr::text || ' ' || v_row.unit_bezeichnung
           else 'Guthaben Jahresabrechnung ' || v_row.jahr::text || ' ' || v_row.unit_bezeichnung
      end,
      abs(v_row.spitze),
      'abgeleitet',
      v_row.unit_id,
      v_sortierung
    );
    v_sortierung := v_sortierung + 1;
  end loop;

  return v_bericht_id;
end;
$$;

revoke all on function public.erstelle_vermoegensbericht(uuid, integer)
  from public, anon, service_role;
grant execute on function public.erstelle_vermoegensbericht(uuid, integer) to authenticated;

comment on function public.erstelle_vermoegensbericht(uuid, integer) is
  'Creates a draft Vermoegensbericht and snapshots the derivable figures as of 31 December: reserve balance, per-unit arrears, and the Spitzen of resolved statements. Account balances, third-party debts and movable assets are added by hand while the report is a draft.';

-- ---------------------------------------------------------------------------
-- 11. Bericht fertigstellen (und eine Berichtigung abloesen)
-- ---------------------------------------------------------------------------

create or replace function public.stelle_vermoegensbericht_fertig(
  p_vermoegensbericht_id uuid,
  p_erstellt_am date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_tenant_id uuid;
  v_bericht record;
  v_vorgaenger record;
begin
  if coalesce(pg_catalog.current_setting('app.actor_type', true), 'user') = 'agent' then
    raise exception 'Agents cannot finalise Vermoegensberichte.'
      using errcode = '42501';
  end if;

  if p_erstellt_am is null then
    raise exception 'Ein Erstellungsdatum ist erforderlich.'
      using errcode = '23514';
  end if;

  v_request_tenant_id := public.tenant_id();
  if v_request_tenant_id is null then
    raise exception 'Vermoegensbericht not found or access denied.'
      using errcode = '42501';
  end if;

  select b.*
    into v_bericht
    from public.vermoegensbericht b
   where b.id = p_vermoegensbericht_id
   for update;

  if not found or v_bericht.tenant_id is distinct from v_request_tenant_id then
    raise exception 'Vermoegensbericht not found or access denied.'
      using errcode = '42501';
  end if;

  if v_bericht.status <> 'entwurf' then
    raise exception 'Nur ein Berichtsentwurf kann fertiggestellt werden.'
      using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_bericht.tenant_id::text || ':' || v_bericht.weg_id::text
        || ':vb:' || v_bericht.jahr::text,
      63
    )
  );

  perform pg_catalog.set_config('app.vermoegensbericht_lifecycle_manager', '1', true);

  -- Berichtigung: der bisher fertiggestellte Bericht desselben Jahres wird
  -- abgeloest, BEVOR der neue gesetzt wird — sonst greift der Unique-Index.
  select b.*
    into v_vorgaenger
    from public.vermoegensbericht b
   where b.tenant_id = v_bericht.tenant_id
     and b.weg_id = v_bericht.weg_id
     and b.jahr = v_bericht.jahr
     and b.status = 'erstellt'
   for update;

  if found then
    update public.vermoegensbericht
       set status = 'abgeloest',
           updated_at = now()
     where tenant_id = v_vorgaenger.tenant_id
       and id = v_vorgaenger.id;
  end if;

  update public.vermoegensbericht
     set status = 'erstellt',
         erstellt_am = p_erstellt_am,
         vorgaenger_vermoegensbericht_id = case when v_vorgaenger.id is not null
                                                then v_vorgaenger.id else null end,
         version_nr = coalesce(v_vorgaenger.version_nr, 0) + 1,
         updated_at = now()
   where tenant_id = v_bericht.tenant_id
     and id = v_bericht.id;

  perform pg_catalog.set_config('app.vermoegensbericht_lifecycle_manager', '', true);
end;
$$;

revoke all on function public.stelle_vermoegensbericht_fertig(uuid, date)
  from public, anon, service_role;
grant execute on function public.stelle_vermoegensbericht_fertig(uuid, date) to authenticated;

comment on function public.stelle_vermoegensbericht_fertig(uuid, date) is
  'Finalises a draft report. An earlier finalised report for the same year becomes abgeloest first — every owner may demand a corrected report, so this path must never be blocked.';

notify pgrst, 'reload schema';
