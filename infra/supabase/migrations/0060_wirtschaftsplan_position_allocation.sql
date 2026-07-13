-- WEG-Verwaltung migration 0060: Wirtschaftsplan position allocation.
--
-- Purpose:
--   Let the Sollstellung generator consume wirtschaftsplan_position rows
--   (introduced in 0056) instead of always falling back to gesamtkosten/MEA.
--   0056 shipped the allocation-key schema but explicitly left the generator
--   untouched (see its header comment); this migration is the "Folge-Slice"
--   named in docs/08-finance-domain-model.md's Migrationsstrategie.
--
-- Risk posture:
--   - No change to activate_wirtschaftsplan(), archive_wirtschaftsplan(),
--     create_nachtragsplan(), RLS, or agent guards.
--   - No change to sollstellung's insert-only lock-down (0039/0040) or its
--     conflict target; only the source query inside the existing internal
--     generator changes.
--   - Plans with zero wirtschaftsplan_position rows produce byte-identical
--     output to the pre-0060 generator (see the 0060 pgTAP regression test).
--   - Supported allocation key types: mea, einheit, flaeche, verbrauch,
--     manuell. typ = 'gemischt' fails closed with errcode 0A000
--     (feature_not_supported) instead of guessing: verteilungsschluessel_
--     basiswert rows are scoped to one verteilungsschluessel_version, and a
--     'gemischt' version's parameter jsonb ({"parts":[{"typ":...,
--     "gewicht":...}]}) has no column to say which basis-value rows belong
--     to which part. Resolving that needs a schema/product decision, not a
--     silent assumption in a money-calculation path.
--   - Missing verteilungsschluessel_basiswert coverage for any WEG unit
--     also fails closed (errcode 23514) instead of silently allocating a
--     partial total.
--   - A wirtschaftsplan_position's verteilungsschluessel_version is not
--     required to be date-valid for the plan's Jahr; this migration does
--     not add that check (kept out of scope to avoid touching the existing
--     0056 draft-validation trigger). Tracked as a follow-up.

-- ---------------------------------------------------------------------------
-- 1. Per-unit allocation shares for a single (non-gemischt) key version
-- ---------------------------------------------------------------------------

create or replace function private._verteilungsschluessel_version_unit_shares(
  p_tenant_id uuid,
  p_version_id uuid,
  p_weg_id uuid,
  p_reference_date date
)
returns table(unit_id uuid, anteil numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_typ text;
  v_unit_count integer;
  v_basiswert_sum numeric(18, 6);
  v_missing_units integer;
begin
  select kv.typ
    into v_typ
    from public.verteilungsschluessel_version as kv
   where kv.tenant_id = p_tenant_id
     and kv.id = p_version_id;

  if not found then
    raise exception 'Verteilungsschlüssel-Version nicht gefunden.'
      using errcode = 'P0002';
  end if;

  if v_typ = 'mea' then
    return query
    select u.id, (u.mea_zaehler::numeric / u.mea_nenner::numeric)
      from public.unit as u
     where u.tenant_id = p_tenant_id
       and u.weg_id = p_weg_id;
    return;
  end if;

  if v_typ = 'einheit' then
    select count(*)
      into v_unit_count
      from public.unit as u
     where u.tenant_id = p_tenant_id
       and u.weg_id = p_weg_id;

    if v_unit_count = 0 then
      raise exception 'WEG hat keine Einheiten für die Gleichverteilung.'
        using errcode = '23514';
    end if;

    return query
    select u.id, (1::numeric / v_unit_count)
      from public.unit as u
     where u.tenant_id = p_tenant_id
       and u.weg_id = p_weg_id;
    return;
  end if;

  if v_typ in ('flaeche', 'verbrauch', 'manuell') then
    select count(*)
      into v_missing_units
      from public.unit as u
     where u.tenant_id = p_tenant_id
       and u.weg_id = p_weg_id
       and not exists (
         select 1
           from public.verteilungsschluessel_basiswert as b
          where b.tenant_id = p_tenant_id
            and b.verteilungsschluessel_version_id = p_version_id
            and b.unit_id = u.id
            and b.gueltig_ab <= p_reference_date
            and (b.gueltig_bis is null or b.gueltig_bis >= p_reference_date)
       );

    if v_missing_units > 0 then
      raise exception 'Es fehlen Basiswerte für % Einheit(en) zum Stichtag %.',
        v_missing_units, p_reference_date
        using errcode = '23514';
    end if;

    select sum(b.wert)
      into v_basiswert_sum
      from public.unit as u
      join public.verteilungsschluessel_basiswert as b
        on b.tenant_id = p_tenant_id
       and b.verteilungsschluessel_version_id = p_version_id
       and b.unit_id = u.id
       and b.gueltig_ab <= p_reference_date
       and (b.gueltig_bis is null or b.gueltig_bis >= p_reference_date)
     where u.tenant_id = p_tenant_id
       and u.weg_id = p_weg_id;

    if v_basiswert_sum is null or v_basiswert_sum <= 0 then
      raise exception 'Die Summe der Basiswerte muss größer als 0 sein.'
        using errcode = '23514';
    end if;

    return query
    select u.id, (b.wert / v_basiswert_sum)
      from public.unit as u
      join public.verteilungsschluessel_basiswert as b
        on b.tenant_id = p_tenant_id
       and b.verteilungsschluessel_version_id = p_version_id
       and b.unit_id = u.id
       and b.gueltig_ab <= p_reference_date
       and (b.gueltig_bis is null or b.gueltig_bis >= p_reference_date)
     where u.tenant_id = p_tenant_id
       and u.weg_id = p_weg_id;
    return;
  end if;

  raise exception 'Verteilungsschlüssel-Typ "%" wird vom Sollstellung-Generator noch nicht unterstützt.',
    v_typ
    using errcode = '0A000';
end;
$$;

revoke all on function private._verteilungsschluessel_version_unit_shares(uuid, uuid, uuid, date)
  from public, anon, authenticated, service_role;

comment on function private._verteilungsschluessel_version_unit_shares(uuid, uuid, uuid, date) is
  'Internal generator helper. Returns fractional per-unit shares (summing to 1) for a single allocation key version. Fails closed for typ=gemischt and for missing basis-value coverage instead of silently mis-allocating.';

-- ---------------------------------------------------------------------------
-- 2. Extend the insert-only generator to prefer plan positions
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
  v_jahr integer;
  v_gesamtkosten numeric(12, 2);
  v_start_month integer;
  v_has_positions boolean;
  v_reference_date date;
begin
  v_start_month := coalesce(p_start_month, 1);

  if v_start_month < 1 or v_start_month > 12 then
    raise exception 'wirksam_ab_monat must be between 1 and 12.'
      using errcode = '22023';
  end if;

  select wp.tenant_id, wp.weg_id, wp.jahr, wp.gesamtkosten
    into v_tenant_id, v_weg_id, v_jahr, v_gesamtkosten
    from public.wirtschaftsplan as wp
   where wp.id = p_wirtschaftsplan_id
   for update;

  if not found then
    raise exception 'Wirtschaftsplan not found.'
      using errcode = 'P0002';
  end if;

  perform pg_catalog.set_config('app.sollstellung_writer', 'generator', true);
  perform pg_catalog.set_config('app.sollstellung_tenant_id', v_tenant_id::text, true);

  select exists (
    select 1
      from public.wirtschaftsplan_position as wpp
     where wpp.tenant_id = v_tenant_id
       and wpp.wirtschaftsplan_id = p_wirtschaftsplan_id
  ) into v_has_positions;

  -- No positions: unchanged pre-0060 MEA/gesamtkosten calculation.
  if not v_has_positions then
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

    return;
  end if;

  -- Positions exist: allocate each position's jahresbetrag via its
  -- allocation key, sum per unit across all positions, then split into
  -- equal monthly installments the same way the MEA path always has.
  v_reference_date := pg_catalog.make_date(v_jahr, 1, 1);

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
      totals.unit_id,
      months.monat,
      pg_catalog.round(totals.jahresbetrag_gesamt / 12.0, 2)::numeric(12, 2) as betrag
    from (
      select
        shares.unit_id,
        sum(wpp.jahresbetrag * shares.anteil) as jahresbetrag_gesamt
      from public.wirtschaftsplan_position as wpp
      cross join lateral private._verteilungsschluessel_version_unit_shares(
        v_tenant_id,
        wpp.verteilungsschluessel_version_id,
        v_weg_id,
        v_reference_date
      ) as shares
      where wpp.tenant_id = v_tenant_id
        and wpp.wirtschaftsplan_id = p_wirtschaftsplan_id
      group by shares.unit_id
    ) as totals
    cross join pg_catalog.generate_series(v_start_month, 12) as months(monat)
  ) as generated
  on conflict (tenant_id, wirtschaftsplan_id, unit_id, monat)
    where buchungstyp = 'initial'
  do nothing;
end;
$$;

revoke all on function private._generate_sollstellungen_for_plan(uuid, integer)
  from public, anon, authenticated, service_role;

comment on function private._generate_sollstellungen_for_plan(uuid, integer) is
  'Internal activation helper. Uses wirtschaftsplan_position + verteilungsschluessel_version allocation when the plan has positions, otherwise falls back unchanged to the original MEA/gesamtkosten calculation. Inserts missing initial Sollstellungen from wirksam_ab_monat through December and never rewrites historical rows.';

notify pgrst, 'reload schema';
