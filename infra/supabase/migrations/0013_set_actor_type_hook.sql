-- WEG-Verwaltung migration 0013: set_actor_type GUC via PostgREST hook.
-- See docs/04-ai-architecture.md § 4.3 + migrations/0011_actor_type_guards.sql.
--
-- Migration 0011 left a dormant Agent-Write-Guard trigger that fires
-- when current_setting('app.actor_type','agent')='agent'. Until now no
-- code path sets that GUC. This migration wires the GUC via a
-- PostgREST `pgrst.pre_request` hook that reads the HTTP header
-- `X-Actor-Type` (whitelisted to 'user' | 'agent' | 'system') and
-- calls set_config('app.actor_type', value, true) for the duration
-- of the request. The FastAPI agent service is then responsible for
-- attaching X-Actor-Type: agent to every supabase-py call — done in
-- apps/agent/app/tools/runtime.py @side_effect decorator (follow-up).
--
-- Web Server Actions never set the header → GUC stays unset → trigger
-- treats it as 'user' and allows the write. No web-side change needed.

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to anon, authenticated, service_role;

create or replace function app.set_actor_type_from_header() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_header text;
  v_actor  text;
begin
  -- PostgREST exposes HTTP headers via current_setting('request.headers')
  v_header := coalesce(current_setting('request.headers', true)::jsonb ->> 'x-actor-type', '');

  -- Whitelist: only 'agent' | 'system' need to be set; 'user' and '' are no-ops
  v_actor := case v_header
               when 'agent'  then 'agent'
               when 'system' then 'system'
               else null
             end;

  if v_actor is not null then
    perform set_config('app.actor_type', v_actor, true);  -- true = SET LOCAL semantics
  end if;
end;
$$;

revoke all on function app.set_actor_type_from_header() from public;
grant execute on function app.set_actor_type_from_header() to anon, authenticated, service_role;

-- Tell PostgREST to call our function before each request. The setting
-- name is documented at https://postgrest.org/en/stable/configuration.html#db-pre-request
-- On Supabase, set per-database (not per-role) via ALTER DATABASE.
-- Safe to run repeatedly: ALTER DATABASE … SET is upsert-like.
alter database postgres
  set "pgrst.db_pre_request" = 'app.set_actor_type_from_header';

-- Force PostgREST to pick up the new config without a restart.
-- (Supabase auto-reloads on a NOTIFY pgrst, 'reload config'.)
notify pgrst, 'reload config';

-- Test helper: lets pgTAP-style tests inject the GUC without going
-- through PostgREST. Not granted to any role by default — production
-- must not have a back-door.
create or replace function app.set_actor_type_for_test(p_value text) returns void
language sql
security definer
set search_path = ''
as $$
  select set_config('app.actor_type', p_value, true);
$$;

revoke all on function app.set_actor_type_for_test(text) from public;
-- Only grant in dev — production should not have a back-door. Comment-only:
-- grant execute on function app.set_actor_type_for_test(text) to service_role;

-- Integration contract for apps/agent/app/tools/runtime.py:
--
--   The @side_effect decorator MUST add `X-Actor-Type: agent` to the
--   per-request supabase-py client used inside tool calls. With this
--   migration, PostgREST sets the GUC for that one request, the
--   0011 trigger fires when the request hits a protected table, and
--   the agent's INSERT/UPDATE/DELETE is rejected with SQLSTATE 42501.
--
--   Web Server Actions (apps/web/src/app/**/actions.ts) use the same
--   supabase-ssr client without the header → GUC unset → trigger
--   treats as 'user' → write proceeds.
--
--   pg_cron jobs (Section 4.4) running the frist-scan should use
--   X-Actor-Type: system so the audit_event.actor_type column
--   correctly records them.
