-- WEG-Verwaltung pgTAP regression tests for 0074: Beschlussgrundlage der Aktivierung.
--
-- Scope:
--   - die Signatur (uuid) bleibt unveraendert (kein drop, keine Ueberladung)
--   - Spalte, Fremdschluessel und Umschreibe-Schutz existieren
--   - ohne Beschluss keine Aktivierung und keine einzige Sollstellung
--   - ein Beschluss einer anderen WEG wird abgewiesen
--   - ein abgelehnter Beschluss begruendet keine Vorschuesse
--   - ein Umlaufbeschluss OHNE Versammlung geht durch (§ 23 Abs. 3 WEG)
--   - ein spaeter Beschluss geht durch, auch nach Ablauf des Planjahres
--   - die Grundlage eines wirksamen Plans ist nicht mehr austauschbar
--
-- Nicht abgedeckt: anfechtungsstatus = 'unwirksam_erklaert'. Die Pruefung
-- existiert in 0074, ist aber heute nicht ausloesbar — die Tabelle ist
-- append-only und die Projektion aus beschluss_anfechtung_event wurde nie
-- gebaut. Ein Test dafuer muesste den Append-only-Schutz umgehen und wuerde
-- etwas zusichern, was das Produkt nicht kann.
--
-- Laeuft in einer Transaktion und rollt alle Fixtures zurueck.

begin;

select plan(16);

-- ============================================================================
-- Katalog: Signatur, Spalte, Fremdschluessel, Schutz
-- ============================================================================

select has_function(
  'public',
  'activate_wirtschaftsplan',
  array['uuid'],
  'activate_wirtschaftsplan behaelt die einparametrige Signatur — kein drop, keine Ueberladung'
);

select ok(
  not pg_catalog.has_function_privilege(
    'anon', 'public.activate_wirtschaftsplan(uuid)', 'execute'),
  'anon darf die Aktivierung nicht ausfuehren'
);

select ok(
  pg_catalog.has_function_privilege(
    'authenticated', 'public.activate_wirtschaftsplan(uuid)', 'execute'),
  'authenticated darf die Aktivierung ausfuehren'
);

select has_column(
  'public',
  'wirtschaftsplan',
  'beschluss_sammlung_entry_id',
  'der Wirtschaftsplan traegt einen Verweis auf die Beschluss-Sammlung'
);

select ok(
  exists (
    select 1
      from pg_catalog.pg_constraint con
     where con.conname = 'wirtschaftsplan_beschluss_fk'
       and con.conrelid = 'public.wirtschaftsplan'::regclass
       and con.contype = 'f'
       and con.confrelid = 'public.beschluss_sammlung_entry'::regclass
  ),
  'der Fremdschluessel zeigt auf die Beschluss-Sammlung, nicht auf resolution'
);

-- Ohne diese Zeile waere die Bindung Dekoration: die Spalte faellt sonst durch
-- beide Spaltenlisten des Triggers und bliebe an einem aktiven Plan frei
-- ueberschreibbar.
select ok(
  (select pg_catalog.pg_get_triggerdef(t.oid)
     from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.wirtschaftsplan'::regclass
      and t.tgname = 'wirtschaftsplan_prevent_effective_rewrite')
  like '%beschluss_sammlung_entry_id%',
  'der Umschreibe-Schutz fuer wirksame Plaene deckt die neue Spalte ab'
);

-- ============================================================================
-- Fixtures
-- ============================================================================

insert into public.tenant (id, name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa74'::uuid, '0074 Tenant')
on conflict (id) do update
set name = excluded.name;

select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub', '11111111-1111-4111-8111-111111111174',
    'role', 'authenticated',
    'app_metadata', pg_catalog.jsonb_build_object(
      'tenant_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa74',
      'role', 'tenant_admin'
    )
  )::text,
  true
);

-- Fuenf WEGs, jede mit zwei Einheiten zu 500/1000 — die MEA-Summe ist damit
-- immer genau 1, und jede Abweisung unten kann nur an der Beschlussgrundlage
-- liegen, nicht an 0073.
insert into public.weg (id, tenant_id, name)
values
  ('c0000000-0000-4000-8000-000000000074'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa74'::uuid, '0074 Ohne Beschluss'),
  ('d0000000-0000-4000-8000-000000000074'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa74'::uuid, '0074 Fremder Beschluss'),
  ('f0000000-0000-4000-8000-000000000074'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa74'::uuid, '0074 Abgelehnt'),
  ('a9000000-0000-4000-8000-000000000074'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa74'::uuid, '0074 Umlauf'),
  ('b9000000-0000-4000-8000-000000000074'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa74'::uuid, '0074 Spaeter Beschluss');

insert into public.unit (id, tenant_id, weg_id, bezeichnung, mea_zaehler, mea_nenner)
values
  ('c1000000-0000-4000-8000-000000000074'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa74'::uuid,
   'c0000000-0000-4000-8000-000000000074'::uuid, 'Ohne Beschluss 1', 500, 1000),
  ('c2000000-0000-4000-8000-000000000074'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa74'::uuid,
   'c0000000-0000-4000-8000-000000000074'::uuid, 'Ohne Beschluss 2', 500, 1000),
  ('d1000000-0000-4000-8000-000000000074'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa74'::uuid,
   'd0000000-0000-4000-8000-000000000074'::uuid, 'Fremder Beschluss 1', 500, 1000),
  ('d2000000-0000-4000-8000-000000000074'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa74'::uuid,
   'd0000000-0000-4000-8000-000000000074'::uuid, 'Fremder Beschluss 2', 500, 1000),
  ('f1000000-0000-4000-8000-000000000074'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa74'::uuid,
   'f0000000-0000-4000-8000-000000000074'::uuid, 'Abgelehnt 1', 500, 1000),
  ('f2000000-0000-4000-8000-000000000074'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa74'::uuid,
   'f0000000-0000-4000-8000-000000000074'::uuid, 'Abgelehnt 2', 500, 1000),
  ('a1000000-0000-4000-8000-000000000074'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa74'::uuid,
   'a9000000-0000-4000-8000-000000000074'::uuid, 'Umlauf 1', 500, 1000),
  ('a2000000-0000-4000-8000-000000000074'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa74'::uuid,
   'a9000000-0000-4000-8000-000000000074'::uuid, 'Umlauf 2', 500, 1000),
  ('b1000000-0000-4000-8000-000000000074'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa74'::uuid,
   'b9000000-0000-4000-8000-000000000074'::uuid, 'Spaet 1', 500, 1000),
  ('b2000000-0000-4000-8000-000000000074'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa74'::uuid,
   'b9000000-0000-4000-8000-000000000074'::uuid, 'Spaet 2', 500, 1000);

insert into public.wirtschaftsplan (id, tenant_id, weg_id, jahr, bezeichnung, gesamtkosten)
values
  ('e0000000-0000-4000-8000-000000000074'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa74'::uuid,
   'c0000000-0000-4000-8000-000000000074'::uuid, 2074, 'Plan Ohne Beschluss', 12000),
  ('e1000000-0000-4000-8000-000000000074'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa74'::uuid,
   'd0000000-0000-4000-8000-000000000074'::uuid, 2074, 'Plan Fremder Beschluss', 12000),
  ('e2000000-0000-4000-8000-000000000074'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa74'::uuid,
   'f0000000-0000-4000-8000-000000000074'::uuid, 2074, 'Plan Abgelehnt', 12000),
  ('e3000000-0000-4000-8000-000000000074'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa74'::uuid,
   'a9000000-0000-4000-8000-000000000074'::uuid, 2074, 'Plan Umlauf', 12000),
  ('e4000000-0000-4000-8000-000000000074'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa74'::uuid,
   'b9000000-0000-4000-8000-000000000074'::uuid, 2074, 'Plan Spaeter Beschluss', 12000);

-- Vier Beschluesse. lfd_nr vergibt der Trigger aus 0049.
insert into public.beschluss_sammlung_entry
  (id, tenant_id, weg_id, beschluss_text, datum, typ, erstellt_durch)
values
  -- gehoert WEG "Ohne Beschluss", wird aber absichtlich dem Plan der WEG
  -- "Fremder Beschluss" zugeordnet
  ('ba000000-0000-4000-8000-000000000074'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa74'::uuid,
   'c0000000-0000-4000-8000-000000000074'::uuid,
   'Die Gemeinschaft beschliesst die Vorschuesse nach dem Wirtschaftsplan 2074.',
   '2074-01-15', 'positiv_beschluss',
   '11111111-1111-4111-8111-111111111174'::uuid),
  ('bc000000-0000-4000-8000-000000000074'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa74'::uuid,
   'f0000000-0000-4000-8000-000000000074'::uuid,
   'Der Antrag auf Beschluss der Vorschuesse 2074 wurde abgelehnt.',
   '2074-01-15', 'negativ_beschluss',
   '11111111-1111-4111-8111-111111111174'::uuid),
  -- Umlaufbeschluss ohne meeting_id und ohne resolution_id — genau die Form,
  -- die der manuelle Erfassungsweg erzeugt
  ('bd000000-0000-4000-8000-000000000074'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa74'::uuid,
   'a9000000-0000-4000-8000-000000000074'::uuid,
   'Im Umlaufverfahren beschliessen die Eigentuemer die Vorschuesse 2074.',
   '2074-02-01', 'umlaufbeschluss',
   '11111111-1111-4111-8111-111111111174'::uuid),
  -- Datum NACH Ablauf des Planjahres: zulaessig, siehe Kopfkommentar von 0074
  ('be000000-0000-4000-8000-000000000074'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa74'::uuid,
   'b9000000-0000-4000-8000-000000000074'::uuid,
   'Die Gemeinschaft beschliesst die Vorschuesse 2074 nachtraeglich.',
   '2075-03-01', 'positiv_beschluss',
   '11111111-1111-4111-8111-111111111174'::uuid);

update public.wirtschaftsplan
   set beschluss_sammlung_entry_id = 'ba000000-0000-4000-8000-000000000074'::uuid
 where id = 'e1000000-0000-4000-8000-000000000074'::uuid;

update public.wirtschaftsplan
   set beschluss_sammlung_entry_id = 'bc000000-0000-4000-8000-000000000074'::uuid
 where id = 'e2000000-0000-4000-8000-000000000074'::uuid;

update public.wirtschaftsplan
   set beschluss_sammlung_entry_id = 'bd000000-0000-4000-8000-000000000074'::uuid
 where id = 'e3000000-0000-4000-8000-000000000074'::uuid;

update public.wirtschaftsplan
   set beschluss_sammlung_entry_id = 'be000000-0000-4000-8000-000000000074'::uuid
 where id = 'e4000000-0000-4000-8000-000000000074'::uuid;

-- ============================================================================
-- Die Sperre
-- ============================================================================

select throws_ok(
  $q$select public.activate_wirtschaftsplan(
       'e0000000-0000-4000-8000-000000000074'::uuid)$q$,
  '22023',
  null,
  'ohne Beschlussgrundlage keine Aktivierung'
);

select is(
  (select pg_catalog.count(*)
     from public.sollstellung
    where wirtschaftsplan_id = 'e0000000-0000-4000-8000-000000000074'::uuid),
  0::bigint,
  'der abgewiesene Plan hat keine einzige Zahlungsforderung erzeugt'
);

select is(
  (select wp.status
     from public.wirtschaftsplan wp
    where wp.id = 'e0000000-0000-4000-8000-000000000074'::uuid),
  'entwurf',
  'der abgewiesene Plan bleibt Entwurf'
);

select throws_ok(
  $q$select public.activate_wirtschaftsplan(
       'e1000000-0000-4000-8000-000000000074'::uuid)$q$,
  '22023',
  null,
  'ein Beschluss einer anderen WEG traegt diesen Plan nicht'
);

select throws_ok(
  $q$select public.activate_wirtschaftsplan(
       'e2000000-0000-4000-8000-000000000074'::uuid)$q$,
  '22023',
  null,
  'ein abgelehnter Antrag begruendet keine Vorschuesse'
);

-- ============================================================================
-- Was durchgehen muss
-- ============================================================================

-- § 23 Abs. 3 WEG: der Umlaufbeschluss traegt den Wirtschaftsplan. Haette 0074
-- auf public.resolution verwiesen, waere dieser Fall strukturell unmoeglich —
-- resolution.meeting_id ist not null.
select lives_ok(
  $q$select public.activate_wirtschaftsplan(
       'e3000000-0000-4000-8000-000000000074'::uuid)$q$,
  'ein Umlaufbeschluss ohne Versammlung genuegt als Grundlage'
);

-- 12 Monate x 2 Einheiten
select is(
  (select pg_catalog.count(*)
     from public.sollstellung
    where wirtschaftsplan_id = 'e3000000-0000-4000-8000-000000000074'::uuid),
  24::bigint,
  'der Umlauf-Plan erzeugt die vollen Sollstellungen'
);

-- Ein Beschluss darf spaet gefasst werden, auch nach Ablauf des Planjahres.
-- Diese Zusicherung haelt fest, dass hier KEINE Datumspruefung nachgezogen wird.
select lives_ok(
  $q$select public.activate_wirtschaftsplan(
       'e4000000-0000-4000-8000-000000000074'::uuid)$q$,
  'ein Beschluss nach Ablauf des Planjahres ist zulaessig'
);

select is(
  (select wp.status
     from public.wirtschaftsplan wp
    where wp.id = 'e4000000-0000-4000-8000-000000000074'::uuid),
  'aktiv',
  'der nachtraeglich beschlossene Plan ist aktiv'
);

-- ============================================================================
-- Die Grundlage eines wirksamen Plans ist nicht austauschbar
-- ============================================================================

select throws_ok(
  $q$update public.wirtschaftsplan
        set beschluss_sammlung_entry_id
              = 'ba000000-0000-4000-8000-000000000074'::uuid
      where id = 'e4000000-0000-4000-8000-000000000074'::uuid$q$,
  '23514',
  null,
  'die Beschlussgrundlage eines aktiven Plans laesst sich nicht umschreiben'
);

select * from finish();

rollback;
