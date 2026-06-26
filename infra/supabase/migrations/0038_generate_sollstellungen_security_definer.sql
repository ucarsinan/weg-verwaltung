-- WEG-Verwaltung migration 0038: Update generate_sollstellungen to SECURITY DEFINER
-- This resolves potential RLS context evaluation issues during loop queries on public.unit.

create or replace function public.generate_sollstellungen(p_wirtschaftsplan_id uuid)
returns void
language plpgsql
security definer
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
  -- Fetch the Wirtschaftsplan details.
  select tenant_id, weg_id, gesamtkosten
    into v_tenant_id, v_weg_id, v_gesamtkosten
    from public.wirtschaftsplan
   where id = p_wirtschaftsplan_id;

  -- Enforce tenant isolation check since security definer bypasses RLS for queries.
  if not found or v_tenant_id is null or v_tenant_id <> public.tenant_id() then
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
