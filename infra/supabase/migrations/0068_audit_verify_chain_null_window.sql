-- WEG-Verwaltung migration 0068: NULL-sicheres Forward-Fenster der Kettenpruefung.
--
-- Symptom:
--   public.audit_verify_chain() meldete fuer eine nachweislich ungebrochene
--   Kette `status = warning`, `rows_checked = 0`, `seq_from = NULL` und den
--   Text "Keine Audit-Zeilen im verifizierbaren Forward-Fenster gefunden".
--   Am 2026-09-22 lokal gegen Stand 0067 reproduziert: zwei Audit-Zeilen
--   vorhanden, `audit_writer.verify_chain_repaired()` meldete 0 Bruchstellen,
--   die oeffentliche Funktion trotzdem eine Warnung.
--
-- Ursache:
--   0045 zaehlte das Fenster mit
--       (c.valid_after_seq is null or ae.seq > c.valid_after_seq)
--   0050 hat die Funktion neu gebaut und dabei den NULL-Zweig verloren:
--       (not v_checkpoint_found or ae.seq > v_valid_after_seq)
--
--   Der Reparatur-Checkpoint aus 0045 wird faul angelegt und traegt dabei
--   valid_after_seq = NULL — die dokumentierte Bedeutung ist "ab der
--   Genesis-Zeile dieses Mandanten gueltig", also alle Zeilen. Genau in diesem
--   Normalfall ergibt `ae.seq > NULL` aber NULL statt TRUE, `false or NULL` ist
--   NULL, und die Zeile faellt aus dem Fenster. Jede Zeile.
--
--   Dieselbe Falle wie in 0064: ein Vergleich gegen NULL ergibt NULL, nicht
--   FALSE, und die umgebende Bedingung kippt still.
--
-- Auswirkung:
--   Die Funktion konnte `intact` NIE melden. Echte Bruchstellen erkannte sie
--   weiterhin, denn der Zaehler dafuer laeuft ueber
--   audit_writer.verify_chain_repaired() und ist nicht betroffen — aber sie
--   hat Unversehrtheit nie bestaetigt. Eine naechtliche Pruefung, die auf
--   `intact` wartet, waere dauerhaft rot gewesen; eine, die nur `error`
--   ausschliesst, dauerhaft gruen ohne Aussage. In der Audit-Konsole stand
--   "Geprueft: 0" neben einer intakten Kette.
--
-- Zweck:
--   Den NULL-Zweig wiederherstellen und das gemessene Fenster in eine eigene
--   Variable schreiben, damit die Checkpoint-Grenze nicht von ihrer eigenen
--   Auswertung ueberschrieben wird.
--
-- Betroffene Tabellen:
--   keine. Nur public.audit_verify_chain() wird ersetzt.
--
-- RLS-Auswirkung:
--   keine. Die Funktion bleibt SECURITY DEFINER mit unveraenderten Grants und
--   unveraendertem Rollen-Guard (tenant_admin).
--
-- Teststrategie:
--   infra/supabase/tests/0068_audit_verify_chain_window.sql — sechs
--   Zusicherungen, vor dieser Migration 4 davon rot. Der Vertrag legt die
--   Fixture an, erzwingt den faulen Checkpoint ueber einen ersten Aufruf und
--   prueft den zweiten.
--
-- Rollback / Forward-Fix:
--   Rueckwaerts durch erneutes Anwenden des Funktionskoerpers aus 0050.
--   Vorwaerts-Fix bevorzugt: die Funktion wird ersetzt, nicht veraendert.

create or replace function public.audit_verify_chain()
returns table (
  id uuid,
  status text,
  checked_at timestamptz,
  checked_by uuid,
  seq_from bigint,
  seq_to bigint,
  rows_checked int,
  checkpoint jsonb,
  first_failure jsonb,
  error_message text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_tenant_id uuid;
  v_checked_by uuid;
  v_valid_after_seq bigint;
  v_valid_after_created_at timestamptz;
  v_valid_after_event_id uuid;
  v_repaired_at timestamptz;
  v_valid_after_row_hash text;
  v_checkpoint_found boolean := false;
  v_checkpoint_json jsonb := '{}'::jsonb;
  v_seq_from bigint;
  v_seq_to bigint;
  v_rows_checked int;
  v_failure jsonb;
  v_status text;
  v_error text;
  v_inserted_id uuid;
  v_uid_text text;
  v_failure_count int := 0;
begin
  v_tenant_id := public.tenant_id();
  v_uid_text := coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  );

  begin
    v_checked_by := v_uid_text::uuid;
  exception when others then
    v_checked_by := null;
  end;

  if v_tenant_id is null or not public.has_role('tenant_admin') then
    raise exception 'Nicht autorisiert.'
      using errcode = '42501';
  end if;

  begin
    if to_regclass('audit_writer.audit_chain_repair_checkpoint') is not null then
      select
        c.valid_after_seq,
        c.valid_after_created_at,
        c.valid_after_event_id,
        c.repaired_at,
        encode(c.valid_after_row_hash, 'hex') as valid_after_row_hash
        into
          v_valid_after_seq,
          v_valid_after_created_at,
          v_valid_after_event_id,
          v_repaired_at,
          v_valid_after_row_hash
        from audit_writer.audit_chain_repair_checkpoint as c
       where c.tenant_id = v_tenant_id;

      v_checkpoint_found := found;
      if v_checkpoint_found then
        v_checkpoint_json := jsonb_build_object(
          'valid_after_seq', v_valid_after_seq,
          'valid_after_created_at', v_valid_after_created_at,
          'valid_after_event_id', v_valid_after_event_id,
          'repaired_at', v_repaired_at,
          'valid_after_row_hash', v_valid_after_row_hash
        );
      end if;
    end if;

    -- Der NULL-Zweig ist der Kern dieser Migration. `valid_after_seq = NULL`
    -- bedeutet laut 0045 "ab der Genesis-Zeile gueltig", also ALLE Zeilen.
    -- Ohne diesen Zweig ergibt `ae.seq > NULL` den Wert NULL, `false or NULL`
    -- ist ebenfalls NULL, und jede Zeile faellt aus dem Fenster.
    --
    -- Das Ergebnis geht ausserdem in v_seq_from statt in v_valid_after_seq:
    -- die Checkpoint-Grenze darf von ihrer eigenen Auswertung nicht
    -- ueberschrieben werden.
    select min(ae.seq), max(ae.seq), count(*)::int
      into v_seq_from, v_seq_to, v_rows_checked
      from public.audit_event as ae
     where ae.tenant_id = v_tenant_id
       and (
         not v_checkpoint_found
         or v_valid_after_seq is null
         or ae.seq > v_valid_after_seq
       );

    if to_regprocedure('audit_writer.verify_chain_repaired(uuid)') is not null then
      execute
        'select count(*)::int, (jsonb_agg(to_jsonb(r) order by r.broken_seq) -> 0)
           from audit_writer.verify_chain_repaired($1) as r'
        into v_failure_count, v_failure
        using v_tenant_id;
    elsif to_regprocedure('audit_writer.verify_chain(uuid)') is not null then
      execute
        'select count(*)::int, (jsonb_agg(to_jsonb(r) order by r.broken_seq) -> 0)
           from audit_writer.verify_chain($1) as r'
        into v_failure_count, v_failure
        using v_tenant_id;
    else
      raise exception 'No reachable audit_writer verify_chain function exists.'
        using errcode = '42883';
    end if;

    if v_failure_count > 0 then
      v_status := 'error';
      v_error := 'Audit-Hashkette meldet mindestens eine Bruchstelle.';
    elsif not v_checkpoint_found and coalesce(v_rows_checked, 0) > 0 then
      v_status := 'warning';
      v_error := 'Kein Audit-Checkpoint für diesen Mandanten gefunden.';
    elsif coalesce(v_rows_checked, 0) = 0 then
      v_status := 'warning';
      v_error := 'Keine Audit-Zeilen im verifizierbaren Forward-Fenster gefunden.';
    else
      v_status := 'intact';
      v_error := null;
    end if;
  exception
    when others then
      v_status := 'error';
      v_failure := null;
      v_error := sqlstate || ': ' || sqlerrm;
  end;

  perform set_config('app.audit_integrity_writer', 'verify_chain', true);
  perform set_config('app.audit_integrity_tenant_id', v_tenant_id::text, true);

  insert into public.audit_integrity_check (
    tenant_id,
    checked_by,
    status,
    seq_from,
    seq_to,
    rows_checked,
    checkpoint,
    first_failure,
    error_message
  ) values (
    v_tenant_id,
    v_checked_by,
    v_status,
    v_seq_from,
    v_seq_to,
    coalesce(v_rows_checked, 0),
    v_checkpoint_json,
    v_failure,
    v_error
  )
  returning public.audit_integrity_check.id into v_inserted_id;

  perform set_config('app.audit_integrity_writer', '', true);
  perform set_config('app.audit_integrity_tenant_id', '', true);

  return query
  select
    c.id,
    c.status,
    c.checked_at,
    c.checked_by,
    c.seq_from,
    c.seq_to,
    c.rows_checked,
    c.checkpoint,
    c.first_failure,
    c.error_message
  from public.audit_integrity_check as c
  where c.id = v_inserted_id;
end;
$$;

alter function public.audit_verify_chain() owner to postgres;
revoke all on function public.audit_verify_chain() from public;
grant execute on function public.audit_verify_chain() to authenticated;
grant execute on function public.audit_verify_chain() to service_role;

comment on function public.audit_verify_chain() is
  'Prueft die Audit-Hashkette des aufrufenden Mandanten und schreibt das '
  'Ergebnis nach public.audit_integrity_check. Seit 0068 NULL-sicher: ein '
  'Checkpoint mit valid_after_seq = NULL schliesst alle Zeilen ein, statt sie '
  'alle auszuschliessen.';
