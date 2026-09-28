-- WEG-Verwaltung migration 0073: MEA-Vollstaendigkeit als Vorbedingung der Aktivierung.
--
-- Das Problem, gemessen am 2026-09-28:
-- Eine WEG mit drei Einheiten zu je 250/1000 hat einen Wirtschaftsplan ueber
-- 12.000 EUR aktiviert und dabei Sollstellungen ueber 9.000 EUR erzeugt. Ein
-- Viertel der Kosten wurde niemandem berechnet — ohne Warnung, ohne Fehler.
-- Die Gemeinschaft nimmt dauerhaft weniger ein, als sie ausgibt.
--
-- Warum der Generator NICHT angefasst wird:
-- Der Generator hat zwei Zweige. Der Positions-Zweig (0067:489-507) teilt jeden
-- Anteil durch die MEA-Summe der WEG, seine Anteile summieren also immer auf 1.
-- Der Alt-Zweig ohne Positionen (0060:255-284) verteilt den rohen Bruch, und
-- 0060 erklaert ihn ausdruecklich fuer unangetastet ("The legacy no-positions
-- branch is intentionally NOT changed") — ein bewusstes Versprechen auf
-- byte-identisches Vor-0060-Verhalten.
--
-- Ihn nachtraeglich zu normalisieren waere doppelt falsch: Es braeche dieses
-- Versprechen, und es waere fachlich verkehrt. Fehlt eine Einheit in den Daten,
-- liesse Normalisierung die drei erfassten fuer 100 % zahlen, statt das
-- Datenproblem zu zeigen. Der Anteil des fehlenden vierten Eigentuemers
-- verschwaende dann still auf die Nachbarn.
--
-- Deshalb sitzt die Pruefung an der Aktivierung — dem Moment, in dem aus einem
-- Entwurf Geld wird. Sie wirkt damit auf BEIDE Zweige und faellt aus, bevor
-- irgendetwas geschrieben ist.
--
-- Geprueft wird die Summe der BRUECHE gegen 1, nie der Zaehler gegen 1000. Der
-- Nenner ist gesetzlich nicht festgelegt; 1000/1000 und 10.000/10.000 sind
-- verbreitete Praxis, aber nicht vorgeschrieben. Eine WEG darf 1/2 + 250/1000
-- + 25/100 fuehren.
--
-- Nebenwirkung, beabsichtigt: Eine WEG ganz ohne Einheiten hat die Summe 0 und
-- wird damit ebenfalls abgewiesen. Bisher meldete die Aktivierung dort Erfolg
-- und erzeugte null Sollstellungen.
--
-- Errcode 22023 (invalid_parameter_value) statt 23514: Die Weboberflaeche
-- bildet heute jeden 23514 der Aktivierung auf dieselbe Meldung ab ("Der
-- Statuswechsel ist fachlich nicht erlaubt"). Ein eigener Code macht diese
-- Ursache unterscheidbar, ohne Meldungstexte zu parsen. 0057 nutzt 22023
-- bereits fuer unplausible Eingaben.
--
-- Nicht enthalten: eine rueckwirkende Korrektur bereits aktivierter Plaene.
-- Sollstellungen sind historische Forderungen; sie umzuschreiben waere ein
-- eigener, schwerer Eingriff.

-- ---------------------------------------------------------------------------
-- activate_wirtschaftsplan mit MEA-Vorbedingung
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
  v_mea_sum numeric;
  v_epsilon constant numeric := 0.0001;
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

  -- 0073: Ein Wirtschaftsplan muss 100 % der Gesamtkosten verteilen. Gehen die
  -- Miteigentumsanteile nicht auf das Ganze auf, traegt die Gemeinschaft ihre
  -- Kosten nicht vollstaendig — oder eine Einheit traegt mehr als ihren Teil.
  -- Beides faellt hier aus, bevor eine einzige Sollstellung entsteht.
  select coalesce(
           pg_catalog.sum(u.mea_zaehler::numeric / u.mea_nenner::numeric),
           0
         )
    into v_mea_sum
    from public.unit as u
   where u.tenant_id = v_plan.tenant_id
     and u.weg_id = v_plan.weg_id;

  if v_mea_sum <= 0 then
    raise exception
      'Diese WEG hat keine Einheiten mit Miteigentumsanteilen. Ohne Einheiten entsteht kein Hausgeld.'
      using errcode = '22023';
  end if;

  if v_mea_sum > 1 + v_epsilon then
    raise exception
      'Die Miteigentumsanteile ergeben zusammen % %% des Ganzen. Mehr als ein Ganzes ist nicht möglich — bitte die Anteile der Einheiten prüfen.',
      pg_catalog.round(v_mea_sum * 100, 2)
      using errcode = '22023';
  end if;

  if v_mea_sum < 1 - v_epsilon then
    raise exception
      'Die Miteigentumsanteile ergeben zusammen nur % %% des Ganzen. % %% der Gesamtkosten würden niemandem berechnet — fehlt eine Einheit?',
      pg_catalog.round(v_mea_sum * 100, 2),
      pg_catalog.round((1 - v_mea_sum) * 100, 2)
      using errcode = '22023';
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
  'Tenant-checked lifecycle RPC. Serializes tenant/WEG/year, verifies that the WEG''s Miteigentumsanteile add up to exactly one whole (22023 otherwise), activates one draft, replaces the previous active plan, and posts immutable Sollstellungen.';
