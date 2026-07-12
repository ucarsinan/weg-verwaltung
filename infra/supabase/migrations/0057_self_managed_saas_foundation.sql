-- WEG-Verwaltung migration 0057: self-managed WEG SaaS foundation.
--
-- This migration adds the narrow, security-critical contract for the first
-- self-service slice: a 30-day trial, invitation acceptance, and the rule
-- that a WEG can never lose its last tenant_admin. It deliberately does not
-- add live billing or a universal write guard for historical domain modules.

-- ---------------------------------------------------------------------------
-- 1. Tenant membership marker and SaaS state tables
-- ---------------------------------------------------------------------------

alter table public.tenant_member
  add column if not exists is_founding_admin boolean not null default false;

comment on column public.tenant_member.is_founding_admin is
  'Marks the user who created a self-managed WEG. It is informational only and grants no additional permission.';

create table if not exists public.tenant_subscription (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenant(id) on delete restrict,
  plan                     text not null check (plan in ('start', 'gemeinschaft')),
  status                   text not null check (status in ('trial', 'active', 'past_due', 'cancelled')),
  unit_count               integer not null check (unit_count between 3 and 20),
  trial_started_at         timestamptz not null,
  trial_ends_at            timestamptz not null,
  current_period_ends_at   timestamptz,
  provider_customer_id     text,
  provider_subscription_id text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (tenant_id),
  constraint tenant_subscription_trial_window_valid
    check (trial_ends_at > trial_started_at),
  constraint tenant_subscription_period_valid
    check (current_period_ends_at is null or current_period_ends_at >= trial_started_at),
  constraint tenant_subscription_plan_matches_unit_count
    check (
      (plan = 'start' and unit_count between 3 and 10)
      or (plan = 'gemeinschaft' and unit_count between 11 and 20)
    )
);

comment on table public.tenant_subscription is
  'Server-managed subscription state for one self-managed WEG tenant. Direct client writes are forbidden.';

create table if not exists public.tenant_invitation (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenant(id) on delete restrict,
  email              text not null check (email = lower(email) and char_length(trim(email)) > 3),
  role               text not null check (role in ('tenant_admin', 'eigentuemer')),
  token_hash         bytea not null check (octet_length(token_hash) = 32),
  created_by_user_id uuid not null,
  expires_at         timestamptz not null,
  accepted_at        timestamptz,
  accepted_by_user_id uuid,
  revoked_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint tenant_invitation_expiry_valid check (expires_at > created_at),
  constraint tenant_invitation_acceptance_valid
    check (
      (accepted_at is null and accepted_by_user_id is null)
      or (accepted_at is not null and accepted_by_user_id is not null)
    ),
  constraint tenant_invitation_not_accepted_and_revoked
    check (not (accepted_at is not null and revoked_at is not null))
);


comment on table public.tenant_invitation is
  'One-time, email-bound tenant invitation. Only a SHA-256 token hash is stored; plaintext tokens never enter the database.';

create unique index if not exists tenant_invitation_one_open_email_idx
  on public.tenant_invitation (tenant_id, email)
  where accepted_at is null and revoked_at is null;

create index if not exists tenant_invitation_open_token_idx
  on public.tenant_invitation (token_hash)
  where accepted_at is null and revoked_at is null;

-- ---------------------------------------------------------------------------
-- 2. RLS and direct grants
-- ---------------------------------------------------------------------------

alter table public.tenant_subscription enable row level security;
alter table public.tenant_subscription force row level security;
revoke all on public.tenant_subscription from public, anon, authenticated, service_role;
grant select on public.tenant_subscription to authenticated;

create policy subscription_select_own_tenant
  on public.tenant_subscription for select to authenticated
  using (tenant_id = (select public.tenant_id()));

alter table public.tenant_invitation enable row level security;
alter table public.tenant_invitation force row level security;
revoke all on public.tenant_invitation from public, anon, authenticated, service_role;
grant select on public.tenant_invitation to authenticated;

create policy invitation_select_own_tenant_admin
  on public.tenant_invitation for select to authenticated
  using (
    tenant_id = (select public.tenant_id())
    and (select public.has_role('tenant_admin'))
  );

-- ---------------------------------------------------------------------------
-- 3. Last-admin protection
-- ---------------------------------------------------------------------------

create or replace function public.tg_prevent_last_tenant_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_remaining_admins integer;
begin
  if old.role <> 'tenant_admin' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.role = 'tenant_admin' then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(old.tenant_id::text, 0)
  );

  select count(*)
    into v_remaining_admins
    from public.tenant_member as member
   where member.tenant_id = old.tenant_id
     and member.role = 'tenant_admin'
     and member.id <> old.id;

  if v_remaining_admins = 0 then
    raise exception 'last tenant admin cannot be removed'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.tg_prevent_last_tenant_admin() from public, anon, authenticated, service_role;

drop trigger if exists tenant_member_prevent_last_admin on public.tenant_member;
create trigger tenant_member_prevent_last_admin
  before update of role or delete on public.tenant_member
  for each row
  execute function public.tg_prevent_last_tenant_admin();

-- ---------------------------------------------------------------------------
-- 4. Redacted audit emitters
-- ---------------------------------------------------------------------------
-- The existing tenant emitter used auth.uid() from audit_writer context. The
-- generic emitter was corrected in 0028 because that cross-schema execution
-- path can fail on hosted Supabase. Keep tenant creation on the same safe path.

create or replace function audit_writer.tg_emit_tenant_audit_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_type text;
  v_actor_user uuid;
  v_payload    jsonb;
  v_entity_id  uuid;
  v_tenant     uuid;
  v_uid_text   text;
begin
  v_actor_type := coalesce(nullif(current_setting('app.actor_type', true), ''), 'user');
  v_uid_text := coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  );
  begin
    v_actor_user := v_uid_text::uuid;
  exception when others then
    v_actor_user := null;
  end;

  if tg_op in ('INSERT', 'UPDATE') then
    v_payload := to_jsonb(new);
    v_entity_id := new.id;
    v_tenant := new.id;
  else
    v_payload := to_jsonb(old);
    v_entity_id := old.id;
    v_tenant := old.id;
  end if;

  insert into public.audit_event (
    tenant_id, actor_type, actor_user_id, entity_typ, entity_id, action, payload
  ) values (
    v_tenant, v_actor_type, v_actor_user, tg_table_name, v_entity_id, lower(tg_op), v_payload
  );
  return null;
end;
$$;

alter function audit_writer.tg_emit_tenant_audit_event() owner to audit_writer;
revoke all on function audit_writer.tg_emit_tenant_audit_event() from public;
grant execute on function audit_writer.tg_emit_tenant_audit_event() to audit_writer;

create or replace function audit_writer.tg_emit_saas_audit_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_type text;
  v_actor_user uuid;
  v_payload    jsonb;
  v_entity_id  uuid;
  v_tenant     uuid;
  v_uid_text   text;
begin
  v_actor_type := coalesce(nullif(current_setting('app.actor_type', true), ''), 'user');
  v_uid_text := coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  );
  begin
    v_actor_user := v_uid_text::uuid;
  exception when others then
    v_actor_user := null;
  end;

  if tg_op in ('INSERT', 'UPDATE') then
    v_payload := to_jsonb(new);
    v_entity_id := new.id;
    v_tenant := new.tenant_id;
  else
    v_payload := to_jsonb(old);
    v_entity_id := old.id;
    v_tenant := old.tenant_id;
  end if;

  v_payload := v_payload
    - 'token_hash'
    - 'provider_customer_id'
    - 'provider_subscription_id';

  insert into public.audit_event (
    tenant_id, actor_type, actor_user_id, entity_typ, entity_id, action, payload
  ) values (
    v_tenant, v_actor_type, v_actor_user, tg_table_name, v_entity_id, lower(tg_op), v_payload
  );
  return null;
end;
$$;

alter function audit_writer.tg_emit_saas_audit_event() owner to audit_writer;
revoke all on function audit_writer.tg_emit_saas_audit_event() from public;
grant execute on function audit_writer.tg_emit_saas_audit_event() to audit_writer;

drop trigger if exists tenant_subscription_audit_emit on public.tenant_subscription;
create trigger tenant_subscription_audit_emit
  after insert or update or delete on public.tenant_subscription
  for each row execute function audit_writer.tg_emit_saas_audit_event();

drop trigger if exists tenant_invitation_audit_emit on public.tenant_invitation;
create trigger tenant_invitation_audit_emit
  after insert or update or delete on public.tenant_invitation
  for each row execute function audit_writer.tg_emit_saas_audit_event();

-- ---------------------------------------------------------------------------
-- 5. Self-service RPCs
-- ---------------------------------------------------------------------------

create or replace function public.create_self_managed_weg_trial(
  p_tenant_name text,
  p_weg_name text,
  p_address jsonb,
  p_unit_count integer,
  p_plan text
)
returns table (tenant_id uuid, weg_id uuid, subscription_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_weg_id uuid;
  v_subscription_id uuid;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'authentication required'
      using errcode = '42501';
  end if;

  if nullif(btrim(p_tenant_name), '') is null
     or nullif(btrim(p_weg_name), '') is null
     or p_address is null
     or jsonb_typeof(p_address) <> 'object'
     or p_address = '{}'::jsonb then
    raise exception 'WEG details are incomplete'
      using errcode = '22023';
  end if;

  if not (
    (p_plan = 'start' and p_unit_count between 3 and 10)
    or (p_plan = 'gemeinschaft' and p_unit_count between 11 and 20)
  ) then
    raise exception 'plan and unit count do not match the supported range'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  if exists (
    select 1 from public.tenant_member as member where member.user_id = v_user_id
  ) then
    raise exception 'a user can only belong to one tenant in this release'
      using errcode = '42501';
  end if;

  insert into public.tenant (name)
  values (btrim(p_tenant_name))
  returning id into v_tenant_id;

  insert into public.tenant_member (tenant_id, user_id, role, is_founding_admin)
  values (v_tenant_id, v_user_id, 'tenant_admin', true);

  insert into public.tenant_subscription (
    tenant_id, plan, status, unit_count, trial_started_at, trial_ends_at
  ) values (
    v_tenant_id, p_plan, 'trial', p_unit_count, v_now, v_now + interval '30 days'
  ) returning id into v_subscription_id;

  insert into public.weg (tenant_id, name, adresse)
  values (v_tenant_id, btrim(p_weg_name), p_address::text)
  returning id into v_weg_id;

  return query select v_tenant_id, v_weg_id, v_subscription_id;
end;
$$;

create or replace function public.create_tenant_invitation(
  p_email text,
  p_role text,
  p_token_hash bytea,
  p_expires_at timestamptz default now() + interval '7 days'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid := public.tenant_id();
  v_invitation_id uuid;
  v_email text := lower(btrim(p_email));
begin
  if v_user_id is null or v_tenant_id is null or not public.has_role('tenant_admin') then
    raise exception 'tenant admin access required'
      using errcode = '42501';
  end if;

  if v_email is null or char_length(v_email) <= 3
     or p_role not in ('tenant_admin', 'eigentuemer')
     or p_token_hash is null
     or octet_length(p_token_hash) <> 32
     or p_expires_at <= now() then
    raise exception 'invitation details are invalid'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_tenant_id::text || ':' || v_email, 0)
  );

  update public.tenant_invitation
     set revoked_at = now(), updated_at = now()
   where tenant_id = v_tenant_id
     and email = v_email
     and accepted_at is null
     and revoked_at is null;

  insert into public.tenant_invitation (
    tenant_id, email, role, token_hash, created_by_user_id, expires_at
  ) values (
    v_tenant_id, v_email, p_role, p_token_hash, v_user_id, p_expires_at
  ) returning id into v_invitation_id;

  return v_invitation_id;
end;
$$;

create or replace function public.accept_tenant_invitation(
  p_token_hash bytea,
  p_vorname text,
  p_nachname text
)
returns table (tenant_id uuid, member_id uuid, person_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_invitation public.tenant_invitation%rowtype;
  v_member_id uuid;
  v_person_id uuid;
begin
  if v_user_id is null or v_email = '' then
    raise exception 'authentication required'
      using errcode = '42501';
  end if;

  if p_token_hash is null or octet_length(p_token_hash) <> 32
     or nullif(btrim(p_vorname), '') is null
     or nullif(btrim(p_nachname), '') is null then
    raise exception 'invitation details are invalid'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  if exists (
    select 1 from public.tenant_member as member where member.user_id = v_user_id
  ) then
    raise exception 'a user can only belong to one tenant in this release'
      using errcode = '42501';
  end if;

  select invitation.*
    into v_invitation
    from public.tenant_invitation as invitation
   where invitation.token_hash = p_token_hash
     and invitation.accepted_at is null
     and invitation.revoked_at is null
     and invitation.expires_at > now()
   for update;

  if not found or v_invitation.email <> v_email then
    raise exception 'invitation is invalid or no longer available'
      using errcode = '42501';
  end if;

  insert into public.tenant_member (tenant_id, user_id, role)
  values (v_invitation.tenant_id, v_user_id, v_invitation.role)
  returning id into v_member_id;

  insert into public.person (tenant_id, vorname, nachname, email, user_id)
  values (
    v_invitation.tenant_id, btrim(p_vorname), btrim(p_nachname), v_email, v_user_id
  ) returning id into v_person_id;

  update public.tenant_invitation
     set accepted_at = now(), accepted_by_user_id = v_user_id, updated_at = now()
   where id = v_invitation.id;

  return query select v_invitation.tenant_id, v_member_id, v_person_id;
end;
$$;

revoke all on function public.create_self_managed_weg_trial(text, text, jsonb, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.create_tenant_invitation(text, text, bytea, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.accept_tenant_invitation(bytea, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.create_self_managed_weg_trial(text, text, jsonb, integer, text) to authenticated;
grant execute on function public.create_tenant_invitation(text, text, bytea, timestamptz) to authenticated;
grant execute on function public.accept_tenant_invitation(bytea, text, text) to authenticated;

comment on function public.create_self_managed_weg_trial(text, text, jsonb, integer, text) is
  'Atomically creates one self-managed WEG tenant, founding tenant_admin, first WEG and a 30-day trial. A user may join only one tenant in this release.';
comment on function public.create_tenant_invitation(text, text, bytea, timestamptz) is
  'Creates an email-bound invitation from a SHA-256 token hash. Only tenant_admin users may call it; any existing open invitation for the same email is revoked.';
comment on function public.accept_tenant_invitation(bytea, text, text) is
  'Accepts a matching, unused invitation atomically and creates the tenant membership plus linked person record.';
