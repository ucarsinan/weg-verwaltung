-- WEG-Verwaltung migration 0058: grant audit_writer the Vault decrypt it needs.
--
-- Purpose:
--   audit_writer.hash_audit_event_v2() (0045) reads audit_hmac_key via the
--   vault.decrypted_secrets view. Migration 0033 already grants audit_writer
--   USAGE on schema vault and SELECT on that view, but a Postgres view does
--   not elevate EXECUTE privilege on functions used by its computed columns
--   to the view owner — the calling role still needs its own EXECUTE grant
--   on vault._crypto_aead_det_decrypt(), the function pgsodium/vault uses to
--   materialize decrypted_secret. Without it, ANY audited insert that routes
--   through audit_writer (e.g. a fresh public.tenant row) fails with
--   "permission denied for function _crypto_aead_det_decrypt", regardless of
--   which role ultimately triggered the write.
--
-- Why this was not caught earlier:
--   The hosted Frankfurt project already carries this grant as an
--   undocumented manual change (see infra/supabase/ci/audit_regression_bootstrap.sql
--   header). That bootstrap script tries to close the same local gap with
--   `grant execute on all functions in schema vault to audit_writer`, but
--   that statement is atomic — on a genuinely fresh local Postgres image it
--   fails as a whole (postgres cannot grant execute on every function in
--   schema vault, e.g. _crypto_aead_det_encrypt) and the wrapping exception
--   handler silently skips it, so the specific grant this project actually
--   needs never lands locally. This migration grants only the one function
--   audit_writer calls, so it succeeds even where the blanket grant cannot,
--   and it is now version-controlled instead of living only as a manual
--   hosted-project change.
--
-- Risk posture:
--   - No RLS policy changes, no new tables, no data migration.
--   - Scoped to a single EXECUTE grant on one existing Vault function.
--   - Wrapped in exception handling (same pattern as 0033) so it safely
--     no-ops if the migration runner lacks grant rights on schema vault
--     (expected on some hosted configurations where this grant already
--     exists out-of-band).
--   - Idempotent: safe to re-run.
--
-- Test strategy:
--   infra/supabase/tests/0058_audit_writer_vault_decrypt_grant.sql asserts
--   the grant exists and that an authenticated-triggered public.tenant
--   insert (and its audit_event row) succeeds end-to-end.
--
-- Rollback:
--   revoke execute on function vault._crypto_aead_det_decrypt(bytea, bytea, bigint, bytea, bytea) from audit_writer;

do $$
begin
  begin
    execute 'grant execute on function vault._crypto_aead_det_decrypt(bytea, bytea, bigint, bytea, bytea) to audit_writer';
    raise notice '0058: granted audit_writer execute on vault._crypto_aead_det_decrypt.';
  exception
    when insufficient_privilege or invalid_schema_name or undefined_function then
      raise warning '0058: could not grant vault._crypto_aead_det_decrypt to audit_writer (%). Assuming it is already granted out-of-band on this project.', sqlerrm;
  end;
end $$;
