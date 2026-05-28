-- WEG-Verwaltung migration 0011: actor_type guards (Invariante 3).
-- See docs/01-system-design.md § 4.6 Invariante 3 + docs/04-ai-architecture.md § 4.3.
--
-- Enforces the "KI = nur Vorschläge" architectural rule at the DB
-- layer: triggers on vote, resolution, protocol.unterzeichnet,
-- beschluss_sammlung_entry RAISE EXCEPTION when the actor_type is
-- 'agent'. The actor_type signal is read from a Postgres GUC
-- (current_setting('app.actor_type', true)) that the FastAPI agent
-- service is responsible for setting via SET LOCAL before each
-- supabase-py-via-PostgREST call. The web Server-Action path leaves
-- it unset (defaults to NULL — treated as 'user').
--
-- DESIGN NOTE: a JWT custom-claim approach would be tighter (no app-
-- side discipline needed) but would require the agent to re-sign the
-- JWT, which §2.4 explicitly forbids ("FastAPI calls Supabase with
-- the SAME user JWT, NOT service_role"). The GUC approach keeps the
-- JWT untouched and shifts the responsibility to the @side_effect
-- decorator in apps/agent/app/tools/runtime.py (§4.3).

-- ---------------------------------------------------------------------------
-- audit_writer schema (created here if not yet present — 0006 created the
-- role only, not the schema; the trigger function lives under a dedicated
-- schema so it cannot be shadowed via search_path tricks).
-- ---------------------------------------------------------------------------

create schema if not exists audit_writer authorization audit_writer;

grant usage on schema audit_writer to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Trigger function — RAISE EXCEPTION when actor_type = 'agent'
-- ---------------------------------------------------------------------------

create or replace function audit_writer.assert_not_agent_write() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
begin
  v_actor := coalesce(current_setting('app.actor_type', true), 'user');
  if v_actor = 'agent' then
    raise exception 'Invariante 3 violation: actor_type=agent cannot write to %', tg_table_name
      using errcode = '42501',  -- insufficient_privilege
            hint = 'Agents must use the agent_suggestion table. See docs/01 §4.6 Invariante 3.';
  end if;
  return new;
end;
$$;

revoke all on function audit_writer.assert_not_agent_write() from public;
grant execute on function audit_writer.assert_not_agent_write() to authenticated;

comment on function audit_writer.assert_not_agent_write() is
  'Invariante 3 (§ 4.6): block writes when app.actor_type GUC = ''agent''. '
  'Set via SET LOCAL by the FastAPI agent service (§ 4.3 @side_effect decorator).';

-- ---------------------------------------------------------------------------
-- Trigger attachment — vote, resolution, beschluss_sammlung_entry, protocol
-- ---------------------------------------------------------------------------
--
-- vote: full lifecycle (INSERT/UPDATE/DELETE) blocked for agents.
-- resolution: full lifecycle blocked — Beschlussfeststellung is a human act.
-- beschluss_sammlung_entry: only INSERT — UPDATE/DELETE already blocked by
--   0005 raise-trigger (append-only, fires before this one matters).
-- protocol: only the signing-transition columns are guarded. Agent inserts
--   for ki_entwurf and column updates on `text` are explicitly allowed —
--   that is the entire point of the KI-Entwurf workflow (§ 4.4).

drop trigger if exists vote_no_agent_write on public.vote;
create trigger vote_no_agent_write
  before insert or update or delete on public.vote
  for each row
  execute function audit_writer.assert_not_agent_write();

drop trigger if exists resolution_no_agent_write on public.resolution;
create trigger resolution_no_agent_write
  before insert or update or delete on public.resolution
  for each row
  execute function audit_writer.assert_not_agent_write();

drop trigger if exists beschluss_sammlung_entry_no_agent_write
  on public.beschluss_sammlung_entry;
create trigger beschluss_sammlung_entry_no_agent_write
  before insert on public.beschluss_sammlung_entry
  for each row
  execute function audit_writer.assert_not_agent_write();

-- protocol: scope to the signing-transition columns. § 0004 stores the
-- signed state via three columns (status enum → 'unterzeichnet',
-- unterzeichnet_von, unterzeichnet_am). BEFORE UPDATE OF <cols> restricts
-- the trigger to UPDATEs that touch any of these columns — so an agent
-- editing `text` while status = 'ki_entwurf' is NOT blocked here.
drop trigger if exists protocol_no_agent_sign on public.protocol;
create trigger protocol_no_agent_sign
  before update of status, unterzeichnet_von, unterzeichnet_am on public.protocol
  for each row
  execute function audit_writer.assert_not_agent_write();

-- ---------------------------------------------------------------------------
-- DEV-MODE NOTE: with app.actor_type NEVER set by the web app, this
-- trigger is purely informational locally. The agent-side enforcement
-- ships in apps/agent/app/tools/runtime.py via @side_effect — that
-- decorator MUST issue SET LOCAL app.actor_type = 'agent' as the
-- first statement in every supabase client call from the agent
-- process. Until that landed, this trigger fires correctly but is
-- never reached because no caller sets actor_type=agent.
-- ---------------------------------------------------------------------------
