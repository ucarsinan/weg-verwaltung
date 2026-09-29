-- WEG-Verwaltung migration 0074: Beschlussgrundlage als Vorbedingung der Aktivierung.
--
-- Symptom:
--   public.activate_wirtschaftsplan erzeugt Sollstellungen — also konkrete
--   Zahlungsforderungen gegen einzelne Eigentuemer — ohne jeden Bezug auf einen
--   Beschluss. Am 2026-09-29 gemessen: public.wirtschaftsplan hat keine Spalte
--   dafuer. Die Lifecycle-Spalten aus 0047 (status, aktiviert_am, version_nr)
--   sind rein technisch.
--
-- Ursache:
--   Die Aktivierung wurde als technischer Statuswechsel modelliert, nicht als
--   der Rechtsakt, der sie ist. Bestreitet ein Eigentuemer eine Forderung, hat
--   das System auf die Frage "worauf beruht das?" keine Antwort.
--
-- Auswirkung:
--   Nach § 28 Abs. 1 WEG stellt der Verwalter den Wirtschaftsplan auf, und die
--   Wohnungseigentuemer beschliessen ueber die Vorschuesse. Seit dem WEMoG sind
--   Zahlenwerk und Beschluss ausdruecklich getrennt: der Plan ist die
--   Beschlussvorlage, erst der Beschluss begruendet die Zahlungspflicht.
--   Sollstellungen ohne Beschluss sind damit Forderungen ohne Grundlage.
--
-- Zweck:
--   Die Aktivierung verlangt einen Verweis auf einen Eintrag der
--   Beschluss-Sammlung. Pflicht auf NACHWEIS, nicht auf Verfahren: wie der
--   Beschluss zustande kam, schreibt diese Migration nicht vor.
--
-- Warum public.beschluss_sammlung_entry und NICHT public.resolution:
--   resolution.meeting_id ist not null (0004:86). Ein Verweis auf resolution
--   wuerde strukturell eine Versammlung erzwingen — und damit den
--   Umlaufbeschluss ausschliessen, den § 23 Abs. 3 WEG fuer den
--   Wirtschaftsplan ausdruecklich zulaesst (Textform, auch elektronisch).
--   beschluss_sammlung_entry haengt dagegen an der WEG, ist append-only
--   (0005:86-112) — der Fremdschluessel kann also nie ins Leere zeigen — und
--   traegt die lfd_nr, die zitierfaehige Registernummer nach § 24 Abs. 7 WEG.
--
--   Das weicht bewusst von abrechnung.resolution_id (0063:60) und
--   verteilungsschluessel_version.resolution_id (0056:67) ab. Beide zeigen auf
--   resolution und koennen einen manuell erfassten Umlaufbeschluss deshalb
--   nicht referenzieren. Das ist dort eine offene Schwaeche, kein Vorbild.
--
-- Warum die Signatur (uuid) unveraendert bleibt:
--   Ein zusaetzlicher Parameter mit default erzeugt in Postgres eine
--   UEBERLADUNG, kein Ersetzen. Genau dieser Unfall steht seit 0047 unbemerkt
--   in jeder Datenbank: private._generate_sollstellungen_for_plan existiert
--   weiterhin als tote (uuid)-Variante neben (uuid, integer), weil 0047 die
--   alte nie gedroppt hat. Bei einer PostgREST-exponierten public.-Funktion
--   waere das schlimmer — zwei Kandidaten mit gemeinsamem Parameterpraefix
--   koennen zu PGRST203 fuehren. Ein drop function wiederum braeche 14
--   E2E-Specs und riss tests/0056:632-649 als Hard-Error mit.
--
--   Deshalb wird der Beschluss am ENTWURF gesetzt und hier nur gelesen. Das ist
--   auch fachlich richtig: geplant wird, BEVOR die Versammlung beschliesst.
--
-- Ausdruecklich NICHT geprueft — das Beschlussdatum gegen das Planjahr:
--   Ein Beschluss darf spaet gefasst werden, auch nach Ablauf des
--   Wirtschaftsjahres; die Verzoegerung macht ihn nicht unwirksam. Zu regeln
--   sind dann Rueckwirkung, Faelligkeit und die Anrechnung schon geleisteter
--   Zahlungen — nicht die Zulaessigkeit. Eine Pruefung "Beschluss vor
--   Planjahr" waere fachlich falsch und darf hier nicht "nachgebessert"
--   werden.
--
-- Betroffene Tabellen:
--   public.wirtschaftsplan — neue nullable Spalte beschluss_sammlung_entry_id,
--   Fremdschluessel auf public.beschluss_sammlung_entry, partieller Index.
--   public.beschluss_sammlung_entry — nur als Verweisziel, unveraendert.
--
-- Warum die Spalte nullable bleibt:
--   Ein not null oder ein check (status = 'aktiv' -> verweis is not null) waere
--   auf der Cloud nicht migrierbar: dort liegen aktive Plaene aus dem
--   0047-Backfill und aus E2E-Laeufen ohne Verweis. Er wuerde ausserdem
--   tests/0063, 0064 und 0065 sofort rot machen, die status = 'aktiv' per
--   GUC-Bypass an der RPC vorbei setzen. Der Zwang gehoert in die RPC.
--
-- RLS-Auswirkung:
--   keine neue Policy. Die Funktion bleibt security definer mit unveraenderten
--   Grants. Die neue Spalte erbt die bestehenden Policies von
--   public.wirtschaftsplan; sie wird zusaetzlich in den Umschreibe-Schutz
--   aufgenommen (siehe unten), weil sie sonst an einem WIRKSAMEN Plan frei
--   ueberschreibbar waere und die Bindung wertlos machte.
--
-- Teststrategie:
--   infra/supabase/tests/0074_wirtschaftsplan_beschlussgrundlage.sql. Die
--   Fixtures von tests/0073 sind mitgezogen, weil deren acht
--   Aktivierungsaufrufe sonst in die neue Sperre laufen.
--
-- Rollback / Forward-Fix:
--   Rueckwaerts durch erneutes Anwenden des Funktionskoerpers aus 0073 und
--   Entfernen der Spalte. Vorwaerts-Fix bevorzugt: die Funktion wird ersetzt,
--   nicht veraendert.
--
-- Nicht enthalten:
--   Keine rueckwirkende Zuordnung fuer bereits aktivierte Plaene. Sie behalten
--   null. Begruendung wie 0073: Sollstellungen sind historische Forderungen,
--   sie nachtraeglich mit einer Grundlage zu versehen, die es damals nicht gab,
--   waere eine Faelschung.

-- ---------------------------------------------------------------------------
-- 1. Die Spalte und ihr Fremdschluessel
-- ---------------------------------------------------------------------------

alter table public.wirtschaftsplan
  add column if not exists beschluss_sammlung_entry_id uuid;

-- drop + add statt "add if not exists": Postgres kennt kein IF NOT EXISTS fuer
-- Constraints, und die Migration muss wiederholbar bleiben.
alter table public.wirtschaftsplan
  drop constraint if exists wirtschaftsplan_beschluss_fk;

alter table public.wirtschaftsplan
  add constraint wirtschaftsplan_beschluss_fk
  foreign key (tenant_id, beschluss_sammlung_entry_id)
  references public.beschluss_sammlung_entry(tenant_id, id)
  on delete restrict;

create index if not exists wirtschaftsplan_beschluss_idx
  on public.wirtschaftsplan (tenant_id, beschluss_sammlung_entry_id)
  where beschluss_sammlung_entry_id is not null;

comment on column public.wirtschaftsplan.beschluss_sammlung_entry_id is
  'Eintrag der Beschluss-Sammlung, auf dem die Vorschuesse dieses Plans beruhen (§ 28 Abs. 1 WEG). Am Entwurf zu setzen; die Aktivierung verlangt ihn. Null bei Plaenen, die vor 0074 aktiviert wurden.';

-- ---------------------------------------------------------------------------
-- 2. Umschreibe-Schutz auf die neue Spalte ausdehnen
-- ---------------------------------------------------------------------------
--
-- tg_wirtschaftsplan_prevent_effective_rewrite (0047:305-339) listet seine
-- geschuetzten Spalten ZWEIMAL namentlich auf: im "before update of" und in der
-- when-Klausel. Eine neue Spalte faellt durch beide. Ohne diese Erweiterung
-- koennte jeder authentifizierte Nutzer die Beschlussgrundlage eines aktiven
-- Plans nachtraeglich austauschen — die Bindung waere Dekoration.
--
-- Die Triggerfunktion selbst bleibt unveraendert.

drop trigger if exists wirtschaftsplan_prevent_effective_rewrite
  on public.wirtschaftsplan;
create trigger wirtschaftsplan_prevent_effective_rewrite
  before update of bezeichnung, weg_id, jahr, gesamtkosten, version_nr,
    vorgaenger_wirtschaftsplan_id, wirksam_ab_monat, beschluss_sammlung_entry_id
  on public.wirtschaftsplan
  for each row
  when (
    old.bezeichnung is distinct from new.bezeichnung
    or old.weg_id is distinct from new.weg_id
    or old.jahr is distinct from new.jahr
    or old.gesamtkosten is distinct from new.gesamtkosten
    or old.version_nr is distinct from new.version_nr
    or old.vorgaenger_wirtschaftsplan_id is distinct from new.vorgaenger_wirtschaftsplan_id
    or old.wirksam_ab_monat is distinct from new.wirksam_ab_monat
    or old.beschluss_sammlung_entry_id is distinct from new.beschluss_sammlung_entry_id
  )
  execute function public.tg_wirtschaftsplan_prevent_effective_rewrite();

-- ---------------------------------------------------------------------------
-- 3. activate_wirtschaftsplan mit Beschluss-Vorbedingung
-- ---------------------------------------------------------------------------

create or replace function public.activate_wirtschaftsplan(
  p_wirtschaftsplan_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan record;
  v_beschluss record;
  v_existing_active_id uuid;
  v_existing_active_tenant_id uuid;
  v_request_tenant_id uuid;
  v_now timestamptz;
  v_next_version integer;
  v_start_month integer;
  v_mea_sum numeric;
  v_epsilon constant numeric := 0.0001;
begin
  if coalesce(pg_catalog.current_setting('app.actor_type', true), 'user') = 'agent' then
    raise exception 'Agents cannot activate Wirtschaftspläne.'
      using errcode = '42501';
  end if;

  v_request_tenant_id := public.tenant_id();
  if v_request_tenant_id is null then
    raise exception 'Wirtschaftsplan not found or access denied.'
      using errcode = '42501';
  end if;

  select wp.*
    into v_plan
    from public.wirtschaftsplan wp
   where wp.id = p_wirtschaftsplan_id
   for update;

  if not found or v_plan.tenant_id is distinct from v_request_tenant_id then
    raise exception 'Wirtschaftsplan not found or access denied.'
      using errcode = '42501';
  end if;

  if v_plan.status <> 'entwurf' then
    raise exception 'Only draft Wirtschaftspläne can be activated.'
      using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_plan.tenant_id::text || ':' || v_plan.weg_id::text || ':' || v_plan.jahr::text,
      47
    )
  );

  select wp.id, wp.tenant_id
    into v_existing_active_id, v_existing_active_tenant_id
    from public.wirtschaftsplan wp
   where wp.tenant_id = v_plan.tenant_id
     and wp.weg_id = v_plan.weg_id
     and wp.jahr = v_plan.jahr
     and wp.status = 'aktiv'
     and wp.id <> v_plan.id
   for update;

  if v_plan.vorgaenger_wirtschaftsplan_id is not null and not exists (
    select 1
      from public.wirtschaftsplan prev
     where prev.tenant_id = v_plan.tenant_id
       and prev.id = v_plan.vorgaenger_wirtschaftsplan_id
       and prev.weg_id = v_plan.weg_id
       and prev.jahr = v_plan.jahr
       and prev.status in ('aktiv', 'abgeloest', 'archiviert')
  ) then
    raise exception 'Nachtragswirtschaftsplan predecessor must be an effective plan in the same WEG and year.'
      using errcode = '23514';
  end if;

  -- 0073: Ein Wirtschaftsplan muss 100 % der Gesamtkosten verteilen. Gehen die
  -- Miteigentumsanteile nicht auf das Ganze auf, traegt die Gemeinschaft ihre
  -- Kosten nicht vollstaendig — oder eine Einheit traegt mehr als ihren Teil.
  -- Beides faellt hier aus, bevor eine einzige Sollstellung entsteht.
  select coalesce(
           pg_catalog.sum(u.mea_zaehler::numeric / u.mea_nenner::numeric),
           0
         )
    into v_mea_sum
    from public.unit as u
   where u.tenant_id = v_plan.tenant_id
     and u.weg_id = v_plan.weg_id;

  if v_mea_sum <= 0 then
    raise exception
      'Diese WEG hat keine Einheiten mit Miteigentumsanteilen. Ohne Einheiten entsteht kein Hausgeld.'
      using errcode = '22023';
  end if;

  if v_mea_sum > 1 + v_epsilon then
    raise exception
      'Die Miteigentumsanteile ergeben zusammen % %% des Ganzen. Mehr als ein Ganzes ist nicht möglich — bitte die Anteile der Einheiten prüfen.',
      pg_catalog.round(v_mea_sum * 100, 2)
      using errcode = '22023';
  end if;

  if v_mea_sum < 1 - v_epsilon then
    raise exception
      'Die Miteigentumsanteile ergeben zusammen nur % %% des Ganzen. % %% der Gesamtkosten würden niemandem berechnet — fehlt eine Einheit?',
      pg_catalog.round(v_mea_sum * 100, 2),
      pg_catalog.round((1 - v_mea_sum) * 100, 2)
      using errcode = '22023';
  end if;

  -- 0074: Die Vorschuesse entstehen durch den Beschluss der Eigentuemer, nicht
  -- durch das Aufstellen des Plans (§ 28 Abs. 1 WEG). Ab hier wird der
  -- Nachweis verlangt — dass er erbracht werden KANN, sichert die
  -- Beschluss-Sammlung, die jede WEG ohnehin fuehren muss (§ 24 Abs. 7 WEG).
  if v_plan.beschluss_sammlung_entry_id is null then
    raise exception
      'Dieser Wirtschaftsplan ist keinem Beschluss zugeordnet. Die Vorschüsse entstehen erst durch den Beschluss der Eigentümer (§ 28 Abs. 1 WEG) — bitte den zugehörigen Beschluss der Beschluss-Sammlung zuordnen.'
      using errcode = '22023';
  end if;

  select bse.weg_id, bse.typ, bse.anfechtungsstatus, bse.lfd_nr
    into v_beschluss
    from public.beschluss_sammlung_entry as bse
   where bse.tenant_id = v_plan.tenant_id
     and bse.id = v_plan.beschluss_sammlung_entry_id;

  -- Kann nur bei Datendrift auftreten: der Fremdschluessel deckt den Fall
  -- eigentlich ab, und die Beschluss-Sammlung ist unloeschbar.
  if not found then
    raise exception
      'Der zugeordnete Beschluss wurde nicht gefunden.'
      using errcode = '22023';
  end if;

  if v_beschluss.weg_id is distinct from v_plan.weg_id then
    raise exception
      'Der zugeordnete Beschluss gehört zu einer anderen WEG.'
      using errcode = '22023';
  end if;

  -- Positivliste statt Ausschluss von 'negativ_beschluss': ein kuenftiger
  -- vierter Typ soll nicht stillschweigend als Grundlage durchgehen. Beide
  -- Umlauf-Formen sind zulaessig — der manuell erfasste (meeting_id und
  -- resolution_id null) und der aus feststellen_resolution (0049:553-557).
  if v_beschluss.typ not in ('positiv_beschluss', 'umlaufbeschluss') then
    raise exception
      'Beschluss Nr. % ist kein zustimmender Beschluss (Typ "%"). Nur ein angenommener Beschluss begründet Vorschüsse.',
      v_beschluss.lfd_nr, v_beschluss.typ
      using errcode = '22023';
  end if;

  -- Heute eine Sperre ohne Ausloeser: anfechtungsstatus kann seinen Default
  -- nicht verlassen, weil die Tabelle append-only ist und die Projektion aus
  -- beschluss_anfechtung_event nie gebaut wurde. Die Pruefung steht hier als
  -- Riegel fuer den Tag, an dem sie gebaut wird — dann darf ein fuer unwirksam
  -- erklaerter Beschluss keine neuen Vorschuesse mehr tragen.
  if v_beschluss.anfechtungsstatus = 'unwirksam_erklaert' then
    raise exception
      'Beschluss Nr. % ist für unwirksam erklärt und kann keine Vorschüsse begründen.',
      v_beschluss.lfd_nr
      using errcode = '22023';
  end if;

  select coalesce(max(wp.version_nr), 0) + 1
    into v_next_version
    from public.wirtschaftsplan wp
   where wp.tenant_id = v_plan.tenant_id
     and wp.weg_id = v_plan.weg_id
     and wp.jahr = v_plan.jahr
     and wp.status <> 'entwurf'
     and wp.id <> v_plan.id;

  v_now := pg_catalog.now();
  v_start_month := coalesce(v_plan.wirksam_ab_monat, 1);

  perform pg_catalog.set_config('app.wirtschaftsplan_lifecycle_manager', '1', true);

  if v_existing_active_id is not null then
    update public.wirtschaftsplan
       set status = 'abgeloest',
           abgeloest_am = v_now,
           updated_at = v_now
     where tenant_id = v_existing_active_tenant_id
       and id = v_existing_active_id;
  end if;

  update public.wirtschaftsplan
     set status = 'aktiv',
         aktiviert_am = v_now,
         abgeloest_am = null,
         archiviert_am = null,
         version_nr = v_next_version,
         wirksam_ab_monat = v_start_month,
         updated_at = v_now
   where tenant_id = v_plan.tenant_id
     and id = v_plan.id;

  perform private._generate_sollstellungen_for_plan(v_plan.id, v_start_month);
end;
$$;

revoke all on function public.activate_wirtschaftsplan(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.activate_wirtschaftsplan(uuid) to authenticated;

comment on function public.activate_wirtschaftsplan(uuid) is
  'Tenant-checked lifecycle RPC. Serializes tenant/WEG/year, verifies that the WEG''s Miteigentumsanteile add up to exactly one whole and that the plan cites an affirmative Beschluss-Sammlung entry of the same WEG (22023 otherwise), activates one draft, replaces the previous active plan, and posts immutable Sollstellungen.';

-- Die neue Spalte ist erst nach einem Schema-Reload ueber PostgREST sicht- und
-- schreibbar; ohne diese Zeile antwortet die API auf ihren Namen mit PGRST204.
-- 0068-0073 haben den Reload weggelassen, was bei reinen Koerperaenderungen
-- verzeihlich war — hier nicht.
notify pgrst, 'reload schema';
