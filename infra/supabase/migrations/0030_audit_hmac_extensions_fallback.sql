-- WEG-Verwaltung migration 0030: Fallback wenn audit_writer auch
-- die extensions-Schema nicht erreichen kann.
--
-- 0029 hat den vault-Crash gefixt — danach kam der nächste:
-- `permission denied for schema extensions`. `extensions.hmac()` (aus
-- pgcrypto in 0024 ins extensions-Schema verschoben) ist auf hosted
-- Supabase ebenfalls hinter Permissions, die der Migration-Runner
-- nicht zu audit_writer granten kann.
--
-- Strategie: wenn extensions.hmac unreachable, degradiere auf
-- pg_catalog.sha256(payload-bytes) — also kein keyed HMAC mehr, sondern
-- nur noch unkeyed SHA-256 als Chain-Link. Sicherheits-Niveau sinkt
-- (kein Forge-Schutz gegen Innentäter mit DB-Zugriff), Funktionalität
-- bleibt. Der Warn-Log ist die Anomalie-Anzeige bis vault + extensions
-- per supabase-support oder über die Studio-UI geöffnet sind.

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
    select decoded_secret
      into v_key_hex
      from vault.decrypted_secrets
     where name = 'audit_hmac_key'
     limit 1;
  exception
    when insufficient_privilege or invalid_schema_name or undefined_table then
      raise warning
        'audit_writer.hash_audit_row: vault unreachable (% — %) — '
        'falling back to unkeyed sha256. DO NOT SHIP TO PROD.',
        sqlstate, sqlerrm;
      v_key_hex := null;
  end;

  if v_key_hex is null then
    v_key := decode('0000000000000000000000000000000000000000000000000000000000000000', 'hex');
  else
    v_key := decode(v_key_hex, 'hex');
  end if;

  v_input := prev_hash || convert_to(payload::text, 'UTF8');

  -- Versuche keyed HMAC; bei fehlendem Zugriff auf extensions-Schema
  -- (hosted Supabase) fall zurück auf pg_catalog.sha256 unkeyed.
  begin
    return extensions.hmac(v_input, v_key, 'sha256');
  exception
    when insufficient_privilege or undefined_function or invalid_schema_name then
      raise warning
        'audit_writer.hash_audit_row: extensions.hmac unreachable (% — %) — '
        'falling back to unkeyed sha256. DO NOT SHIP TO PROD.',
        sqlstate, sqlerrm;
      return pg_catalog.sha256(v_input);
  end;
end;
$$;

alter function audit_writer.hash_audit_row(bytea, jsonb) owner to audit_writer;
