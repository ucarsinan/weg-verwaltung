-- WEG-Verwaltung migration 0069: Dokumentenablage und Aufbewahrungsfristen.
--
-- Zweck:
--   Das Datenmodell aus 0015 bekommt die Felder, die eine Ablage braucht, und
--   eine bearbeitbare Regel fuer die Aufbewahrungsfrist.
--
-- Warum die Frist nicht im Code steht:
--   Die Frist fuer Buchungsbelege sank von zehn auf acht Jahre, und zwar auch
--   fuer Belege, deren Frist noch lief. Eine Konstante haette eine Migration
--   ueber den gesamten Bestand verlangt. Deshalb: Regel als Daten je Mandant,
--   Frist abgeleitet in einer Sicht.
--
-- Warum ein eigenes Dokumentdatum:
--   § 147 Abs. 4 AO laesst die Frist mit dem Schluss des Kalenderjahrs
--   beginnen, in dem der Beleg entstanden ist — nicht mit dem Hochladen. Eine
--   2019er Rechnung, heute hochgeladen, waere sonst bis 2034 statt bis 2027
--   aufzubewahren. Beim Uebernehmen eines Altbestands ist das der Normalfall.
--
-- Was die Frist NICHT tut:
--   Sie ist eine Anzeige. Nichts wird nach Ablauf geloescht, archiviert oder
--   freigegeben. Die Verwaltungsunterlagen gehoeren der WEG; der Verwalter
--   verwahrt sie treuhaenderisch und gibt sie heraus, statt sie zu entsorgen.
--   0015 bildet das bereits ab (Soft-Delete, Hard-Delete mangels Policy
--   blockiert) — daran aendert diese Migration nichts.
--
-- Betroffene Tabellen:
--   public.document (CHECK erweitert, Spalte ergaenzt, Audit-Emitter),
--   public.aufbewahrungsregel (neu).
--
-- RLS-Auswirkung:
--   Neue Tabelle mit RLS und FORCE RLS und vier Policies nach dem Muster der
--   uebrigen Fachtabellen. Die Sicht ist security_invoker, die RLS der
--   Basistabellen bleibt also in Kraft.
--
-- Nebenbefund aus dem Entwurf: kein privates Schema-Grant fuer eine Sicht.
--   Ein frueherer Entwurf las die Regel ueber eine SECURITY-DEFINER-Funktion
--   in Schema "private" (cross join lateral). Die Sicht ist aber
--   security_invoker — dafuer haette die aufrufende Rolle USAGE auf dem
--   Schema UND EXECUTE auf der Funktion gebraucht. "private" ist in 0039,
--   0042 (expliziter Security-Hotfix) und 0047 bewusst dicht: ein
--   schemaweites USAGE-Grant fuer eine einzelne Funktion haette diese
--   Abschottung fuer ALLE privaten Funktionen aufgeweicht und den impliziten
--   Backstop entwertet, der jedes einzelne "revoke" dort erst nicht
--   load-bearing macht. Dazu kam ein zweites Problem: die Funktion nahm
--   tenant_id als Parameter entgegen, ein direkter Aufruf an der Sicht
--   vorbei haette mit einer fremden tenant_id fremde Regeln ausgelesen.
--   Loesung: keine Funktion, keine Grants, keine SECURITY DEFINER — die
--   Mandantenregel wird direkt per LEFT JOIN in die Sicht eingebettet.
--   security_invoker sorgt dafuer, dass RLS auf aufbewahrungsregel die
--   Mandantentrennung selbst durchsetzt, ganz ohne Parameter-Guard.
--
-- Teststrategie:
--   infra/supabase/tests/0069_dokumentenablage.sql, 12 Zusicherungen. Die
--   Fristrechnung wird von Hand nachgerechnet.
--
-- Rollback / Forward-Fix:
--   Vorwaerts-Fix bevorzugt. Ein Rueckbau muesste dokument_datum und die
--   Regeltabelle entfernen; die erweiterten doc_typ-Werte liessen sich nur
--   zuruecknehmen, wenn keine Zeile sie mehr benutzt.

-- ---------------------------------------------------------------------------
-- 1. doc_typ erweitern
-- ---------------------------------------------------------------------------

alter table public.document
  drop constraint if exists document_doc_typ_check;

alter table public.document
  add constraint document_doc_typ_check
  check (doc_typ in (
    'beschluss', 'protokoll', 'doku',
    'rechnung', 'vertrag', 'bescheid', 'korrespondenz'
  ));

comment on column public.document.doc_typ is
  'Dokumentart. Bestimmt ueber public.aufbewahrungsregel bzw. den gesetzlichen Rueckfall die Aufbewahrungsfrist.';

-- ---------------------------------------------------------------------------
-- 2. dokument_datum als Pflichtfeld
-- ---------------------------------------------------------------------------

-- Bestand sind heute ausschliesslich signierte Protokolle; dort ist das
-- Erstellungsdatum zugleich das Dokumentdatum. Erst fuellen, dann verschaerfen.
alter table public.document
  add column if not exists dokument_datum date;

update public.document
   set dokument_datum = created_at::date
 where dokument_datum is null;

alter table public.document
  alter column dokument_datum set not null;

comment on column public.document.dokument_datum is
  'Datum des Dokuments selbst, nicht des Hochladens. Startpunkt der Aufbewahrungsfrist nach § 147 Abs. 4 AO (Schluss des Kalenderjahrs).';

-- ---------------------------------------------------------------------------
-- 3. Die bearbeitbare Regel
-- ---------------------------------------------------------------------------

create table if not exists public.aufbewahrungsregel (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default public.tenant_id()
                   references public.tenant(id) on delete restrict,
  doc_typ          text not null
                   check (doc_typ in (
                     'beschluss', 'protokoll', 'doku',
                     'rechnung', 'vertrag', 'bescheid', 'korrespondenz'
                   )),
  -- NULL bedeutet dauerhaft. Eine 0 waere mehrdeutig ("sofort loeschbar"?)
  -- und ist deshalb ausgeschlossen.
  jahre            int check (jahre is null or jahre between 1 and 100),
  rechtsgrundlage  text,
  notiz            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, doc_typ)
);

comment on table public.aufbewahrungsregel is
  'Aufbewahrungsfrist je Dokumentart, bearbeitbar je Mandant. Fehlt eine Zeile, greift der in public.dokument_uebersicht eingebettete gesetzliche Rueckfall — die Frist ist also nie undefiniert.';

comment on column public.aufbewahrungsregel.jahre is
  'NULL bedeutet dauerhaft aufzubewahren.';

comment on column public.aufbewahrungsregel.rechtsgrundlage is
  'Freitext und bewusst nicht aus einer festen Liste: welche Vorschrift gilt, entscheidet der Verwalter nach eigener Beratung, nicht dieses Produkt.';

alter table public.aufbewahrungsregel enable row level security;
alter table public.aufbewahrungsregel force row level security;
revoke all on public.aufbewahrungsregel
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.aufbewahrungsregel to authenticated;

create policy aufbewahrungsregel_select_own_tenant
  on public.aufbewahrungsregel for select to authenticated
  using (tenant_id = (select public.tenant_id()));

create policy aufbewahrungsregel_insert_own_tenant
  on public.aufbewahrungsregel for insert to authenticated
  with check (tenant_id = (select public.tenant_id()));

create policy aufbewahrungsregel_update_own_tenant
  on public.aufbewahrungsregel for update to authenticated
  using (tenant_id = (select public.tenant_id()))
  with check (tenant_id = (select public.tenant_id()));

create policy aufbewahrungsregel_delete_own_tenant
  on public.aufbewahrungsregel for delete to authenticated
  using (tenant_id = (select public.tenant_id()));

-- Die KI aendert keine Aufbewahrungsfristen.
drop trigger if exists aufbewahrungsregel_block_agent_writes on public.aufbewahrungsregel;
create trigger aufbewahrungsregel_block_agent_writes
  before insert or update or delete on public.aufbewahrungsregel
  for each row
  execute function public.tg_finance_allocation_block_agent_writes();

-- Eine geaenderte Frist ist eine nachweispflichtige Entscheidung.
drop trigger if exists aufbewahrungsregel_audit_emit on public.aufbewahrungsregel;
create trigger aufbewahrungsregel_audit_emit
  after insert or update or delete on public.aufbewahrungsregel
  for each row execute function audit_writer.tg_emit_audit_event();

-- ---------------------------------------------------------------------------
-- 4. Nebenbefund aus dem Entwurf: document war nicht auditiert
-- ---------------------------------------------------------------------------

-- Protokolle und kuenftig Belege sind Beweismittel. Die Beschluss-Sammlung
-- daneben ist append-only UND auditiert; document war es nicht.
drop trigger if exists document_audit_emit on public.document;
create trigger document_audit_emit
  after insert or update or delete on public.document
  for each row execute function audit_writer.tg_emit_audit_event();

-- ---------------------------------------------------------------------------
-- 5. Die Sicht — Mandantenregel und gesetzlicher Rueckfall direkt eingebettet
-- ---------------------------------------------------------------------------

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
  -- das Dokument entstanden ist. jahre is null bedeutet dauerhaft.
  --
  -- Kein coalesce(r.jahre, ...): eine Mandantenregel mit jahre = null
  -- ("dauerhaft") waere sonst nicht von "keine Mandantenregel" zu
  -- unterscheiden. Deshalb entscheidet r.id (die Existenz der Zeile), nicht
  -- r.jahre (ihr Wert).
  --
  -- Kein "when ... is null then null"-Zweig: make_interval(years => null)
  -- liefert null, eine Addition mit einem null-Interval liefert ebenfalls
  -- null (empirisch geprueft) — "dauerhaft" propagiert also von selbst bis
  -- zu aufzubewahren_bis, ohne eigene Fallunterscheidung.
  (
    pg_catalog.make_date(pg_catalog.date_part('year', d.dokument_datum)::int, 12, 31)
    + pg_catalog.make_interval(years =>
        case
          when r.id is not null then r.jahre
          -- Rueckfall: ein konservativer Vorschlag, keine Rechtsauskunft.
          --   protokoll/beschluss  dauerhaft (Praxis, nicht AO)
          --   rechnung             8  (§ 147 Abs. 3 Nr. 4 AO, Buchungsbeleg)
          --   korrespondenz        6  (§ 147 Abs. 3, Handels- und Geschaeftsbriefe)
          --   bescheid/vertrag/doku 10 (gegriffen, NICHT aus einer Vorschrift)
          -- Zu lange aufzubewahren ist wegen Art. 17 DSGVO kein risikofreier
          -- Default — genau deshalb ist die Regel bearbeitbar und die
          -- Herkunft sichtbar.
          else case d.doc_typ
            when 'protokoll'     then null
            when 'beschluss'     then null
            when 'rechnung'      then 8
            when 'korrespondenz' then 6
            else 10
          end
        end
      )
  )::date            as aufzubewahren_bis,
  case
    when r.id is not null then 'mandantenregel'
    else 'gesetzlicher_rueckfall'
  end                as frist_herkunft
from public.document as d
left join public.document_version as v
  on v.tenant_id = d.tenant_id
 and v.id = d.current_version_id
-- LEFT JOIN, nicht cross join lateral einer Funktion (frueherer Entwurf):
-- eine fehlende Mandantenregel darf das Dokument nie aus der Sicht
-- verschwinden lassen. Die Sicht ist security_invoker, RLS auf
-- aufbewahrungsregel filtert also selbst nach Mandant — kein Grant, kein
-- SECURITY DEFINER, kein Parameter-Guard mehr noetig.
left join public.aufbewahrungsregel as r
  on r.tenant_id = d.tenant_id
 and r.doc_typ = d.doc_typ;

comment on view public.dokument_uebersicht is
  'Dokument mit aktueller Version und abgeleiteter Aufbewahrungsfrist. security_invoker haelt die RLS der Basistabellen (inkl. aufbewahrungsregel) in Kraft. aufzubewahren_bis ist NULL, wenn dauerhaft aufzubewahren ist. frist_herkunft unterscheidet Mandantenregel von gesetzlichem Rueckfall anhand der Existenz der Regelzeile, nicht ihres jahre-Werts.';

grant select on public.dokument_uebersicht to authenticated;
