-- WEG-Verwaltung migration 0072: Soft-Delete als gepruefte RPC, Tenant-Abgleich
-- in aufbewahrung_effektiv.
--
-- Zweck:
--   Zwei Befunde aus dem Branch-Review der Dokumentenablage (0069-0071)
--   schliessen. Der erste macht das Entfernen eines Dokuments heute
--   unmoeglich, der zweite bricht eine Zusicherung, die 0071 ausdruecklich
--   dokumentiert.
--
-- ---------------------------------------------------------------------------
-- Befund 1 (kritisch): der Soft-Delete ist strukturell unmoeglich
-- ---------------------------------------------------------------------------
--
-- 0015 gibt public.document diese SELECT-Policy (0015, Zeilen 192-194):
--
--     using (tenant_id = (select public.tenant_id()) and deleted_at is null)
--
-- PostgreSQL verlangt, dass die NEUE Zeile eines UPDATE unter der
-- SELECT-Policy sichtbar bleibt. Genau das bricht der Soft-Delete: sobald
-- deleted_at gesetzt ist, faellt die Zeile aus ihrer eigenen Sichtbarkeit.
-- Das UPDATE wird abgelehnt:
--
--     ERROR:  new row violates row-level security policy for table "document"
--
-- Gemessen gegen die lokale ephemere Datenbank, als "authenticated", gegen
-- die echte Tabelle — ohne RETURNING. Das RETURNING ist NICHT die Ursache;
-- die Pruefung greift unabhaengig davon. Betroffen sind deshalb BEIDE
-- Schreibpfade der Anwendung:
--   - loescheDokumentAction (actions.ts) — mit .select("id")
--   - die Upload-Kompensation in uploadDokumentAction — ohne RETURNING
--
-- Die Entscheidung (vom Nutzer ausdruecklich freigegeben, inklusive dieser
-- neuen SECURITY-DEFINER-Oberflaeche): die SELECT-Policy bleibt exakt wie
-- sie ist. Die Datenbank garantiert weiterhin selbst, dass ein entferntes
-- Dokument unsichtbar ist — diese Garantie wandert NICHT in
-- Anwendungscode. Stattdessen faehrt der Soft-Delete ueber eine eng
-- geschnittene SECURITY-DEFINER-Funktion.
--
-- Warum SECURITY DEFINER hier vertretbar ist, obwohl 0069 und 0071 genau
-- das vermieden haben: dort ging es um eine LESENDE Sicht, fuer die RLS
-- allein ausreichte und ein tenant_id-Parameter eine Missbrauchsflaeche
-- geoeffnet haette. Hier ist RLS nicht "ausreichend, aber umstaendlich",
-- sondern ein hartes Hindernis — der Schreibpfad existiert sonst gar
-- nicht. Die Funktion nimmt deshalb auch KEINEN tenant_id-Parameter
-- entgegen: sie ermittelt den Mandanten selbst ueber public.tenant_id()
-- und gleicht ihn explizit ab. Ein Aufrufer kann mit einer fremden
-- dokument_id nichts erreichen.
--
-- Agent-Sperre: public.document traegt KEINEN
-- *_block_agent_writes-Trigger. 0069 haengt einen an
-- public.aufbewahrungsregel (dort Zeilen 154-158,
-- public.tg_finance_allocation_block_agent_writes), an public.document
-- dagegen nur den Audit-Emitter. Ein Suchlauf ueber alle Migrationen nach
-- "trigger ... on public.document" findet ausschliesslich
-- document_audit_emit (0069, Zeile 172). Die bestehende Sperre deckt
-- diesen Pfad also NICHT ab, und die Funktion braucht ihren eigenen
-- Guard — nach demselben Muster wie public.activate_wirtschaftsplan
-- (0047) ihn traegt.
--
-- Audit: public.document traegt seit 0069 den Standard-Emitter
-- (document_audit_emit, AFTER INSERT OR UPDATE OR DELETE). Der
-- Soft-Delete ist ein UPDATE und loest ihn deshalb unveraendert aus — die
-- Funktion braucht keinen eigenen Audit-Schreibpfad. Zugesichert in
-- infra/supabase/tests/0069_dokumentenablage.sql (Abschnitt 9): nach dem
-- Aufruf existiert genau eine audit_event-Zeile mit entity_typ =
-- 'document', action = 'update' und payload->>'deleted_at' is not null.
--
-- ---------------------------------------------------------------------------
-- Befund 2 (wichtig): fehlendes Tenant-Praedikat in aufbewahrung_effektiv
-- ---------------------------------------------------------------------------
--
-- 0071 joint aufbewahrungsregel ohne Tenant-Abgleich (0071, Zeilen 134-139)
-- und begruendet das im Kommentar darunter (0071, Zeilen 140-148) damit,
-- dass die security_invoker-Sicht FORCE RLS auf aufbewahrungsregel
-- vorschaltet. **Diese Begruendung gilt nur fuer "authenticated".** Fuer
-- einen Aufrufer mit BYPASSRLS gilt sie nicht: haben zwei Mandanten je eine
-- Regel fuer denselben doc_typ, faechert der Join auf und die Sicht liefert
-- ZWEI Zeilen fuer diese Dokumentart — beide mit der tenant_id des
-- Aufrufers gestempelt (public.tenant_id() ist eine Session-Konstante),
-- aber mit unterschiedlichem jahre und herkunft.
--
-- Gemessen gegen die lokale ephemere Datenbank als "postgres": acht statt
-- sieben Zeilen, darunter zweimal 'korrespondenz' mit gleicher tenant_id
-- und verschiedenen Werten. Damit ist die Zusicherung falsch, die 0071 in
-- dokument_uebersicht dokumentiert (0071, Zeilen 191-193: "genau eine Zeile
-- je (tenant_id, doc_typ)-Paar", "der Join ist also faktisch 1:1, kein
-- Kreuzprodukt") — und pgTAP-Zusicherung 7 in
-- infra/supabase/tests/0071_aufbewahrung_effektiv.sql laeuft als genau ein
-- solcher Aufrufer.
--
-- Fix: der Tenant-Abgleich kommt explizit in den Join. Der Kommentar aus
-- 0071 ist damit gegenstandslos und wird hier durch den zutreffenden
-- ersetzt — Vorwaerts-Fix, 0071 bleibt als Historie unveraendert.
--
-- ---------------------------------------------------------------------------
--
-- Betroffene Tabellen:
--   public.document (nur lesend/schreibend durch die neue Funktion, kein
--   DDL), public.aufbewahrung_effektiv (Sicht neu definiert). Keine neue
--   Tabelle, keine neue Spalte.
--
-- RLS-Auswirkung:
--   KEINE Policy wird geaendert, hinzugefuegt oder entfernt — insbesondere
--   nicht document_select_own_tenant. Die Mandantentrennung im neuen
--   Schreibpfad kommt nicht mehr aus RLS (die Funktion laeuft als Owner mit
--   BYPASSRLS), sondern aus dem expliziten "tenant_id = v_tenant_id" in der
--   WHERE-Klausel. Das ist die tragende Zeile dieser Migration und
--   entsprechend zugesichert. Die Sicht bleibt security_invoker; der neue
--   Tenant-Abgleich im Join ist eine zusaetzliche Verteidigungslinie
--   OBEN AUF der RLS von aufbewahrungsregel, kein Ersatz dafuer.
--
-- Teststrategie:
--   infra/supabase/tests/0069_dokumentenablage.sql (12 -> 26 Zusicherungen:
--   Agent-Sperre und Audit-Emitter auf aufbewahrungsregel/document, die 0069
--   zwar im Scope nannte aber nie zusicherte, plus der komplette Vertrag der
--   neuen RPC) und infra/supabase/tests/0071_aufbewahrung_effektiv.sql
--   (13 -> 15 Zusicherungen: die Auffaecherung unter BYPASSRLS).
--
-- Rollback / Forward-Fix:
--   Vorwaerts-Fix bevorzugt. Ein Rueckbau muesste public.dokument_entfernen
--   droppen (und haette damit wieder keinen funktionierenden Soft-Delete)
--   und aufbewahrung_effektiv auf die Fassung aus 0071 zuruecksetzen.

-- ---------------------------------------------------------------------------
-- 1. Der Soft-Delete als gepruefte RPC
-- ---------------------------------------------------------------------------

create or replace function public.dokument_entfernen(
  p_dokument_id uuid,
  p_weg_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_treffer   int;
begin
  -- Die KI entfernt keine Unterlagen. public.document traegt keinen
  -- *_block_agent_writes-Trigger (siehe Kopfkommentar), dieser Guard ist
  -- hier also nicht redundant, sondern die einzige Sperre auf diesem Pfad.
  if coalesce(pg_catalog.current_setting('app.actor_type', true), 'user') = 'agent' then
    raise exception 'Agents cannot remove documents.'
      using errcode = '42501';
  end if;

  -- Der Mandant kommt aus den JWT-Claims der aufrufenden Rolle, NIE aus
  -- einem Parameter. Ohne Claim gibt es keinen Mandanten und damit nichts
  -- zu tun — und zwar als Fehler, nicht als stilles "nichts getroffen":
  -- eine fehlende Mandanten-Identitaet ist ein Zugriffsproblem, kein
  -- Suchergebnis.
  v_tenant_id := public.tenant_id();
  if v_tenant_id is null then
    raise exception 'Document not found or access denied.'
      using errcode = '42501';
  end if;

  -- Die tragende Zeile dieser Migration ist "tenant_id = v_tenant_id".
  -- Die Funktion laeuft als Owner (BYPASSRLS), RLS auf public.document
  -- greift hier also NICHT — dieser Abgleich ist die Mandantentrennung,
  -- nicht eine Verdopplung davon. Faellt er weg, kann jeder angemeldete
  -- Nutzer mit einer geratenen ID das Dokument eines fremden Mandanten
  -- entfernen.
  --
  -- "weg_id = p_weg_id" haelt die Einschraenkung der bisherigen Server
  -- Action (.eq("id", ...).eq("weg_id", ...)) aufrecht: eine innerhalb des
  -- eigenen Mandanten geratene Dokument-ID soll nicht ueber die falsche
  -- WEG entfernbar sein.
  --
  -- "deleted_at is null" macht den Aufruf idempotent, ohne ihn
  -- verlogen zu machen: ein bereits entferntes Dokument ist "nichts
  -- getroffen" (false), kein Fehler — und es wird auch nicht ein zweites
  -- Mal mit einem neuen Zeitstempel ueberschrieben. Wiederbeleben kann die
  -- Funktion ohnehin nichts, sie setzt deleted_at nur, nie zurueck.
  update public.document
     set deleted_at = pg_catalog.now(),
         updated_at = pg_catalog.now()
   where tenant_id  = v_tenant_id
     and id         = p_dokument_id
     and weg_id     = p_weg_id
     and deleted_at is null;

  get diagnostics v_treffer = row_count;

  -- Ehrliche Rueckmeldung statt eines stillen Erfolgs. PostgREST meldet
  -- fuer ein UPDATE ohne Treffer keinen Fehler — der bisherige Aufrufer
  -- brauchte deshalb .select("id") und eine Laengenpruefung. Der
  -- Rueckgabewert nimmt ihm das ab: true heisst entfernt, false heisst
  -- nichts getroffen (fremde WEG, geratene ID, schon entfernt).
  return v_treffer > 0;
end;
$$;

revoke all on function public.dokument_entfernen(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.dokument_entfernen(uuid, uuid) to authenticated;

comment on function public.dokument_entfernen(uuid, uuid) is
  'Soft-Delete eines Dokuments. SECURITY DEFINER, weil die SELECT-Policy aus 0015 (deleted_at is null) ein UPDATE, das deleted_at setzt, zwangslaeufig ablehnt — die neue Zeile waere unter der eigenen Policy unsichtbar. Der Mandant kommt aus public.tenant_id(), nie aus einem Parameter, und wird explizit abgeglichen; zusaetzlich muss die weg_id passen. Gibt true zurueck, wenn genau eine Zeile entfernt wurde, sonst false (fremde WEG, unbekannte ID, bereits entfernt) — ein bereits entferntes Dokument ist kein Fehler und wird nicht erneut gestempelt. Agenten sind gesperrt (42501). Der Audit-Eintrag entsteht ueber den bestehenden document_audit_emit-Trigger aus 0069.';

-- ---------------------------------------------------------------------------
-- 2. aufbewahrung_effektiv: der Tenant-Abgleich kommt in den Join
-- ---------------------------------------------------------------------------

-- Ausgabespalten und Semantik unveraendert gegenueber 0071 — nur das
-- Join-Praedikat kommt hinzu. infra/supabase/tests/0069_dokumentenablage.sql
-- und die uebrigen Zusicherungen aus 0071 pruefen weiterhin unveraendert
-- dagegen.
create or replace view public.aufbewahrung_effektiv
with (security_invoker = on) as
select
  t.doc_typ,
  -- Eigene tenant_id-Spalte, obwohl unnest() selbst mandantenlos ist: liest
  -- die JWT-Claims der AUFRUFENDEN Rolle direkt (dieselbe Funktion, die auch
  -- jeder tenant_id-Spaltendefault im Schema nutzt), kein Bezug zu einer
  -- Basistabelle noetig. Erlaubt dokument_uebersicht den expliziten
  -- Tenant-Abgleich (0071, Fix Round 1), statt sich beim Join
  -- ausschliesslich auf die RLS-Durchsetzung von aufbewahrungsregel zu
  -- verlassen.
  public.tenant_id() as tenant_id,
  -- Ob eine Mandantenregel existiert, entscheidet r.id (eine non-nullable
  -- Spalte der gejointen Zeile) — NIEMALS coalesce(r.jahre, ...). Eine
  -- Mandantenregel mit jahre = null bedeutet bewusst "dauerhaft" und muss von
  -- "keine Regel vorhanden" unterscheidbar bleiben; ein coalesce wuerde beide
  -- Faelle verwechseln (dieselbe Falle wie in 0069, siehe dortiger
  -- Kommentar).
  case
    when r.id is not null then r.jahre
    -- Rueckfall: ein konservativer Vorschlag, keine Rechtsauskunft. Wortgleich
    -- mit dem CASE, der bis 0071 in dokument_uebersicht stand (0069):
    --   protokoll/beschluss   dauerhaft (Praxis, nicht AO)
    --   rechnung              8  (§ 147 Abs. 3 Nr. 4 AO, Buchungsbeleg)
    --   korrespondenz         6  (§ 147 Abs. 3, Handels- und Geschaeftsbriefe)
    --   bescheid/vertrag/doku 10 (gegriffen, NICHT aus einer Vorschrift)
    else case t.doc_typ
      when 'protokoll'     then null
      when 'beschluss'     then null
      when 'rechnung'      then 8
      when 'korrespondenz' then 6
      else 10
    end
  end as jahre,
  case
    when r.id is not null then 'mandantenregel'
    else 'gesetzlicher_rueckfall'
  end as herkunft,
  -- Passthrough nur bei einer echten Mandantenregel. Fuer den gesetzlichen
  -- Rueckfall gibt es keine vom Mandanten hinterlegte Rechtsgrundlage oder
  -- Notiz — beides bleibt hier bewusst NULL statt einer erfundenen
  -- Paragraphenangabe (die Rueckfall-Begruendung steht als Kommentar oben,
  -- nicht als vorgetaeuschter Datensatz).
  r.rechtsgrundlage,
  r.notiz
from unnest(array[
  'beschluss', 'protokoll', 'doku',
  'rechnung', 'vertrag', 'bescheid', 'korrespondenz'
]::text[]) as t(doc_typ)
left join public.aufbewahrungsregel as r
  on r.doc_typ = t.doc_typ
 and r.tenant_id = public.tenant_id();
-- Der Tenant-Abgleich im Join ersetzt den Kommentar aus 0071 (Zeilen
-- 140-148), der ihn fuer entbehrlich erklaerte, weil FORCE ROW LEVEL
-- SECURITY auf aufbewahrungsregel die Zeilen schon vor dem Join auf den
-- eigenen Mandanten herunterfiltere. Das stimmt fuer "authenticated" und
-- ist dort weiterhin die erste Verteidigungslinie — aber NICHT fuer einen
-- Aufrufer mit BYPASSRLS (Table-Owner, Service-Role-Client). Fuer den sah
-- aufbewahrungsregel alle Mandanten gleichzeitig, und bei zwei Regeln zum
-- selben doc_typ faecherte der Join auf: zwei Zeilen fuer eine
-- Dokumentart, beide mit der tenant_id des Aufrufers gestempelt, mit
-- verschiedenen jahre/herkunft. Genau das bricht die 1:1-Zusicherung, auf
-- die sich der Join in dokument_uebersicht beruft (0071, Zeilen 191-193).
-- Seit diesem Praedikat gilt sie wieder, und zwar fuer JEDE aufrufende
-- Rolle statt nur fuer die mit greifender RLS. Zugesichert in
-- infra/supabase/tests/0071_aufbewahrung_effektiv.sql, Abschnitt 7.
--
-- public.tenant_id() im Join und public.tenant_id() als Ausgabespalte sind
-- bewusst derselbe Ausdruck: die Zeile, die uebrig bleibt, gehoert damit
-- nachweislich zu dem Mandanten, mit dem die Sicht sich nach aussen
-- stempelt. Ohne Mandanten-Claim ist public.tenant_id() null, der Vergleich
-- damit nie wahr — es bleibt der gesetzliche Rueckfall, nie eine fremde
-- Regel.

comment on view public.aufbewahrung_effektiv is
  'Die tatsaechlich geltende Aufbewahrungsfrist je Dokumentart, fuer alle sieben Arten, auch ohne ein einziges Dokument. tenant_id ist public.tenant_id() der aufrufenden Rolle (keine Basistabelle), fuer den expliziten Tenant-Abgleich in public.dokument_uebersicht. Seit 0072 traegt auch der Join auf public.aufbewahrungsregel diesen Abgleich — ohne ihn faechert die Sicht fuer einen Aufrufer mit BYPASSRLS auf mehr als eine Zeile je Dokumentart auf. security_invoker haelt zusaetzlich die RLS von public.aufbewahrungsregel in Kraft. jahre ist NULL bei dauerhafter Aufbewahrung. herkunft unterscheidet eine Mandantenregel vom gesetzlichen Rueckfall (siehe public.aufbewahrungsregel-Kommentar in 0069). Einzige Stelle, an der der gesetzliche Rueckfall kodiert ist — public.dokument_uebersicht liest ihn von hier.';

grant select on public.aufbewahrung_effektiv to authenticated;
