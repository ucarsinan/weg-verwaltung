-- WEG-Verwaltung migration 0034: fail-closed Vault HMAC for audit_writer.hash_audit_row.
--
-- Hintergrund: Supabase Vault exposes the plaintext secret as
-- `decrypted_secret`. The earlier wrong Vault column reference forced the
-- fallback path even when 0033 successfully granted Vault/extension access.
--
-- Lösung: use the real Vault column and fail closed. Production audit events
-- must never be written with an all-zero key or unkeyed SHA-256.

create or replace function audit_writer.hash_audit_row(prev_hash bytea, payload jsonb)
returns bytea
language plpgsql
immutable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_key bytea;
  v_key_hex text;
  v_input bytea;
begin
  begin
    select decrypted_secret
      into v_key_hex
      from vault.decrypted_secrets
     where name = 'audit_hmac_key'
     limit 1;
  exception
    when others then
      raise exception
        'audit_writer.hash_audit_row: audit_hmac_key is not readable from Vault (% - %). DO NOT SHIP TO PROD.',
        sqlstate, sqlerrm
        using errcode = '42501';
  end;

  if v_key_hex is null then
    raise exception
      'audit_writer.hash_audit_row: audit_hmac_key not present in Vault. DO NOT SHIP TO PROD.'
      using errcode = 'P0002';
  end if;

  v_key := decode(v_key_hex, 'hex');

  v_input := prev_hash || convert_to(payload::text, 'UTF8');

  begin
    return extensions.hmac(v_input, v_key, 'sha256');
  exception
    when others then
      raise exception
        'audit_writer.hash_audit_row: extensions.hmac unavailable (% - %). DO NOT SHIP TO PROD.',
        sqlstate, sqlerrm
        using errcode = '42501';
  end;
end;
$$;

alter function audit_writer.hash_audit_row(bytea, jsonb) owner to audit_writer;
