-- WEG-Verwaltung migration 0050: Audit Console read API.
--
-- Adds a tenant-scoped, UI-oriented read layer over public.audit_event without
-- mutating historical audit rows. Tenant-side archive execution remains
-- disabled; this migration only supports feed, masked payload reveal tracking,
-- and admin integrity status checks.

begin;

create index if not exists audit_event_tenant_created_seq_desc_idx
  on public.audit_event (tenant_id, created_at desc, seq desc);

create or replace function public.audit_mask_payload(p_payload jsonb)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_key text;
  v_value jsonb;
  v_array jsonb := '[]'::jsonb;
begin
  if p_payload is null then
    return null;
  end if;

  case jsonb_typeof(p_payload)
    when 'object' then
      for v_key, v_value in select key, value from jsonb_each(p_payload)
      loop
        if v_key ~* '(^id$|_id$|^seq$|^created_at$|^updated_at$|^deleted_at$|^status$|^action$|^entity_typ$|^actor_type$|^db_role$|^jahr$|^valid_after_seq$|^valid_after_created_at$|^repaired_at$|^repaired_by_migration$)' then
          v_result := v_result || jsonb_build_object(v_key, v_value);
        else
          v_result := v_result || jsonb_build_object(v_key, '[masked]');
        end if;
      end loop;
      return v_result;
    when 'array' then
      for v_value in select value from jsonb_array_elements(p_payload)
      loop
        v_array := v_array || jsonb_build_array(public.audit_mask_payload(v_value));
      end loop;
      return v_array;
    else
      return '"[masked]"'::jsonb;
  end case;
end;
$$;

comment on function public.audit_mask_payload(jsonb) is
  'Conservatively masks audit payload values before they are sent to the browser; only technical reference fields stay visible.';

create or replace function public.audit_event_summary(
  p_entity_typ text,
  p_action text,
  p_payload jsonb
)
returns text
language sql
stable
set search_path = pg_catalog, public
as $$
  select concat_ws(
    ' ',
    case p_entity_typ
      when 'weg' then 'WEG'
      when 'meeting' then 'Versammlung'
      when 'agenda_item' then 'TOP'
      when 'resolution' then 'Beschluss'
      when 'vote' then 'Stimme'
      when 'beschluss_sammlung_entry' then 'Beschluss-Sammlungseintrag'
      when 'wirtschaftsplan' then 'Wirtschaftsplan'
      when 'sollstellung' then 'Sollstellung'
      when 'audit_payload_reveal' then 'Audit-Payload'
      else p_entity_typ
    end,
    case p_action
      when 'insert' then 'angelegt'
      when 'update' then 'aktualisiert'
      when 'delete' then 'gelöscht'
      else p_action
    end
  );
$$;

create or replace function public.audit_entity_label(
  p_entity_typ text,
  p_payload jsonb,
  p_entity_id uuid
)
returns text
language sql
stable
set search_path = pg_catalog, public
as $$
  with label_parts as (
    select
      case p_entity_typ
        when 'weg' then 'WEG'
        when 'meeting' then 'Versammlung'
        when 'agenda_item' then 'Tagesordnungspunkt'
        when 'resolution' then 'Beschluss'
        when 'vote' then 'Stimme'
        when 'beschluss_sammlung_entry' then 'Beschluss-Sammlung'
        when 'wirtschaftsplan' then 'Wirtschaftsplan'
        when 'sollstellung' then 'Sollstellung'
      when 'audit_payload_reveal' then 'Payload-Reveal'
      else coalesce(p_entity_typ, 'Entität')
      end as entity_name
  )
  select case
    when p_entity_id is not null then lp.entity_name || ' #' || left(p_entity_id::text, 8)
    else lp.entity_name
  end
  from label_parts as lp;
$$;

create or replace function public.audit_actor_label(
  p_actor_type text,
  p_actor_user_id uuid
)
returns text
language sql
stable
set search_path = pg_catalog, public
as $$
  select case p_actor_type
    when 'user' then 'Verwalter'
    when 'agent' then 'KI-Agent'
    when 'system' then 'System'
    else coalesce(p_actor_type, 'Unbekannt')
  end ||
  case
    when p_actor_user_id is null then ''
    else ' #' || left(p_actor_user_id::text, 8)
  end;
$$;

create or replace function public.audit_risk_flags(
  p_actor_type text,
  p_db_role text,
  p_payload jsonb
)
returns text[]
language sql
stable
set search_path = pg_catalog, public
as $$
  select array_remove(array[
    case when p_db_role = 'service_role' then 'service_role' end,
    case when p_actor_type = 'agent' then 'agent' end,
    case when public.audit_mask_payload(p_payload) is distinct from p_payload then 'masked' end,
    case
      when p_payload ? 'first_failure'
        or p_payload ? 'error_message'
        or lower(coalesce(p_payload ->> 'status', '')) in ('warning', 'error')
      then 'integrity_warning'
    end
  ], null);
$$;

create or replace function public.audit_event_feed(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_actor_type text default null,
  p_entity_typ text default null,
  p_action text default null,
  p_query text default null,
  p_flag text default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_seq bigint default null,
  p_limit int default 50
)
returns table (
  id uuid,
  seq bigint,
  created_at timestamptz,
  actor_type text,
  actor_user_id uuid,
  db_role text,
  entity_typ text,
  entity_id uuid,
  action text,
  summary text,
  entity_label text,
  actor_label text,
  risk_flags text[],
  payload_masked jsonb,
  can_reveal_payload boolean
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with source as (
    select
      ae.id,
      ae.seq,
      ae.created_at,
      ae.actor_type,
      ae.actor_user_id,
      ae.db_role,
      ae.entity_typ,
      ae.entity_id,
      ae.action,
      ae.payload,
      public.audit_event_summary(ae.entity_typ, ae.action, ae.payload) as summary,
      public.audit_entity_label(ae.entity_typ, ae.payload, ae.entity_id) as entity_label,
      public.audit_actor_label(ae.actor_type, ae.actor_user_id) as actor_label,
      public.audit_risk_flags(ae.actor_type, ae.db_role, ae.payload) as risk_flags
    from public.audit_event as ae
    where (p_from is null or ae.created_at >= p_from)
      and (p_to is null or ae.created_at <= p_to)
      and (p_actor_type is null or ae.actor_type = p_actor_type)
      and (p_entity_typ is null or ae.entity_typ = p_entity_typ)
      and (p_action is null or ae.action = p_action)
      and (
        p_cursor_created_at is null
        or ae.created_at < p_cursor_created_at
        or (ae.created_at = p_cursor_created_at and ae.seq < coalesce(p_cursor_seq, ae.seq))
      )
  )
  select
    s.id,
    s.seq,
    s.created_at,
    s.actor_type,
    s.actor_user_id,
    s.db_role,
    s.entity_typ,
    s.entity_id,
    s.action,
    s.summary,
    s.entity_label,
    s.actor_label,
    s.risk_flags,
    public.audit_mask_payload(s.payload) as payload_masked,
    public.has_role('tenant_admin') as can_reveal_payload
  from source as s
  where (
      nullif(trim(p_query), '') is null
      or s.summary ilike '%' || trim(p_query) || '%'
      or s.entity_label ilike '%' || trim(p_query) || '%'
      or s.entity_typ ilike '%' || trim(p_query) || '%'
      or s.action ilike '%' || trim(p_query) || '%'
    )
    and (
      nullif(trim(p_flag), '') is null
      or p_flag = any(s.risk_flags)
    )
  order by s.created_at desc, s.seq desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

revoke all on function public.audit_event_feed(
  timestamptz, timestamptz, text, text, text, text, text, timestamptz, bigint, int
) from public;
grant execute on function public.audit_event_feed(
  timestamptz, timestamptz, text, text, text, text, text, timestamptz, bigint, int
) to authenticated;

create table if not exists public.audit_payload_reveal (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  audit_event_created_at timestamptz not null,
  audit_event_id uuid not null,
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  constraint audit_payload_reveal_event_fk
    foreign key (tenant_id, audit_event_created_at, audit_event_id)
    references public.audit_event(tenant_id, created_at, id)
    on delete restrict
);

alter table public.audit_payload_reveal enable row level security;
alter table public.audit_payload_reveal force row level security;
revoke all on public.audit_payload_reveal from public;
grant select, insert on public.audit_payload_reveal to authenticated;

drop policy if exists audit_payload_reveal_select_admin on public.audit_payload_reveal;
create policy audit_payload_reveal_select_admin
  on public.audit_payload_reveal for select to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (select public.has_role('tenant_admin'))
  );

drop policy if exists audit_payload_reveal_insert_admin on public.audit_payload_reveal;
create policy audit_payload_reveal_insert_admin
  on public.audit_payload_reveal for insert to authenticated
  with check (
    tenant_id = (select public.tenant_id())
    and (select public.has_role('tenant_admin'))
  );

drop trigger if exists audit_payload_reveal_audit_emit on public.audit_payload_reveal;
create trigger audit_payload_reveal_audit_emit
  after insert on public.audit_payload_reveal
  for each row execute function audit_writer.tg_emit_audit_event();

create index if not exists audit_payload_reveal_tenant_created_idx
  on public.audit_payload_reveal (tenant_id, created_at desc);

create or replace function public.audit_reveal_event_payload(
  p_event_id uuid,
  p_created_at timestamptz
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_tenant_id uuid;
  v_payload jsonb;
begin
  v_tenant_id := public.tenant_id();

  if auth.uid() is null or v_tenant_id is null or not public.has_role('tenant_admin') then
    raise exception 'Nicht autorisiert.'
      using errcode = '42501';
  end if;

  select ae.payload
    into v_payload
    from public.audit_event as ae
   where ae.tenant_id = v_tenant_id
     and ae.created_at = p_created_at
     and ae.id = p_event_id;

  if v_payload is null then
    raise exception 'Audit-Eintrag nicht gefunden.'
      using errcode = 'P0002';
  end if;

  insert into public.audit_payload_reveal (
    tenant_id,
    audit_event_created_at,
    audit_event_id,
    actor_user_id
  ) values (
    v_tenant_id,
    p_created_at,
    p_event_id,
    auth.uid()
  );

  return v_payload;
end;
$$;

revoke all on function public.audit_reveal_event_payload(uuid, timestamptz) from public;
grant execute on function public.audit_reveal_event_payload(uuid, timestamptz) to authenticated;

create table if not exists public.audit_integrity_check (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  checked_at timestamptz not null default now(),
  checked_by uuid,
  status text not null check (status in ('not_checked', 'intact', 'warning', 'error')),
  seq_from bigint,
  seq_to bigint,
  rows_checked int not null default 0,
  checkpoint jsonb not null default '{}'::jsonb,
  first_failure jsonb,
  error_message text
);

create index if not exists audit_integrity_check_tenant_checked_idx
  on public.audit_integrity_check (tenant_id, checked_at desc);

alter table public.audit_integrity_check enable row level security;
alter table public.audit_integrity_check force row level security;
revoke all on public.audit_integrity_check from public;
grant select on public.audit_integrity_check to authenticated;

drop policy if exists audit_integrity_check_select_admin on public.audit_integrity_check;
create policy audit_integrity_check_select_admin
  on public.audit_integrity_check for select to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (select public.has_role('tenant_admin'))
  );

drop policy if exists audit_integrity_check_insert_internal on public.audit_integrity_check;
create policy audit_integrity_check_insert_internal
  on public.audit_integrity_check for insert
  with check (
    nullif(current_setting('app.audit_integrity_writer', true), '') = 'verify_chain'
    and tenant_id::text = nullif(current_setting('app.audit_integrity_tenant_id', true), '')
  );

create or replace function public.audit_integrity_status()
returns table (
  id uuid,
  status text,
  checked_at timestamptz,
  checked_by uuid,
  seq_from bigint,
  seq_to bigint,
  rows_checked int,
  checkpoint jsonb,
  first_failure jsonb,
  error_message text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_tenant_id uuid;
  v_checkpoint jsonb := '{}'::jsonb;
begin
  v_tenant_id := public.tenant_id();

  if v_tenant_id is null or not public.has_role('tenant_admin') then
    raise exception 'Nicht autorisiert.'
      using errcode = '42501';
  end if;

  if to_regclass('audit_writer.audit_chain_repair_checkpoint') is not null then
    select jsonb_build_object(
      'valid_after_seq', c.valid_after_seq,
      'valid_after_created_at', c.valid_after_created_at,
      'valid_after_event_id', c.valid_after_event_id,
      'repaired_at', c.repaired_at,
      'valid_after_row_hash', encode(c.valid_after_row_hash, 'hex'),
      'repaired_by_migration', c.repaired_by_migration,
      'note', c.note
    )
      into v_checkpoint
      from audit_writer.audit_chain_repair_checkpoint as c
     where c.tenant_id = v_tenant_id;
  end if;

  return query
  select
    c.id,
    c.status,
    c.checked_at,
    c.checked_by,
    c.seq_from,
    c.seq_to,
    c.rows_checked,
    case
      when c.checkpoint <> '{}'::jsonb then c.checkpoint
      else coalesce(v_checkpoint, '{}'::jsonb)
    end,
    c.first_failure,
    c.error_message
  from public.audit_integrity_check as c
  where c.tenant_id = v_tenant_id
  order by c.checked_at desc
  limit 1;

  if not found then
    return query
    select
      null::uuid,
      'not_checked'::text,
      null::timestamptz,
      null::uuid,
      null::bigint,
      null::bigint,
      0::int,
      coalesce(v_checkpoint, '{}'::jsonb),
      null::jsonb,
      null::text;
  end if;
end;
$$;

revoke all on function public.audit_integrity_status() from public;
alter function public.audit_integrity_status() owner to postgres;
grant execute on function public.audit_integrity_status() to authenticated;

create or replace function public.audit_verify_chain()
returns table (
  id uuid,
  status text,
  checked_at timestamptz,
  checked_by uuid,
  seq_from bigint,
  seq_to bigint,
  rows_checked int,
  checkpoint jsonb,
  first_failure jsonb,
  error_message text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_tenant_id uuid;
  v_checked_by uuid;
  v_valid_after_seq bigint;
  v_valid_after_created_at timestamptz;
  v_valid_after_event_id uuid;
  v_repaired_at timestamptz;
  v_valid_after_row_hash text;
  v_checkpoint_found boolean := false;
  v_checkpoint_json jsonb := '{}'::jsonb;
  v_seq_to bigint;
  v_rows_checked int;
  v_failure jsonb;
  v_status text;
  v_error text;
  v_inserted_id uuid;
  v_uid_text text;
  v_failure_count int := 0;
begin
  v_tenant_id := public.tenant_id();
  v_uid_text := coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  );

  begin
    v_checked_by := v_uid_text::uuid;
  exception when others then
    v_checked_by := null;
  end;

  if v_tenant_id is null or not public.has_role('tenant_admin') then
    raise exception 'Nicht autorisiert.'
      using errcode = '42501';
  end if;

  begin
    if to_regclass('audit_writer.audit_chain_repair_checkpoint') is not null then
      select
        c.valid_after_seq,
        c.valid_after_created_at,
        c.valid_after_event_id,
        c.repaired_at,
        encode(c.valid_after_row_hash, 'hex') as valid_after_row_hash
        into
          v_valid_after_seq,
          v_valid_after_created_at,
          v_valid_after_event_id,
          v_repaired_at,
          v_valid_after_row_hash
        from audit_writer.audit_chain_repair_checkpoint as c
       where c.tenant_id = v_tenant_id;

      v_checkpoint_found := found;
      if v_checkpoint_found then
        v_checkpoint_json := jsonb_build_object(
          'valid_after_seq', v_valid_after_seq,
          'valid_after_created_at', v_valid_after_created_at,
          'valid_after_event_id', v_valid_after_event_id,
          'repaired_at', v_repaired_at,
          'valid_after_row_hash', v_valid_after_row_hash
        );
      end if;
    end if;

    select min(ae.seq), max(ae.seq), count(*)::int
      into v_valid_after_seq, v_seq_to, v_rows_checked
      from public.audit_event as ae
     where ae.tenant_id = v_tenant_id
       and (
         not v_checkpoint_found
         or ae.seq > v_valid_after_seq
       );

    if to_regprocedure('audit_writer.verify_chain_repaired(uuid)') is not null then
      execute
        'select count(*)::int, (jsonb_agg(to_jsonb(r) order by r.broken_seq) -> 0)
           from audit_writer.verify_chain_repaired($1) as r'
        into v_failure_count, v_failure
        using v_tenant_id;
    elsif to_regprocedure('audit_writer.verify_chain(uuid)') is not null then
      execute
        'select count(*)::int, (jsonb_agg(to_jsonb(r) order by r.broken_seq) -> 0)
           from audit_writer.verify_chain($1) as r'
        into v_failure_count, v_failure
        using v_tenant_id;
    else
      raise exception 'No reachable audit_writer verify_chain function exists.'
        using errcode = '42883';
    end if;

    if v_failure_count > 0 then
      v_status := 'error';
      v_error := 'Audit-Hashkette meldet mindestens eine Bruchstelle.';
    elsif not v_checkpoint_found and coalesce(v_rows_checked, 0) > 0 then
      v_status := 'warning';
      v_error := 'Kein Audit-Checkpoint für diesen Mandanten gefunden.';
    elsif coalesce(v_rows_checked, 0) = 0 then
      v_status := 'warning';
      v_error := 'Keine Audit-Zeilen im verifizierbaren Forward-Fenster gefunden.';
    else
      v_status := 'intact';
      v_error := null;
    end if;
  exception
    when others then
      v_status := 'error';
      v_failure := null;
      v_error := sqlstate || ': ' || sqlerrm;
  end;

  perform set_config('app.audit_integrity_writer', 'verify_chain', true);
  perform set_config('app.audit_integrity_tenant_id', v_tenant_id::text, true);

  insert into public.audit_integrity_check (
    tenant_id,
    checked_by,
    status,
    seq_from,
    seq_to,
    rows_checked,
    checkpoint,
    first_failure,
    error_message
  ) values (
    v_tenant_id,
    v_checked_by,
    v_status,
    v_valid_after_seq,
    v_seq_to,
    coalesce(v_rows_checked, 0),
    v_checkpoint_json,
    v_failure,
    v_error
  )
  returning public.audit_integrity_check.id into v_inserted_id;

  perform set_config('app.audit_integrity_writer', '', true);
  perform set_config('app.audit_integrity_tenant_id', '', true);

  return query
  select
    c.id,
    c.status,
    c.checked_at,
    c.checked_by,
    c.seq_from,
    c.seq_to,
    c.rows_checked,
    c.checkpoint,
    c.first_failure,
    c.error_message
  from public.audit_integrity_check as c
  where c.id = v_inserted_id;
end;
$$;

alter function public.audit_verify_chain() owner to postgres;
revoke all on function public.audit_verify_chain() from public;
grant execute on function public.audit_verify_chain() to authenticated;
grant execute on function public.audit_verify_chain() to service_role;

revoke all on function public.audit_mask_payload(jsonb) from public;
revoke all on function public.audit_event_summary(text, text, jsonb) from public;
revoke all on function public.audit_entity_label(text, jsonb, uuid) from public;
revoke all on function public.audit_actor_label(text, uuid) from public;
revoke all on function public.audit_risk_flags(text, text, jsonb) from public;

grant execute on function public.audit_mask_payload(jsonb) to authenticated, service_role;
grant execute on function public.audit_event_summary(text, text, jsonb) to authenticated, service_role;
grant execute on function public.audit_entity_label(text, jsonb, uuid) to authenticated, service_role;
grant execute on function public.audit_actor_label(text, uuid) to authenticated, service_role;
grant execute on function public.audit_risk_flags(text, text, jsonb) to authenticated, service_role;

comment on function public.audit_mask_payload(jsonb) is
  'Recursively masks likely PII fields in audit payloads before they are sent to the browser.';
comment on function public.audit_event_summary(text, text, jsonb) is
  'Deterministic human-readable summary for Audit Console rows without payload-derived labels.';
comment on function public.audit_entity_label(text, jsonb, uuid) is
  'Conservative entity label derived from entity type and short entity_id reference.';
comment on function public.audit_actor_label(text, uuid) is
  'UI-safe actor label without joining auth.users.';
comment on function public.audit_risk_flags(text, text, jsonb) is
  'Stable Audit Console marker flags derived from actor, db role, and payload shape.';
comment on function public.audit_event_feed(
  timestamptz, timestamptz, text, text, text, text, text, timestamptz, bigint, int
) is
  'Tenant-scoped Audit Console feed with masked payload and cursor pagination.';
comment on table public.audit_payload_reveal is
  'Append-only record of tenant-admin full-payload reveal actions.';
comment on function public.audit_reveal_event_payload(uuid, timestamptz) is
  'Returns full audit payload for tenant_admin and records the reveal action.';
comment on table public.audit_integrity_check is
  'Latest and historical tenant-admin audit-chain verification results.';
comment on function public.audit_integrity_status() is
  'Returns the latest tenant audit-chain verification status visible to tenant_admin.';
comment on function public.audit_verify_chain() is
  'Tenant-admin wrapper that verifies the forward audit chain and records the result.';

notify pgrst, 'reload schema';

commit;
