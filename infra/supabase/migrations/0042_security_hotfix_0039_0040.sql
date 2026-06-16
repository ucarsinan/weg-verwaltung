-- WEG-Verwaltung migration 0042: security hotfix for 0039/0040 validation blockers.
--
-- Scope:
--   1. Remove the internal Sollstellung generator from the public RPC surface.
--   2. Fix generate_sollstellungen() runtime error caused by schema-qualified COALESCE.
--   3. Restore fail-closed keyed HMAC usage for audit_event rows.

-- ---------------------------------------------------------------------------
-- 1. Internal Sollstellung generator lives outside exposed public schema
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

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
  'Internal insert-only helper for missing Sollstellungen. Not exposed through PostgREST public RPC.';

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

drop function if exists public._generate_sollstellungen_for_plan(uuid);

-- ---------------------------------------------------------------------------
-- 2. Audit HMAC must use the Vault key or fail closed
-- ---------------------------------------------------------------------------

create or replace function audit_writer.hash_audit_row(prev_hash bytea, payload jsonb)
returns bytea
language plpgsql
immutable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_key bytea;
  v_key_hex text;
  v_input bytea;
begin
  begin
    select decrypted_secret
      into v_key_hex
      from vault.decrypted_secrets
     where name = 'audit_hmac_key'
     limit 1;
  exception
    when others then
      raise exception
        'audit_writer.hash_audit_row: audit_hmac_key is not readable from Vault (% - %). DO NOT SHIP TO PROD.',
        sqlstate, sqlerrm
        using errcode = '42501';
  end;

  if v_key_hex is null then
    raise exception
      'audit_writer.hash_audit_row: audit_hmac_key not present in Vault. DO NOT SHIP TO PROD.'
      using errcode = 'P0002';
  end if;

  v_key := decode(v_key_hex, 'hex');
  v_input := prev_hash || convert_to(payload::text, 'UTF8');

  begin
    return extensions.hmac(v_input, v_key, 'sha256');
  exception
    when others then
      raise exception
        'audit_writer.hash_audit_row: extensions.hmac unavailable (% - %). DO NOT SHIP TO PROD.',
        sqlstate, sqlerrm
        using errcode = '42501';
  end;
end;
$$;

alter function audit_writer.hash_audit_row(bytea, jsonb) owner to audit_writer;
revoke all on function audit_writer.hash_audit_row(bytea, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function audit_writer.hash_audit_row(bytea, jsonb) to audit_writer;

notify pgrst, 'reload schema';
