-- WEG-Verwaltung migration 0002: identity — tenants, tenant_member, custom-access-token hook.
-- See docs/01-system-design.md § 4.1 (Tenant root), docs/02-architecture-deployment.md § 2.4
-- (JWT app_metadata.tenant_id), docs/03-security-model.md § 3.3 (role model).
--
-- The Custom Access Token Hook is registered in the Supabase dashboard under
-- Authentication → Hooks → "Customize Access Token (JWT) Claims". It is *not*
-- wired up by this migration — only the function shape exists.

-- ---------------------------------------------------------------------------
-- public.tenant — root of multi-tenancy (Verwalter-Kanzlei)
-- ---------------------------------------------------------------------------

create table if not exists public.tenant (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.tenant is
  'Verwalter-Kanzlei. Root of multi-tenant isolation. RLS lets a user SELECT only their own tenant.';

-- ---------------------------------------------------------------------------
-- public.tenant_member — user ↔ tenant ↔ role (§ 3.3)
-- ---------------------------------------------------------------------------

create table if not exists public.tenant_member (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant(id) on delete restrict,
  user_id     uuid not null,  -- references auth.users(id); FK omitted to keep this migration self-contained.
  role        text not null check (role in (
    'tenant_admin',
    'verwalter_mitarbeiter',
    'beirat',
    'eigentuemer'
  )),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, user_id)
);

comment on table public.tenant_member is
  'Membership + role per (tenant, user). Source of truth for the JWT app_metadata.tenant_id claim.';

create index if not exists tenant_member_user_id_idx
  on public.tenant_member (user_id);

create index if not exists tenant_member_tenant_id_idx
  on public.tenant_member (tenant_id);

-- Composite unique key on (tenant_id, id) — used as the target of composite FKs from
-- downstream tables, ensuring no cross-tenant linkage at FK level (§ 3.4 L3 mitigation).
alter table public.tenant
  add constraint tenant_tenant_id_id_uk unique (id);  -- tenant.id alone is already the PK;
-- this constraint name documents the contract used by composite FKs in 0003.

-- ---------------------------------------------------------------------------
-- Custom Access Token Hook (§ 2.4)
-- ---------------------------------------------------------------------------
--
-- Supabase calls this function whenever it mints a JWT. It receives the
-- pending claim set as `event jsonb` and must return the augmented `event`.
-- We inject `app_metadata.tenant_id` (and `app_metadata.role`) from
-- tenant_member, so RLS predicates can read them via auth.jwt().
--
-- Multi-tenant note: the MVP picks the *first* tenant_member row for the user.
-- A real multi-tenancy UX (one user, many tenants) would either:
--   (a) require an active_tenant_id in user_metadata, OR
--   (b) issue tenant-scoped tokens via a dedicated /switch-tenant endpoint.
-- Both are deferred — single-tenant-per-user is the MVP contract.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''  -- schema-qualify everything inside the body.
as $$
declare
  v_user_id   uuid := (event ->> 'user_id')::uuid;
  v_tenant_id uuid;
  v_role      text;
  v_claims    jsonb;
  v_app_meta  jsonb;
begin
  -- Default to whatever the event already carries.
  v_claims := coalesce(event -> 'claims', '{}'::jsonb);
  v_app_meta := coalesce(v_claims -> 'app_metadata', '{}'::jsonb);

  -- Look up the user's tenant + role. Stable, indexed by (user_id).
  select tm.tenant_id, tm.role
    into v_tenant_id, v_role
    from public.tenant_member tm
   where tm.user_id = v_user_id
   order by tm.created_at asc
   limit 1;

  if v_tenant_id is not null then
    v_app_meta := v_app_meta
      || jsonb_build_object(
           'tenant_id', v_tenant_id::text,
           'role',      v_role
         );
    v_claims := jsonb_set(v_claims, '{app_metadata}', v_app_meta, true);
    event := jsonb_set(event, '{claims}', v_claims, true);
  end if;

  return event;
end;
$$;

comment on function public.custom_access_token_hook(jsonb) is
  'Custom Access Token Hook — injects tenant_id + role into app_metadata. Registered in Supabase dashboard. See docs/02-architecture-deployment.md § 2.4.';

-- Allow Supabase Auth to invoke the hook.
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
