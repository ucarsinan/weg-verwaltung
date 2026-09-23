-- WEG-Verwaltung migration 0071: Aufbewahrung effektiv — der Rueckfall an einer Stelle.
--
-- Zweck:
--   Die neue Einstellungen-Seite (/einstellungen/aufbewahrung) muss fuer ALLE
--   sieben Dokumentarten zeigen, welche Frist gerade gilt und ob sie aus einer
--   Mandantenregel oder dem gesetzlichen Rueckfall stammt — auch fuer Arten,
--   zu denen noch kein einziges Dokument existiert. public.dokument_uebersicht
--   (0069) kann das nicht leisten: sie hat nur Zeilen fuer tatsaechlich
--   vorhandene Dokumente, eine Dokumentart ohne Beleg taucht dort nie auf.
--
-- Warum eine eigene Sicht statt einer zweiten Kopie des Rueckfalls:
--   0069 haelt den Rueckfall bereits als CASE-Ausdruck in dokument_uebersicht.
--   Eine zweite, unabhaengige Kopie desselben CASE fuer die Einstellungen-Seite
--   waere derselbe Fehler wie eine Kopie in TypeScript: zwei Stellen, die bei
--   der naechsten Gesetzesaenderung synchron bleiben muessten und es
--   irgendwann nicht mehr waeren. Stattdessen: der Rueckfall zieht in eine
--   eigene Sicht um, dokument_uebersicht liest ihn von dort. Nur noch eine
--   Kopie in der gesamten Codebase.
--
-- Warum wieder kein private-Schema, keine Funktion, kein Parameter:
--   Dieselbe Begruendung wie in 0069 (siehe dortiger Kommentarblock). Ein
--   left join auf public.aufbewahrungsregel in einer security_invoker-Sicht
--   braucht kein Schema-Grant, keine SECURITY DEFINER-Funktion und keinen
--   tenant_id-Parameter, der missbraucht werden koennte — RLS auf
--   aufbewahrungsregel erledigt die Mandantentrennung von selbst, auch ohne
--   eine treibende Tabelle mit eigener tenant_id-Spalte.
--
-- Fix Round 1 (Review): der explizite Tenant-Abgleich aus 0069 ist zurueck.
--   0069 joinete aufbewahrungsregel mit "r.tenant_id = d.tenant_id and
--   r.doc_typ = d.doc_typ" — ein expliziter Tenant-Abgleich OBEN AUF der RLS,
--   nicht nur die RLS allein. Die erste Fassung dieser Migration liess das
--   weg, weil unnest() keine treibende Tabelle mit eigener tenant_id-Spalte
--   hat: die Mandantentrennung ruhte danach ausschliesslich darauf, dass RLS
--   durch zwei verschachtelte Sichten hindurch weiterhin greift. Das
--   funktioniert (security_invoker propagiert RLS-Durchsetzung durch jede
--   Zwischenschicht), ist aber eine bestehende Verteidigungslinie, die
--   ersatzlos verschwunden waere, ohne dass es jemand bemerkt haette.
--   Deshalb jetzt: aufbewahrung_effektiv traegt public.tenant_id() als eigene
--   tenant_id-Spalte (liest die JWT-Claims der aufrufenden Rolle direkt,
--   keine Basistabelle noetig), und dokument_uebersicht joint explizit
--   sowohl auf doc_typ ALS AUCH auf tenant_id. Bewusst weiterhin ein LEFT
--   JOIN: sollte der Tenant-Abgleich je nicht mehr passen (RLS-Regression an
--   anderer Stelle), muss das Dokument mit einer NULL-Frist in der Sicht
--   auftauchen — es darf nie verschwinden, das waere ein stilles, schwerer
--   zu findendes Datenleck als eine sichtbar fehlende Frist.
--
-- Betroffene Tabellen:
--   public.aufbewahrung_effektiv (neu, view), public.dokument_uebersicht
--   (geaendert: liest den Rueckfall jetzt von dort statt ihn selbst zu
--   berechnen). Keine neue Basistabelle, keine RLS-Aenderung an bestehenden
--   Tabellen.
--
-- RLS-Auswirkung:
--   Keine neue Tabelle, also keine neue RLS-Policy. Die Mandantentrennung
--   kommt weiterhin aus der RLS von public.aufbewahrungsregel, an die
--   aufbewahrung_effektiv per security_invoker gebunden bleibt — der
--   explizite tenant_id-Abgleich beim Join in dokument_uebersicht (siehe Fix
--   Round 1 oben) ist eine zusaetzliche, unabhaengige Verteidigungslinie
--   obendrauf, kein Ersatz dafuer. Ein fremder Mandant sieht fuer jede
--   Dokumentart entweder seine eigene Regel oder den Rueckfall, nie die Regel
--   eines anderen Mandanten (siehe pgTAP-Tests in 0071).
--
-- Teststrategie:
--   infra/supabase/tests/0071_aufbewahrung_effektiv.sql. Die 12 Zusicherungen
--   aus 0069 bleiben unveraendert gueltig — dokument_uebersicht aendert sich
--   an der Oberflaeche nicht, nur ihre interne Herleitung. Zusaetzlich zwei
--   Zusicherungen, die den Tenant-Abgleich ueber BEIDE Sichten hinweg pruefen
--   (zwei Mandanten, derselbe doc_typ, je eine eigene Regel, gelesen ueber
--   dokument_uebersicht — nicht nur ueber aufbewahrung_effektiv direkt).
--
-- Rollback / Forward-Fix:
--   Vorwaerts-Fix bevorzugt. Ein Rueckbau muesste dokument_uebersicht wieder
--   auf den eingebetteten CASE-Ausdruck aus 0069 zuruecksetzen und
--   aufbewahrung_effektiv droppen.

-- ---------------------------------------------------------------------------
-- 1. Die Rueckfall-Sicht — eine Zeile je Dokumentart, immer alle sieben
-- ---------------------------------------------------------------------------

create or replace view public.aufbewahrung_effektiv
with (security_invoker = on) as
select
  t.doc_typ,
  -- Eigene tenant_id-Spalte, obwohl unnest() selbst mandantenlos ist: liest
  -- die JWT-Claims der AUFRUFENDEN Rolle direkt (dieselbe Funktion, die auch
  -- jeder tenant_id-Spaltendefault im Schema nutzt), kein Bezug zu einer
  -- Basistabelle noetig. Erlaubt dokument_uebersicht den expliziten
  -- Tenant-Abgleich aus 0069 wiederherzustellen (Fix Round 1, siehe oben),
  -- statt sich beim Join ausschliesslich auf die RLS-Durchsetzung von
  -- aufbewahrungsregel zu verlassen.
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
  on r.doc_typ = t.doc_typ;
-- Kein "and r.tenant_id = ..." im Join auf aufbewahrungsregel: es gibt keine
-- treibende Tabelle mit eigener tenant_id, gegen die man joinen koennte
-- (unnest() ist mandantenlos). Die security_invoker-Sicht fragt
-- aufbewahrungsregel als aufrufende Rolle ab, FORCE ROW LEVEL SECURITY (0069)
-- filtert die Zeilen dieser Tabelle deshalb schon vor dem Join auf den
-- eigenen Mandanten herunter — fuer jede Dokumentart bleibt entweder die
-- eigene Regelzeile oder gar keine uebrig. Die tenant_id-Spalte OBEN in
-- dieser Sicht (public.tenant_id(), siehe oben) ist der zusaetzliche,
-- explizite Abgleich fuer die naechste Ebene (dokument_uebersicht).

comment on view public.aufbewahrung_effektiv is
  'Die tatsaechlich geltende Aufbewahrungsfrist je Dokumentart, fuer alle sieben Arten, auch ohne ein einziges Dokument. tenant_id ist public.tenant_id() der aufrufenden Rolle (keine Basistabelle), fuer den expliziten Tenant-Abgleich in public.dokument_uebersicht. security_invoker haelt zusaetzlich die RLS von public.aufbewahrungsregel in Kraft. jahre ist NULL bei dauerhafter Aufbewahrung. herkunft unterscheidet eine Mandantenregel vom gesetzlichen Rueckfall (siehe public.aufbewahrungsregel-Kommentar in 0069). Einzige Stelle, an der der gesetzliche Rueckfall kodiert ist — public.dokument_uebersicht liest ihn von hier.';

grant select on public.aufbewahrung_effektiv to authenticated;

-- ---------------------------------------------------------------------------
-- 2. dokument_uebersicht liest den Rueckfall jetzt von aufbewahrung_effektiv
-- ---------------------------------------------------------------------------

-- Ausgabespalten und Semantik unveraendert gegenueber 0069 — nur die Herkunft
-- von jahre/herkunft aendert sich von einem eingebetteten CASE zu einem Join.
-- infra/supabase/tests/0069_dokumentenablage.sql prueft weiterhin unveraendert
-- dagegen.
create or replace view public.dokument_uebersicht
with (security_invoker = on) as
select
  d.tenant_id,
  d.weg_id,
  d.id                as dokument_id,
  d.titel,
  d.doc_typ,
  d.dokument_datum,
  d.created_at,
  d.deleted_at,
  v.version_no,
  v.storage_path,
  v.mime_type,
  v.file_size_bytes,
  -- § 147 Abs. 4 AO: die Frist beginnt zum Schluss des Kalenderjahrs, in dem
  -- das Dokument entstanden ist. ae.jahre is null bedeutet dauerhaft und
  -- propagiert von selbst bis hierher (make_interval(years => null) ist
  -- null, eine Addition mit einem null-Interval ebenfalls — siehe 0069).
  (
    pg_catalog.make_date(pg_catalog.date_part('year', d.dokument_datum)::int, 12, 31)
    + pg_catalog.make_interval(years => ae.jahre)
  )::date            as aufzubewahren_bis,
  ae.herkunft         as frist_herkunft
from public.document as d
left join public.document_version as v
  on v.tenant_id = d.tenant_id
 and v.id = d.current_version_id
-- aufbewahrung_effektiv liefert garantiert genau eine Zeile je (tenant_id,
-- doc_typ)-Paar aus Sicht der aufrufenden Rolle (alle sieben Arten, siehe
-- oben) — der Join ist also faktisch 1:1, kein Kreuzprodukt.
--
-- "and ae.tenant_id = d.tenant_id" ist der explizite Tenant-Abgleich aus
-- 0069 (dort: "r.tenant_id = d.tenant_id and r.doc_typ = d.doc_typ"), wieder
-- hergestellt in Fix Round 1 (siehe Kommentarblock oben) — eine zusaetzliche
-- Verteidigungslinie OBEN AUF der RLS von aufbewahrungsregel, kein Ersatz
-- dafuer. LEFT JOIN bleibt Pflicht: eine RLS-Regression, die den Abgleich
-- scheitern liesse, darf das Dokument nie aus der Sicht verschwinden lassen
-- — nur seine Frist wird dann NULL, sichtbar fehlend statt still falsch.
left join public.aufbewahrung_effektiv as ae
  on ae.doc_typ = d.doc_typ
 and ae.tenant_id = d.tenant_id;

comment on view public.dokument_uebersicht is
  'Dokument mit aktueller Version und abgeleiteter Aufbewahrungsfrist. security_invoker haelt die RLS der Basistabellen (inkl. aufbewahrungsregel, ueber public.aufbewahrung_effektiv) in Kraft, UND der Join traegt seit Fix Round 1 zusaetzlich den expliziten Tenant-Abgleich aus 0069 (ae.tenant_id = d.tenant_id). aufzubewahren_bis ist NULL, wenn dauerhaft aufzubewahren ist. frist_herkunft unterscheidet Mandantenregel von gesetzlichem Rueckfall — seit 0071 uebernommen aus public.aufbewahrung_effektiv, nicht mehr selbst berechnet.';

grant select on public.dokument_uebersicht to authenticated;
