-- WEG-Verwaltung migration 0017: seed audit_hmac_key into Supabase Vault.
-- See migrations/0009_audit_hmac.sql header (operational pre-req).
--
-- 0009 declared the secret slot as an "operational" step ("set out-of-band").
-- For a portfolio project where each environment is provisioned by `db push`,
-- baking the seed into a migration keeps the bootstrap reproducible while the
-- idempotency guard prevents:
--   (a) duplicate-name errors when the migration is re-applied, and
--   (b) regeneration that would invalidate the existing hash-chain.
--
-- Encryption key derivation: Supabase Vault uses pgsodium with a per-project
-- encryption key. A vault.secrets row cloned across projects will fail to
-- decrypt — by design. Each fresh environment generates its own secret on
-- first apply.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'audit_hmac_key') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'audit_hmac_key',
      'HMAC-SHA-256 key for audit_event hash-chain (see migration 0009).'
    );
    raise notice 'Seeded audit_hmac_key in vault.';
  else
    raise notice 'audit_hmac_key already present in vault — skipping.';
  end if;
exception
  when undefined_table or undefined_function or invalid_schema_name then
    -- vault extension is not installed (very minimal local stack).
    -- The dev-mode all-zero fallback in 0009 will be used and warn loudly.
    raise warning
      'vault schema/extension not available; audit_hmac_key not seeded. '
      'Production MUST seed the secret before the first audit_event INSERT.';
end$$;
