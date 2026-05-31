-- WEG-Verwaltung migration 0026: AFTER-INSERT/UPDATE/DELETE-Trigger
-- auf den Business-Tabellen, die unverletzliche Audit-Events erzeugen.
-- See docs/03-security-model.md § 3.5 und docs/06-workflows-and-risks.md.
--
-- Architektur (gem. § 3.5 "3-Schicht-Schutz"):
--   • Schicht 1 (existiert): REVOKE update/delete/truncate auf audit_event
--   • Schicht 2 (existiert): RAISE-EXCEPTION-Trigger blockt Mutation
--     auch für service_role (0006).
--   • Schicht 3 (existiert): RLS in 0008 — nur INSERT + SELECT-Policies.
--   • HMAC-Hash-Chain (existiert): 0009 setzt prev_hash + row_hash per
--     BEFORE-INSERT-Trigger via Vault-Key.
--
-- Bis 0025 fehlte die letzte Kette: kein Code emittierte Events. Diese
-- Migration schließt das. Der Emit-Trigger läuft als SECURITY DEFINER
-- audit_writer, kann also auch dann INSERTen wenn der auslösende
-- authenticated-User keine direkte Grant auf audit_event hat. Die
-- HMAC-Kette aus 0009 läuft danach automatisch.
--
-- Actor-Identität:
--   • actor_type = current_setting('app.actor_type', true) — wird vom
--     PostgREST-pre_request-Hook aus 0013 aus dem X-Actor-Type-Header
--     gesetzt. Wenn nicht gesetzt (kein Header) → 'user'. Web-Server-
--     Actions setzen keinen Header → Default 'user'. Der FastAPI-Agent
--     setzt 'agent', so dass Agent-Schreibversuche im Log nachvollzieh-
--     bar werden, bevor sie vom 0011-Guard blockiert werden.
--   • actor_user_id = auth.uid() — kann null sein wenn von System/Cron.
--   • db_role wird vom 0009-BEFORE-Trigger gefüllt (session_user).
--
-- Tabellen:
--   weg, meeting, agenda_item, resolution, vote, beschluss_sammlung_entry
--   — alle versammlungs-relevanten Aggregate aus Section 1.
--   ownership + unit + person sind absichtlich noch nicht instrumentiert
--   (Person-Daten DSGVO-sensibel; eigenes Ticket).
--
-- ---------------------------------------------------------------------------

set search_path = pg_catalog, public;

-- ---------------------------------------------------------------------------
-- audit_writer.tg_emit_audit_event() — generischer Row-Level-Emitter
-- ---------------------------------------------------------------------------

create or replace function audit_writer.tg_emit_audit_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_type text;
  v_actor_user uuid;
  v_payload    jsonb;
  v_entity_id  uuid;
  v_tenant     uuid;
begin
  -- Header-gesetzter Actor (pgrst-pre_request-Hook, 0013). Default 'user'
  -- für Web-Server-Actions ohne X-Actor-Type-Header.
  v_actor_type := coalesce(
    nullif(current_setting('app.actor_type', true), ''),
    'user'
  );

  -- App-Identität via Supabase-Auth. Null erlaubt für System/Cron.
  v_actor_user := auth.uid();

  if tg_op in ('INSERT', 'UPDATE') then
    v_payload   := to_jsonb(new);
    v_entity_id := new.id;
    v_tenant    := new.tenant_id;
  else  -- DELETE
    v_payload   := to_jsonb(old);
    v_entity_id := old.id;
    v_tenant    := old.tenant_id;
  end if;

  -- Defensiv: ohne tenant_id kein Audit-Eintrag. Sollte für Business-
  -- Tables nie greifen (tenant_id ist NOT NULL), aber wir behandeln den
  -- Fall sauber statt mit NOT-NULL-Crash.
  if v_tenant is null then
    return null;
  end if;

  insert into public.audit_event (
    tenant_id,
    actor_type,
    actor_user_id,
    entity_typ,
    entity_id,
    action,
    payload
  ) values (
    v_tenant,
    v_actor_type,
    v_actor_user,
    tg_table_name,
    v_entity_id,
    lower(tg_op),
    v_payload
  );

  -- AFTER-Trigger: return-value wird ignoriert; null OK.
  return null;
end;
$$;

alter function audit_writer.tg_emit_audit_event() owner to audit_writer;

revoke all on function audit_writer.tg_emit_audit_event() from public;
grant execute on function audit_writer.tg_emit_audit_event() to audit_writer;

comment on function audit_writer.tg_emit_audit_event() is
  'Row-Level AFTER-Emit. § 3.5 HMAC-Kette in 0009 hängt darauf.';

-- ---------------------------------------------------------------------------
-- Trigger-Anhang an die Business-Tabellen
-- ---------------------------------------------------------------------------
-- DROP IF EXISTS + CREATE damit die Migration idempotent re-applybar
-- ist (z.B. nach Schema-Reset).

drop trigger if exists weg_audit_emit on public.weg;
create trigger weg_audit_emit
  after insert or update or delete on public.weg
  for each row execute function audit_writer.tg_emit_audit_event();

drop trigger if exists meeting_audit_emit on public.meeting;
create trigger meeting_audit_emit
  after insert or update or delete on public.meeting
  for each row execute function audit_writer.tg_emit_audit_event();

drop trigger if exists agenda_item_audit_emit on public.agenda_item;
create trigger agenda_item_audit_emit
  after insert or update or delete on public.agenda_item
  for each row execute function audit_writer.tg_emit_audit_event();

drop trigger if exists resolution_audit_emit on public.resolution;
create trigger resolution_audit_emit
  after insert or update or delete on public.resolution
  for each row execute function audit_writer.tg_emit_audit_event();

drop trigger if exists vote_audit_emit on public.vote;
create trigger vote_audit_emit
  after insert or update or delete on public.vote
  for each row execute function audit_writer.tg_emit_audit_event();

drop trigger if exists beschluss_sammlung_entry_audit_emit
  on public.beschluss_sammlung_entry;
create trigger beschluss_sammlung_entry_audit_emit
  after insert or update or delete on public.beschluss_sammlung_entry
  for each row execute function audit_writer.tg_emit_audit_event();
