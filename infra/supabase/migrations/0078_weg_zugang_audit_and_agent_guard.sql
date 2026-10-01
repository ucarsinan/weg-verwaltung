-- WEG-Verwaltung migration 0078: audit trail and agent-write guard for weg_zugang.
--
-- Gap:
--   0075 introduced public.weg_zugang, the explicit assignment user -> WEG that
--   decides which WEGs an `eigentuemer` may read. The table carries RLS and
--   policies but no triggers: granting or revoking read access to a WEG left no
--   audit_event, and nothing stopped an agent from writing it. A sibling table
--   with the same character, aufbewahrungsregel (0069), carries both.
--
-- Why this matters:
--   A grant of read access to a WEG is a verifiable act: who allowed whom to see
--   which WEG, and when. erteilt_von and erteilt_am only describe the latest row;
--   a revoked grant is a DELETE and leaves nothing behind. The audit_event chain
--   is the durable record. KI stays suggestion-only (AGENTS.md invariant 2); an
--   agent must not widen or narrow what a human can see.
--
-- Change:
--   - weg_zugang_block_agent_writes (BEFORE INSERT/UPDATE/DELETE) reuses
--     public.tg_finance_allocation_block_agent_writes() (0056), which raises 42501
--     when app.actor_type = 'agent'. The function is generic despite its name; it
--     is the same guard 0069 binds to aufbewahrungsregel.
--   - weg_zugang_audit_emit (AFTER INSERT/UPDATE/DELETE) reuses the generic
--     audit_writer.tg_emit_audit_event(), which needs id and tenant_id; weg_zugang
--     has both. It reads the actor from the JWT GUCs inline (0028).
--
-- Risk posture:
--   - No RLS policy, grant, column or data change. Two triggers are added.
--   - No change to the audit chain (hash, HMAC, partitions, append-only logic).
--   - weg_zugang starts empty and has no UI yet, so no existing workflow changes.
--   - A write by the app (actor_type 'user', the default) is unaffected apart
--     from one extra audit_event row per grant or revocation.
--
-- Test strategy:
--   infra/supabase/tests/0078_weg_zugang_audit.sql asserts both triggers exist,
--   that an admin grant and revocation each emit exactly one audit_event row
--   attributed to the acting user, that a duplicate grant is rejected, that
--   verwalter_mitarbeiter and eigentuemer cannot grant or revoke, and that an
--   agent is rejected on INSERT and DELETE.
--
-- Rollback:
--   Forward-only. Dropping the triggers would reopen the gap; a trigger that
--   proves too strict is corrected by a new migration.

drop trigger if exists weg_zugang_block_agent_writes on public.weg_zugang;
create trigger weg_zugang_block_agent_writes
  before insert or update or delete on public.weg_zugang
  for each row
  execute function public.tg_finance_allocation_block_agent_writes();

drop trigger if exists weg_zugang_audit_emit on public.weg_zugang;
create trigger weg_zugang_audit_emit
  after insert or update or delete on public.weg_zugang
  for each row execute function audit_writer.tg_emit_audit_event();

comment on trigger weg_zugang_block_agent_writes on public.weg_zugang is
  '0078: the AI never grants or revokes access to a WEG (suggestion-only invariant).';
comment on trigger weg_zugang_audit_emit on public.weg_zugang is
  '0078: every grant and revocation of WEG access emits an append-only audit_event row.';
