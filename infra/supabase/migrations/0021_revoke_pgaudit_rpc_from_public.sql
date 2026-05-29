-- WEG-Verwaltung migration 0021: actually revoke pgaudit RPC exposure.
--
-- 0020 attempted `REVOKE … FROM anon, authenticated` for the pgaudit C
-- functions and was reported by Postgres as a no-op
-- (WARNING 01006: no privileges could be revoked). The reason: anon and
-- authenticated do not hold direct grants on these functions — they
-- inherit EXECUTE from PUBLIC, which is the Postgres default for any
-- newly-created function. Revoking from a role that has no direct grant
-- doesn't touch PUBLIC, so the REST exposure stayed open.
--
-- This migration revokes from PUBLIC, which is what actually closes the
-- `/rest/v1/rpc/pgaudit_*` surface for both unauthenticated and signed-in
-- clients. Event-trigger invocation bypasses EXECUTE checks (it goes
-- through pg's internal trigger machinery, not through the SQL call
-- gate), so audit logging keeps working.
--
-- If pgaudit is later moved out of `public` (backlog: extension_in_public),
-- these REVOKEs become unreachable and the migration becomes a no-op —
-- which is harmless; it stays as a defense-in-depth marker.

revoke execute on function public.pgaudit_ddl_command_end() from public;
revoke execute on function public.pgaudit_sql_drop() from public;
