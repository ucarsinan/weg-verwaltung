-- WEG-Verwaltung migration 0049: Meeting resolution hardening.
--
-- Minimal DB-first slice:
--   - atomic resolution finalization RPC
--   - one Beschluss-Sammlung entry per finalized resolution
--   - vote integrity against meeting WEG + ownership period
--   - BSE consistency for meeting/resolution/WEG references
--   - future lfd_nr allocation scoped per WEG

-- Existing rows are intentionally not rewritten. Dropping the identity keeps
-- historical lfd_nr values intact while allowing a trigger to allocate future
-- values per (tenant_id, weg_id).
alter table public.beschluss_sammlung_entry
  alter column lfd_nr drop identity if exists;

create unique index if not exists bse_resolution_once_idx
  on public.beschluss_sammlung_entry (tenant_id, resolution_id)
  where resolution_id is not null;

create or replace function public.tg_resolution_meeting_agenda_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_agenda_meeting_id uuid;
  v_finalizer text;
begin
  if new.agenda_item_id is not null then
    select ai.meeting_id
      into v_agenda_meeting_id
      from public.agenda_item as ai
     where ai.tenant_id = new.tenant_id
       and ai.id = new.agenda_item_id;

    if not found then
      raise exception 'Resolution references an unknown agenda_item in this tenant.'
        using errcode = '23503';
    end if;

    if v_agenda_meeting_id is distinct from new.meeting_id then
      raise exception 'Resolution agenda_item does not belong to its meeting.'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.festgestellt_am is not null and (
      old.meeting_id is distinct from new.meeting_id
      or old.agenda_item_id is distinct from new.agenda_item_id
      or old.text is distinct from new.text
      or old.mehrheits_typ is distinct from new.mehrheits_typ
      or old.stimmprinzip is distinct from new.stimmprinzip
      or old.festgestellt_am is distinct from new.festgestellt_am
    ) then
      raise exception 'Finalized resolutions cannot be rewritten.'
        using errcode = '42501';
    end if;

    if old.festgestellt_am is null and new.festgestellt_am is not null then
      v_finalizer := nullif(pg_catalog.current_setting('app.resolution_finalizer', true), '');
      if v_finalizer is distinct from '1' then
        raise exception 'Resolution finalization must use public.feststellen_resolution(uuid).'
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.tg_resolution_meeting_agenda_integrity() from public;

drop trigger if exists resolution_meeting_agenda_integrity on public.resolution;
create trigger resolution_meeting_agenda_integrity
  before insert or update on public.resolution
  for each row
  execute function public.tg_resolution_meeting_agenda_integrity();

create or replace function public.tg_bse_assign_scoped_lfd_nr()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_next_lfd_nr bigint;
begin
  if new.tenant_id is null then
    new.tenant_id := public.tenant_id();
  end if;

  if new.weg_id is null then
    raise exception 'beschluss_sammlung_entry.weg_id is required for lfd_nr allocation'
      using errcode = '23502';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.tenant_id::text || ':' || new.weg_id::text, 49)
  );

  select coalesce(max(bse.lfd_nr), 0) + 1
    into v_next_lfd_nr
    from public.beschluss_sammlung_entry as bse
   where bse.tenant_id = new.tenant_id
     and bse.weg_id = new.weg_id;

  new.lfd_nr := v_next_lfd_nr;
  return new;
end;
$$;

revoke all on function public.tg_bse_assign_scoped_lfd_nr() from public;

drop trigger if exists bse_assign_scoped_lfd_nr on public.beschluss_sammlung_entry;
create trigger bse_assign_scoped_lfd_nr
  before insert on public.beschluss_sammlung_entry
  for each row
  execute function public.tg_bse_assign_scoped_lfd_nr();

create or replace function public.tg_vote_meeting_resolution_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_resolution_id uuid;
  v_ownership_id uuid;
  v_vote_id uuid;
  v_resolution record;
  v_ownership record;
  v_stichtag date;
begin
  if tg_op = 'DELETE' then
    v_tenant_id := old.tenant_id;
    v_resolution_id := old.resolution_id;
    v_ownership_id := old.ownership_id;
    v_vote_id := old.id;
  else
    v_tenant_id := new.tenant_id;
    v_resolution_id := new.resolution_id;
    v_ownership_id := new.ownership_id;
    v_vote_id := new.id;
  end if;

  if tg_op = 'UPDATE' and (
    old.tenant_id is distinct from new.tenant_id
    or old.resolution_id is distinct from new.resolution_id
    or old.ownership_id is distinct from new.ownership_id
  ) then
    raise exception 'Vote tenant, resolution, and ownership references cannot be changed.'
      using errcode = '42501';
  end if;

  select
      r.tenant_id,
      r.id,
      r.meeting_id,
      r.agenda_item_id,
      r.festgestellt_am,
      m.weg_id,
      m.status as meeting_status,
      m.termin_von,
      ai.meeting_id as agenda_meeting_id
    into v_resolution
    from public.resolution as r
    join public.meeting as m
      on m.tenant_id = r.tenant_id
     and m.id = r.meeting_id
    left join public.agenda_item as ai
      on ai.tenant_id = r.tenant_id
     and ai.id = r.agenda_item_id
   where r.tenant_id = v_tenant_id
     and r.id = v_resolution_id
   for update of r;

  if not found then
    raise exception 'Vote references an unknown resolution in this tenant.'
      using errcode = '23503';
  end if;

  if v_resolution.agenda_item_id is not null
     and v_resolution.agenda_meeting_id is distinct from v_resolution.meeting_id then
    raise exception 'Resolution agenda_item does not belong to its meeting.'
      using errcode = '23514';
  end if;

  if v_resolution.festgestellt_am is not null then
    raise exception 'Votes cannot be inserted, changed, or deleted after the resolution has been festgestellt.'
      using errcode = '42501';
  end if;

  if v_resolution.meeting_status is distinct from 'laufend' then
    raise exception 'Votes can only be inserted, changed, or deleted while the meeting is laufend.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if v_resolution.termin_von is null then
    raise exception 'Vote validation requires a meeting date.'
      using errcode = '23514';
  end if;

  v_stichtag := v_resolution.termin_von::date;

  select o.tenant_id, o.id, o.weg_id, o.von, o.bis
    into v_ownership
    from public.ownership as o
   where o.tenant_id = v_tenant_id
     and o.id = v_ownership_id;

  if not found then
    raise exception 'Vote references an unknown ownership in this tenant.'
      using errcode = '23503';
  end if;

  if v_ownership.weg_id is distinct from v_resolution.weg_id then
    raise exception 'Vote ownership does not belong to the meeting WEG.'
      using errcode = '23514';
  end if;

  if v_ownership.von > v_stichtag
     or (v_ownership.bis is not null and v_ownership.bis < v_stichtag) then
    raise exception 'Vote ownership is not active at the meeting reference date.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
      from public.vote as existing_vote
     where existing_vote.tenant_id = v_tenant_id
       and existing_vote.resolution_id = v_resolution_id
       and existing_vote.ownership_id = v_ownership_id
       and existing_vote.id is distinct from v_vote_id
  ) then
    raise exception 'Ownership has already voted on this resolution.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

revoke all on function public.tg_vote_meeting_resolution_integrity() from public;

drop trigger if exists vote_meeting_resolution_integrity on public.vote;
create trigger vote_meeting_resolution_integrity
  before insert or update or delete on public.vote
  for each row
  execute function public.tg_vote_meeting_resolution_integrity();

create or replace function public.tg_bse_meeting_resolution_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_meeting record;
  v_resolution record;
  v_finalizer text;
begin
  if new.meeting_id is not null then
    select m.tenant_id, m.id, m.weg_id
      into v_meeting
      from public.meeting as m
     where m.tenant_id = new.tenant_id
       and m.id = new.meeting_id;

    if not found then
      raise exception 'Beschluss-Sammlung entry references an unknown meeting in this tenant.'
        using errcode = '23503';
    end if;

    if v_meeting.weg_id is distinct from new.weg_id then
      raise exception 'Beschluss-Sammlung entry WEG does not match meeting WEG.'
        using errcode = '23514';
    end if;
  end if;

  if new.resolution_id is not null then
    v_finalizer := nullif(pg_catalog.current_setting('app.resolution_finalizer', true), '');
    if v_finalizer is distinct from '1' then
      raise exception 'Beschluss-Sammlung entries for resolutions must be created by public.feststellen_resolution(uuid).'
        using errcode = '42501';
    end if;

    if new.meeting_id is null then
      raise exception 'Beschluss-Sammlung entries for resolutions must reference the meeting.'
        using errcode = '23502';
    end if;

    select
        r.tenant_id,
        r.id,
        r.meeting_id,
        m.weg_id
      into v_resolution
      from public.resolution as r
      join public.meeting as m
        on m.tenant_id = r.tenant_id
       and m.id = r.meeting_id
     where r.tenant_id = new.tenant_id
       and r.id = new.resolution_id;

    if not found then
      raise exception 'Beschluss-Sammlung entry references an unknown resolution in this tenant.'
        using errcode = '23503';
    end if;

    if v_resolution.meeting_id is distinct from new.meeting_id then
      raise exception 'Beschluss-Sammlung entry meeting does not match resolution meeting.'
        using errcode = '23514';
    end if;

    if v_resolution.weg_id is distinct from new.weg_id then
      raise exception 'Beschluss-Sammlung entry WEG does not match resolution WEG.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.tg_bse_meeting_resolution_integrity() from public;

drop trigger if exists bse_meeting_resolution_integrity on public.beschluss_sammlung_entry;
create trigger bse_meeting_resolution_integrity
  before insert on public.beschluss_sammlung_entry
  for each row
  execute function public.tg_bse_meeting_resolution_integrity();

create or replace function public.feststellen_resolution(p_resolution_id uuid)
returns table (
  resolution_id uuid,
  beschluss_sammlung_entry_id uuid,
  lfd_nr bigint,
  festgestellt_am timestamptz,
  typ text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor text;
  v_user_id uuid;
  v_now timestamptz := pg_catalog.now();
  v_resolution record;
  v_stichtag date;
  v_total_eligible integer;
  v_vote_count integer;
  v_ja integer;
  v_nein integer;
  v_enthaltung integer;
  v_ja_mea numeric;
  v_nein_mea numeric;
  v_total_mea numeric;
  v_positive boolean;
  v_bse_id uuid;
  v_lfd_nr bigint;
  v_typ text;
begin
  v_actor := coalesce(nullif(pg_catalog.current_setting('app.actor_type', true), ''), 'user');
  if v_actor = 'agent' then
    raise exception 'Agents cannot feststellen resolutions.'
      using errcode = '42501',
            hint = 'Agents may only create suggestions; final resolution acts are human actions.';
  end if;

  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authenticated user required to feststellen a resolution.'
      using errcode = '42501';
  end if;

  select
      r.id,
      r.tenant_id,
      r.meeting_id,
      r.agenda_item_id,
      r.text,
      r.mehrheits_typ,
      r.stimmprinzip,
      r.festgestellt_am,
      m.weg_id,
      m.modus,
      m.status as meeting_status,
      m.termin_von,
      ai.meeting_id as agenda_meeting_id
    into v_resolution
    from public.resolution as r
    join public.meeting as m
      on m.tenant_id = r.tenant_id
     and m.id = r.meeting_id
    left join public.agenda_item as ai
      on ai.tenant_id = r.tenant_id
     and ai.id = r.agenda_item_id
   where r.id = p_resolution_id
     and r.tenant_id = public.tenant_id()
   for update of r;

  if not found then
    raise exception 'Resolution not found or not visible for this tenant.'
      using errcode = '42501';
  end if;

  if v_resolution.agenda_item_id is not null
     and v_resolution.agenda_meeting_id is distinct from v_resolution.meeting_id then
    raise exception 'Resolution agenda_item does not belong to its meeting.'
      using errcode = '23514';
  end if;

  if v_resolution.meeting_status is distinct from 'laufend' then
    raise exception 'Resolution can only be festgestellt while the meeting is laufend.'
      using errcode = '42501';
  end if;

  if v_resolution.festgestellt_am is not null then
    raise exception 'Resolution has already been festgestellt.'
      using errcode = '23505';
  end if;

  if exists (
    select 1
      from public.beschluss_sammlung_entry as bse
     where bse.tenant_id = v_resolution.tenant_id
       and bse.resolution_id = v_resolution.id
  ) then
    raise exception 'Resolution already has a Beschluss-Sammlung entry.'
      using errcode = '23505';
  end if;

  if v_resolution.termin_von is null then
    raise exception 'Resolution finalization requires a meeting date.'
      using errcode = '23514';
  end if;

  v_stichtag := v_resolution.termin_von::date;

  if exists (
    select 1
      from public.vote as v
      left join public.ownership as o
        on o.tenant_id = v.tenant_id
       and o.id = v.ownership_id
     where v.tenant_id = v_resolution.tenant_id
       and v.resolution_id = v_resolution.id
       and (
         o.id is null
         or o.weg_id is distinct from v_resolution.weg_id
         or o.von > v_stichtag
         or (o.bis is not null and o.bis < v_stichtag)
       )
  ) then
    raise exception 'Resolution has votes with an invalid ownership basis.'
      using errcode = '23514';
  end if;

  select count(*)
    into v_total_eligible
    from public.ownership as o
   where o.tenant_id = v_resolution.tenant_id
     and o.weg_id = v_resolution.weg_id
     and o.von <= v_stichtag
     and (o.bis is null or o.bis >= v_stichtag);

  if v_total_eligible <= 0 then
    raise exception 'Resolution cannot be festgestellt without an eligible ownership basis.'
      using errcode = '23514';
  end if;

  select
      count(*)::integer,
      (count(*) filter (where v.wert = 'ja'))::integer,
      (count(*) filter (where v.wert = 'nein'))::integer,
      (count(*) filter (where v.wert = 'enthaltung'))::integer,
      coalesce(sum((u.mea_zaehler::numeric / u.mea_nenner::numeric)) filter (where v.wert = 'ja'), 0),
      coalesce(sum((u.mea_zaehler::numeric / u.mea_nenner::numeric)) filter (where v.wert = 'nein'), 0),
      coalesce(sum(u.mea_zaehler::numeric / u.mea_nenner::numeric), 0)
    into v_vote_count, v_ja, v_nein, v_enthaltung, v_ja_mea, v_nein_mea, v_total_mea
    from public.vote as v
    join public.ownership as o
      on o.tenant_id = v.tenant_id
     and o.id = v.ownership_id
    join public.unit as u
      on u.tenant_id = o.tenant_id
     and u.id = o.unit_id
   where v.tenant_id = v_resolution.tenant_id
     and v.resolution_id = v_resolution.id;

  if v_vote_count <= 0 then
    raise exception 'Resolution cannot be festgestellt without votes.'
      using errcode = '23514';
  end if;

  case v_resolution.stimmprinzip
    when 'kopf' then
      null;
    when 'objekt' then
      if exists (
        select 1
          from public.vote as v
          join public.ownership as o
            on o.tenant_id = v.tenant_id
           and o.id = v.ownership_id
         where v.tenant_id = v_resolution.tenant_id
           and v.resolution_id = v_resolution.id
         group by o.unit_id
        having count(*) > 1
      ) then
        raise exception 'Object voting has multiple votes for the same unit.'
          using errcode = '23514';
      end if;
    when 'wert' then
      if v_total_mea <= 0 then
        raise exception 'Value voting requires positive MEA data.'
          using errcode = '23514';
      end if;
    else
      raise exception 'Unsupported stimmprinzip: %', v_resolution.stimmprinzip
        using errcode = '23514';
  end case;

  case v_resolution.mehrheits_typ
    when 'einfach' then
      v_positive := case
        when v_resolution.stimmprinzip = 'wert' then v_ja_mea > v_nein_mea
        else v_ja > v_nein
      end;
    when 'qualifiziert' then
      v_positive := case
        when v_resolution.stimmprinzip = 'wert' then
          (v_ja_mea + v_nein_mea) > 0 and v_ja_mea / (v_ja_mea + v_nein_mea) >= 0.75
        else
          (v_ja + v_nein) > 0 and v_ja::numeric / (v_ja + v_nein)::numeric >= 0.75
      end;
    when 'doppelt_qualifiziert' then
      v_positive := (v_ja + v_nein) > 0
        and v_ja::numeric / (v_ja + v_nein)::numeric > (2.0 / 3.0)
        and v_total_mea > 0
        and v_ja_mea / v_total_mea > 0.5;
    when 'allstimmig' then
      v_positive := v_ja = v_total_eligible and v_nein = 0 and v_enthaltung = 0;
    when 'vereinbarungs_aenderung' then
      v_positive := v_ja = v_total_eligible and v_nein = 0 and v_enthaltung = 0;
    else
      raise exception 'Unsupported mehrheits_typ: %', v_resolution.mehrheits_typ
        using errcode = '23514';
  end case;

  v_typ := case
    when v_resolution.modus = 'umlauf' then 'umlaufbeschluss'
    when v_positive then 'positiv_beschluss'
    else 'negativ_beschluss'
  end;

  perform pg_catalog.set_config('app.resolution_finalizer', '1', true);

  update public.resolution
     set festgestellt_am = v_now,
         updated_at = v_now
   where tenant_id = v_resolution.tenant_id
     and id = v_resolution.id;

  insert into public.beschluss_sammlung_entry as bse (
    tenant_id,
    weg_id,
    meeting_id,
    resolution_id,
    beschluss_text,
    datum,
    typ,
    erstellt_durch
  )
  values (
    v_resolution.tenant_id,
    v_resolution.weg_id,
    v_resolution.meeting_id,
    v_resolution.id,
    v_resolution.text,
    coalesce(v_resolution.termin_von::date, v_now::date),
    v_typ,
    v_user_id
  )
  returning bse.id, bse.lfd_nr
    into v_bse_id, v_lfd_nr;

  resolution_id := v_resolution.id;
  beschluss_sammlung_entry_id := v_bse_id;
  lfd_nr := v_lfd_nr;
  festgestellt_am := v_now;
  typ := v_typ;
  return next;
end;
$$;

revoke all on function public.feststellen_resolution(uuid) from public;
grant execute on function public.feststellen_resolution(uuid) to authenticated;

comment on function public.feststellen_resolution(uuid) is
  'Atomically finalizes a resolution and appends the corresponding Beschluss-Sammlung entry.';

notify pgrst, 'reload schema';
