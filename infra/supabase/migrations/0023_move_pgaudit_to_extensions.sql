-- WEG-Verwaltung migration 0023: move pgaudit out of public into extensions.
-- Closes 5 Supabase advisors in one move:
--   1× extension_in_public (pgaudit)
--   2× anon_security_definer_function_executable
--       (public.pgaudit_ddl_command_end, public.pgaudit_sql_drop)
--   2× authenticated_security_definer_function_executable (same two functions)
--
-- The four security_definer advisors were the structural reason migrations
-- 0020 and 0021 existed: REVOKE EXECUTE returned `01006: no privileges could
-- be revoked` because the linter scans the schema (PostgREST exposes any
-- function in `public` as /rest/v1/rpc/<name>), not the actual grant table.
-- Moving pgaudit out of public removes the functions from the API surface
-- entirely, closing all four advisors at the root.
--
-- DROP EXTENSION pgaudit CASCADE drops the two C event triggers
-- (pgaudit_ddl_command_end, pgaudit_sql_drop). CREATE EXTENSION pgaudit
-- WITH SCHEMA extensions re-creates them in the new schema so audit-log
-- behavior resumes immediately. We have no ALTER ROLE ... SET pgaudit.*
-- runtime tuning to preserve (verified: bare CREATE EXTENSION in 0001 is
-- the only configuration touch).
--
-- Migrations 0020 + 0021 become structurally moot after this lands. Left in
-- place as historical record — their own headers already note they were
-- Cloud-side no-ops.

drop extension if exists pgaudit cascade;
create extension if not exists pgaudit with schema extensions;
