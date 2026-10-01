-- WEG-Verwaltung migration 0077: narrow the grants of the audit console (0050) and the Vorgang tables (0052).
--
-- Symptom:
--   pgTAP contracts 0050 (tests 38, 39, 41, 42, 45, 46) and 0052 (tests 6, 7, 8)
--   fail on a fresh local reset. anon and authenticated hold SELECT/INSERT/UPDATE/
--   DELETE on all seven vorgang* tables, authenticated holds all four on
--   audit_payload_reveal and audit_integrity_check, and anon/service_role can
--   execute audit_event_feed and audit_reveal_event_payload.
--
-- Root cause:
--   Supabase installs default privileges that grant new public objects directly
--   to anon, authenticated and service_role. 0050 and 0052 wrote
--   `revoke all ... from public`, which does not touch those direct grants, and
--   then granted the intended subset on top. The extra rights were never
--   removed. 0055 fixed the same class for five functions only.
--
-- Impact before this migration (no data exposure):
--   RLS is forced on every table involved, no policy targets anon, there is no
--   DELETE policy on the vorgang* tables, and the timeline's append-only
--   triggers reject UPDATE/DELETE. The surplus is a least-privilege violation
--   that leaves RLS and the triggers as the only barrier, not an open hole.
--
-- Fix:
--   For each object: revoke the direct grants from anon, authenticated and, where
--   the contract says so, service_role; then re-grant exactly what 0050/0052 meant
--   to give. The app calls these objects only through the user-scoped client
--   (apps/web/src/app/(dashboard)/audit/actions.ts), so authenticated keeps what
--   it uses and nothing else changes for it.
--
-- Risk posture:
--   - No RLS policy, table, trigger, function-body or audit-chain change.
--   - service_role keeps its table privileges (it bypasses RLS and is the
--     operator path); only its EXECUTE on the two tenant-scoped UI RPCs is
--     removed, as contract 0050 requires.
--   - Idempotent: revoke + grant can run repeatedly.
--
-- Test strategy:
--   0050 and 0052 assert the resulting privilege sets and join the CI gate with
--   this migration.
--
-- Rollback:
--   Forward-only. Re-granting the surplus would restore the defect; a needed
--   right is restored by a new migration that names it.

-- ---------------------------------------------------------------------------
-- Audit console (0050)
-- ---------------------------------------------------------------------------

revoke all on function public.audit_event_feed(
  timestamptz, timestamptz, text, text, text, text, text, timestamptz, bigint, integer
) from anon, authenticated, service_role;
grant execute on function public.audit_event_feed(
  timestamptz, timestamptz, text, text, text, text, text, timestamptz, bigint, integer
) to authenticated;

revoke all on function public.audit_reveal_event_payload(uuid, timestamptz)
  from anon, authenticated, service_role;
grant execute on function public.audit_reveal_event_payload(uuid, timestamptz)
  to authenticated;

revoke all on public.audit_payload_reveal from anon, authenticated;
grant select, insert on public.audit_payload_reveal to authenticated;

revoke all on public.audit_integrity_check from anon, authenticated;
grant select on public.audit_integrity_check to authenticated;

-- ---------------------------------------------------------------------------
-- Vorgangszentrale (0052): same grants 0052 intended, without the defaults.
-- ---------------------------------------------------------------------------

revoke all on public.vorgang from anon, authenticated;
revoke all on public.vorgang_inbox_item from anon, authenticated;
revoke all on public.vorgang_task from anon, authenticated;
revoke all on public.vorgang_timeline_event from anon, authenticated;
revoke all on public.vorgang_relation from anon, authenticated;
revoke all on public.vorgang_participant from anon, authenticated;
revoke all on public.vorgang_visibility from anon, authenticated;

grant select, insert, update on public.vorgang to authenticated;
grant select, insert, update on public.vorgang_inbox_item to authenticated;
grant select, insert, update on public.vorgang_task to authenticated;
grant select, insert on public.vorgang_timeline_event to authenticated;
grant select, insert, update on public.vorgang_relation to authenticated;
grant select, insert, update on public.vorgang_participant to authenticated;
grant select, insert, update on public.vorgang_visibility to authenticated;

notify pgrst, 'reload schema';
