-- WEG-Verwaltung migration 0029: harten Crash beheben wenn audit_writer
-- die Vault auf hosted-Supabase nicht lesen kann.
--
-- Hintergrund: 0009 setzt `audit_writer.hash_audit_row()` SECURITY DEFINER
-- als audit_writer und liest dort `vault.decrypted_secrets`. Auf hosted
-- Supabase ist das `vault`-Schema im Besitz von `supabase_admin`; der
-- Migration-Runner `postgres` kann nicht `grant usage on schema vault to
-- audit_writer` ausführen. Folge: jeder INSERT in audit_event (jetzt durch
-- 0026/0028-Trigger ausgelöst) crashed mit SQLSTATE 42501 ("permission
-- denied for schema vault"), und der Crash kaskadiert in den ursprünglichen
-- Business-INSERT (weg/meeting/…) zurück.
--
-- Lösung: das SELECT auf vault.decrypted_secrets in einen BEGIN…EXCEPTION-
-- Block wrappen. Bei `insufficient_privilege` (42501) oder `invalid_schema_
-- name` (3F000) fallen wir auf den dokumentierten All-Zero-Key-Fallback
-- zurück, der die 0009-Header-Doku als "Dev-Mode safety net" bereits
-- vorsieht. Der Warn-Pfad bleibt erhalten — produktive Härtung braucht
-- echte Vault-Permissions, aber die kann nur der Projekt-Eigner setzen.
--
-- Sicherheits-Hinweis: solange der Fallback greift, ist die HMAC-Kette
-- mit dem statischen All-Zero-Key gesichert — gegen Innentäter mit
-- DB-Schreibzugriff bietet das KEINEN Forge-Schutz. Vor Produktion MUSS
-- vault.decrypted_secrets für audit_writer lesbar gemacht und der
-- All-Zero-Key durch echten Key ersetzt werden.

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
        'falling back to all-zero key. DO NOT SHIP TO PROD.',
        sqlstate, sqlerrm;
      v_key_hex := null;
  end;

  if v_key_hex is null then
    raise warning
      'audit_writer.hash_audit_row: audit_hmac_key not present in vault — '
      'falling back to all-zero key. DO NOT SHIP TO PROD.';
    v_key := decode('0000000000000000000000000000000000000000000000000000000000000000', 'hex');
  else
    v_key := decode(v_key_hex, 'hex');
  end if;

  return extensions.hmac(prev_hash || convert_to(payload::text, 'UTF8'), v_key, 'sha256');
end;
$$;

alter function audit_writer.hash_audit_row(bytea, jsonb) owner to audit_writer;
