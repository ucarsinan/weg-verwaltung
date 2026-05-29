-- WEG-Verwaltung migration 0018: backfill pgrst.db_pre_request on existing envs.
--
-- 0013 originally tried `ALTER DATABASE postgres SET pgrst.db_pre_request = ...`,
-- which silently no-ops on hosted Supabase because `postgres` is not allowed
-- to set parameters on the postgres DB. The fix is to set the parameter on
-- the `authenticator` role instead, which is the role PostgREST actually
-- connects as. 0013 has been corrected in-source for fresh environments;
-- this migration backfills the same setting on any environment where 0013
-- was already applied with the old (silently-failing) form.
--
-- Idempotent: ALTER ROLE ... SET ... is upsert semantics, and NOTIFY is a
-- no-op when no listeners exist.

alter role authenticator
  set "pgrst.db_pre_request" = 'app.set_actor_type_from_header';

notify pgrst, 'reload config';
