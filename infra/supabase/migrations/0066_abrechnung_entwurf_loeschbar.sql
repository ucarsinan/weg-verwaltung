-- WEG-Verwaltung migration 0066: loeschbarer Abrechnungsentwurf (Kaskade).
--
-- Symptom:
--   `delete from public.abrechnung where ... and status = 'entwurf'` scheitert
--   mit 23514 und der Meldung "Eine beschlossene Abrechnung kann nicht mehr
--   geändert werden." — obwohl die Abrechnung ein Entwurf ist. Lokal gegen eine
--   frische `db reset` bis 0064 reproduziert (psql, Rolle postgres): Tenant,
--   WEG, Einheiten, Verteilungsschluessel und Ausgaben anlegen,
--   public.erstelle_abrechnung() rufen, Entwurf loeschen.
--
-- Root cause:
--   public.tg_abrechnung_kind_draft_only() (0063) ist ein BEFORE
--   INSERT/UPDATE/DELETE-Trigger auf abrechnung_kostenposition und
--   abrechnung_anteil und liest den Status der Kopfzeile. Beide Kind-FKs sind
--   `on delete cascade`. Raeumt der RI-Trigger die Kinder, ist die Kopfzeile
--   bereits geloescht: das `select a.status` liefert keine Zeile, v_status ist
--   NULL, und `NULL is distinct from 'entwurf'` ist TRUE. Der Guard greift also
--   genau dann, wenn er nichts zu schuetzen hat.
--
--   Das ist die Kehrseite derselben NULL-Semantik, die 0048 und 0064 behandelt
--   haben: dort fiel ein Guard mit `<>` faelschlich offen auf, hier faellt einer
--   mit `is distinct from` faelschlich zu.
--
-- Blast radius heute:
--   Ein Abrechnungsentwurf ist nicht mehr loeschbar — weder aus der App noch
--   privilegiert. Ein versehentlich oder mit falschen Ausgaben erzeugter
--   Entwurf bleibt dauerhaft stehen und blockiert ueber die Pruefung in
--   erstelle_abrechnung() (23505, "Für dieses Jahr existiert bereits ein
--   Abrechnungsentwurf") jeden neuen Entwurf desselben Jahres. Die Meldung ist
--   zusaetzlich irrefuehrend: sie behauptet einen Beschluss, den es nicht gibt.
--   Beschlossene Abrechnungen sind nicht betroffen; deren Sperre ist gewollt.
--
-- Fix (zwei Teile, wie in 0065 fuer den Vermoegensbericht):
--   1. Der Positions-Guard behandelt die Kaskade ausdruecklich: fehlt die
--      Kopfzeile bei einem DELETE, ist der Loeschvorgang von oben eingeleitet
--      und wird durchgelassen.
--   2. Damit diese Ausnahme sicher bleibt, entscheidet ein eigener BEFORE
--      DELETE-Trigger auf der Kopftabelle, ob ueberhaupt geloescht werden darf:
--      nur ein Entwurf. Beschlossene und abgeloeste Abrechnungen sind Teil der
--      Beschlusshistorie und werden durch einen Zweitbeschluss korrigiert, nicht
--      entfernt.
--
--   Ohne Teil 2 waere Teil 1 eine Luecke: die Kaskade wuerde die Positionen
--   jeder Abrechnung raeumen, gleich welchen Status die Kopfzeile hatte.
--
-- Risk posture:
--   - Keine Tabellen-, Policy- oder Grant-Aenderung, keine Datenmigration.
--     Eine Funktion wird ersetzt, eine Funktion und ein Trigger kommen hinzu.
--   - Keine Aenderung an Audit-Chain, HMAC, Partitionen oder Append-only-Logik.
--     Der bestehende AFTER-Trigger abrechnung_audit_emit protokolliert das
--     Loeschen eines Entwurfs unveraendert weiter.
--   - Die Ausnahme ist eng: sie greift nur bei DELETE und nur, wenn die
--     Kopfzeile fehlt. Solange sie existiert, liest der Guard einen Status und
--     sperrt wie bisher — auch fuer einzelne Positionen.
--   - Netto verschaerft die Migration die Regeln: die Kopftabelle war bisher
--     gegen DELETE ueberhaupt nicht geschuetzt, eine beschlossene Abrechnung
--     also nur indirekt (und mit falscher Begruendung) haltbar.
--   - Trigger-Reihenfolge ist alphabetisch: abrechnung_block_agent_writes laeuft
--     vor abrechnung_delete_draft_only, der Agent-Guard bleibt vorne.
--   - Idempotentes create-or-replace plus drop/create des Triggers; erneutes
--     Ausfuehren ist ein No-op.
--
-- Test strategy:
--   infra/supabase/tests/0066_abrechnung_entwurf_loeschbar.sql loescht einen
--   Entwurf mit Kostenpositionen und Anteilen real durch die Kaskade und prueft
--   gegen, dass beschlossene und abgeloeste Abrechnungen sowie einzelne
--   Positionen beschlossener Abrechnungen weiterhin 23514 werfen. Eingetragen in
--   FINANCE_DB_TESTS, laeuft also im `just test-db-all`-Gate.
--
-- Rollback / forward fix:
--   Keine Rollback-Migration. Ein Zurueckbauen wuerde den Entwurf erneut
--   einsperren. Sollte sich die Loeschregel fachlich aendern, gehoert das in
--   eine neue Vorwaertsmigration auf tg_abrechnung_delete_draft_only().

-- ---------------------------------------------------------------------------
-- 1. Positions-Guard: Ausnahme fuer die Kaskade
-- ---------------------------------------------------------------------------
-- Unveraendert gegenueber 0063 bis auf den markierten Block.

create or replace function public.tg_abrechnung_kind_draft_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_abrechnung_id uuid;
  v_tenant_id uuid;
  v_status text;
begin
  if tg_table_name = 'abrechnung_kostenposition' then
    v_abrechnung_id := case when tg_op = 'DELETE' then old.abrechnung_id else new.abrechnung_id end;
    v_tenant_id := case when tg_op = 'DELETE' then old.tenant_id else new.tenant_id end;
  else
    select k.abrechnung_id, k.tenant_id
      into v_abrechnung_id, v_tenant_id
      from public.abrechnung_kostenposition k
     where k.tenant_id = case when tg_op = 'DELETE' then old.tenant_id else new.tenant_id end
       and k.id = case when tg_op = 'DELETE' then old.abrechnung_kostenposition_id
                       else new.abrechnung_kostenposition_id end;
  end if;

  select a.status
    into v_status
    from public.abrechnung a
   where a.tenant_id = v_tenant_id
     and a.id = v_abrechnung_id;

  -- Kaskade: beim Loeschen der Abrechnung ist die Kopfzeile schon weg, wenn der
  -- RI-Trigger die Positionen raeumt (und die Position schon weg, wenn er die
  -- Anteile raeumt). Ohne diese Ausnahme waere v_status NULL, `NULL is distinct
  -- from 'entwurf'` TRUE — und der Guard wuerde das Loeschen eines Entwurfs mit
  -- der Begruendung verhindern, die Abrechnung sei beschlossen. Sicher ist die
  -- Ausnahme, weil eine beschlossene oder abgeloeste Abrechnung gar nicht erst
  -- geloescht werden darf (tg_abrechnung_delete_draft_only).
  if v_status is null and tg_op = 'DELETE' then
    return old;
  end if;

  if v_status is distinct from 'entwurf' then
    raise exception 'Eine beschlossene Abrechnung kann nicht mehr geändert werden. Für Korrekturen einen Zweitbeschluss anlegen.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.tg_abrechnung_kind_draft_only()
  from public, anon, authenticated, service_role;

comment on function public.tg_abrechnung_kind_draft_only() is
  'Positionen und Anteile sind nur im Entwurf aenderbar. Fehlt die Kopfzeile bei einem DELETE, laeuft die Kaskade eines von oben eingeleiteten Loeschvorgangs und wird durchgelassen.';

-- ---------------------------------------------------------------------------
-- 2. Nur ein Entwurf darf geloescht werden
-- ---------------------------------------------------------------------------
--
-- Eine beschlossene Abrechnung traegt einen Beschluss der Eigentuemer; eine
-- abgeloeste ist dessen Vorgeschichte und haengt als vorgaenger_abrechnung_id
-- in der Kette. Korrigiert wird beides durch einen Zweitbeschluss.

create or replace function public.tg_abrechnung_delete_draft_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from 'entwurf' then
    raise exception 'Eine beschlossene Abrechnung kann nicht gelöscht werden. Für Korrekturen einen Zweitbeschluss anlegen.'
      using errcode = '23514';
  end if;

  return old;
end;
$$;

revoke all on function public.tg_abrechnung_delete_draft_only()
  from public, anon, authenticated, service_role;

comment on function public.tg_abrechnung_delete_draft_only() is
  'Laesst nur den Abrechnungsentwurf loeschen. Haelt die Kaskaden-Ausnahme in tg_abrechnung_kind_draft_only() sicher.';

drop trigger if exists abrechnung_delete_draft_only on public.abrechnung;
create trigger abrechnung_delete_draft_only
  before delete on public.abrechnung
  for each row execute function public.tg_abrechnung_delete_draft_only();

notify pgrst, 'reload schema';
