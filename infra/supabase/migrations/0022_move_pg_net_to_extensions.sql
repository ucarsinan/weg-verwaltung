-- WEG-Verwaltung migration 0022: move pg_net out of public into extensions.
-- Closes Supabase advisor `extension_in_public` for pg_net (1 of 3 in the
-- structural-fix series 0022-0024). See docs/03-security-model.md § 3.5 and
-- the CLAUDE.md backlog item that previously tracked this.
--
-- Safe because pg_net has zero consumers today: no SQL trigger, no Python/TS
-- caller references net.http_*, and net.http_request_queue is empty. The
-- pseudocode frist-scan job in docs/04-ai-architecture.md § 4.4 is design
-- intent, not deployed code. When that flow lands, it will call functions in
-- the `net` schema (auto-created by the extension, independent of the
-- extension's own home schema) and no rewrites are needed.
--
-- ALTER EXTENSION ... SET SCHEMA fails Cloud-side with SQLSTATE 42501
-- ("must be owner of extension pg_net") because supabase_admin owns the
-- extension — see https://github.com/supabase/postgres/issues/725. The
-- DROP + CREATE pair runs fine as the `postgres` role.

drop extension if exists pg_net;
create extension if not exists pg_net with schema extensions;
