-- WEG-Verwaltung pgTAP regression tests for 0073 MEA-Vollstaendigkeit bei der Aktivierung.
--
-- Scope:
--   - eine WEG, deren Miteigentumsanteile nicht auf das Ganze aufgehen, laesst
--     sich nicht aktivieren (22023) — und es entsteht KEINE Sollstellung
--   - vollstaendige Anteile gehen durch, und die Summe der Sollstellungen
--     entspricht den Gesamtkosten auf den Cent
--   - gemischte Nenner (1/2 + 250/1000 + 25/100) gehen durch: geprueft wird die
--     Summe der Brueche gegen 1, nie der Zaehler gegen 1000
--   - eine WEG ohne Einheiten wird abgewiesen statt still nichts zu erzeugen
--   - Anteile ueber dem Ganzen werden abgewiesen
--   - die Sperre wirkt auch auf Plaene MIT Positionen, also vor dem Generator
--   - das Versprechen aus 0060 bleibt messbar: bei vollstaendiger MEA rechnet
--     der Alt-Zweig unveraendert
--   - Agenten koennen weiterhin gar nicht aktivieren (42501 vor allem anderen)
--
-- Warum 22023 und nicht 23514: Die Weboberflaeche bildet jeden 23514 auf
-- dieselbe Meldung ab. Ein eigener Code macht diese Ursache unterscheidbar,
-- ohne Meldungstexte zu parsen.
--
-- Laeuft in einer Transaktion und rollt alle Fixtures zurueck.

begin;

select plan(17);

-- ============================================================================
-- Katalog
-- ============================================================================

select has_function(
  'public',
  'activate_wirtschaftsplan',
  array['uuid'],
  'die Aktivierungs-RPC existiert weiterhin'
);

select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.activate_wirtschaftsplan(uuid)',
    'execute'
  ),
  'anon darf nicht aktivieren'
);

select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.activate_wirtschaftsplan(uuid)',
    'execute'
  ),
  'authenticated darf aktivieren'
);

-- ============================================================================
-- Fixtures
-- ============================================================================

insert into public.tenant (id, name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid, '0073 Tenant')
on conflict (id) do update
set name = excluded.name;

select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub', '11111111-1111-4111-8111-111111111173',
    'role', 'authenticated',
    'app_metadata', pg_catalog.jsonb_build_object(
      'tenant_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73',
      'role', 'tenant_admin'
    )
  )::text,
  true
);

-- WEG A: Anteile gehen NICHT auf (3 x 250/1000 = 0,75).
insert into public.weg (id, tenant_id, name)
values ('c0000000-0000-4000-8000-000000000073'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid, '0073 Luecke');

insert into public.unit (id, tenant_id, weg_id, bezeichnung, mea_zaehler, mea_nenner)
values
  ('c1000000-0000-4000-8000-000000000073'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid,
   'c0000000-0000-4000-8000-000000000073'::uuid, 'Luecke 1', 250, 1000),
  ('c2000000-0000-4000-8000-000000000073'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid,
   'c0000000-0000-4000-8000-000000000073'::uuid, 'Luecke 2', 250, 1000),
  ('c3000000-0000-4000-8000-000000000073'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid,
   'c0000000-0000-4000-8000-000000000073'::uuid, 'Luecke 3', 250, 1000);

insert into public.wirtschaftsplan (id, tenant_id, weg_id, jahr, bezeichnung, gesamtkosten)
values ('e0000000-0000-4000-8000-000000000073'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid,
        'c0000000-0000-4000-8000-000000000073'::uuid,
        2073, 'Plan Luecke', 12000);

-- WEG B: Anteile gehen auf (400 + 600 von 1000).
insert into public.weg (id, tenant_id, name)
values ('d0000000-0000-4000-8000-000000000073'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid, '0073 Vollstaendig');

insert into public.unit (id, tenant_id, weg_id, bezeichnung, mea_zaehler, mea_nenner)
values
  ('d1000000-0000-4000-8000-000000000073'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid,
   'd0000000-0000-4000-8000-000000000073'::uuid, 'Voll A', 400, 1000),
  ('d2000000-0000-4000-8000-000000000073'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid,
   'd0000000-0000-4000-8000-000000000073'::uuid, 'Voll B', 600, 1000);

insert into public.wirtschaftsplan (id, tenant_id, weg_id, jahr, bezeichnung, gesamtkosten)
values ('e1000000-0000-4000-8000-000000000073'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid,
        'd0000000-0000-4000-8000-000000000073'::uuid,
        2073, 'Plan Vollstaendig', 12000);

-- WEG C: gemischte Nenner, die zusammen genau 1 ergeben.
-- 1/2 + 250/1000 + 25/100 = 0,5 + 0,25 + 0,25 = 1
insert into public.weg (id, tenant_id, name)
values ('f0000000-0000-4000-8000-000000000073'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid, '0073 Gemischte Nenner');

insert into public.unit (id, tenant_id, weg_id, bezeichnung, mea_zaehler, mea_nenner)
values
  ('f1000000-0000-4000-8000-000000000073'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid,
   'f0000000-0000-4000-8000-000000000073'::uuid, 'Halb', 1, 2),
  ('f2000000-0000-4000-8000-000000000073'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid,
   'f0000000-0000-4000-8000-000000000073'::uuid, 'Viertel A', 250, 1000),
  ('f3000000-0000-4000-8000-000000000073'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid,
   'f0000000-0000-4000-8000-000000000073'::uuid, 'Viertel B', 25, 100);

insert into public.wirtschaftsplan (id, tenant_id, weg_id, jahr, bezeichnung, gesamtkosten)
values ('e2000000-0000-4000-8000-000000000073'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid,
        'f0000000-0000-4000-8000-000000000073'::uuid,
        2073, 'Plan Gemischte Nenner', 12000);

-- WEG D: gar keine Einheiten.
insert into public.weg (id, tenant_id, name)
values ('a9000000-0000-4000-8000-000000000073'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid, '0073 Ohne Einheiten');

insert into public.wirtschaftsplan (id, tenant_id, weg_id, jahr, bezeichnung, gesamtkosten)
values ('e3000000-0000-4000-8000-000000000073'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid,
        'a9000000-0000-4000-8000-000000000073'::uuid,
        2073, 'Plan Ohne Einheiten', 12000);

-- WEG E: Anteile uebersteigen das Ganze (2 x 600/1000 = 1,2).
insert into public.weg (id, tenant_id, name)
values ('b9000000-0000-4000-8000-000000000073'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid, '0073 Ueberzaehlig');

insert into public.unit (id, tenant_id, weg_id, bezeichnung, mea_zaehler, mea_nenner)
values
  ('b1000000-0000-4000-8000-000000000073'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid,
   'b9000000-0000-4000-8000-000000000073'::uuid, 'Ueber A', 600, 1000),
  ('b2000000-0000-4000-8000-000000000073'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid,
   'b9000000-0000-4000-8000-000000000073'::uuid, 'Ueber B', 600, 1000);

insert into public.wirtschaftsplan (id, tenant_id, weg_id, jahr, bezeichnung, gesamtkosten)
values ('e4000000-0000-4000-8000-000000000073'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid,
        'b9000000-0000-4000-8000-000000000073'::uuid,
        2073, 'Plan Ueberzaehlig', 12000);

-- ----------------------------------------------------------------------------
-- 0074: Beschlussgrundlage je WEG
-- ----------------------------------------------------------------------------
--
-- Seit 0074 verlangt die Aktivierung einen Verweis auf einen Eintrag der
-- Beschluss-Sammlung. Ohne diese Fixtures scheiterten die beiden lives_ok-Faelle
-- unten.
--
-- Bewusst ALLE fuenf Plaene, nicht nur die beiden positiven: Die MEA-Pruefungen
-- stehen in 0074 vor der Beschluss-Pruefung, die throws_ok-Faelle wuerden also
-- auch ohne Beschluss gruen bleiben — aber aus dem falschen Grund, und eine
-- spaetere Umsortierung der Pruefungen wuerde sie still entwerten, statt sie rot
-- zu machen. Mit Beschluss beweisen sie die MEA-Sperre unabhaengig von der
-- Reihenfolge.
--
-- lfd_nr wird nicht gesetzt — der Trigger aus 0049 vergibt sie je WEG.

insert into public.beschluss_sammlung_entry
  (id, tenant_id, weg_id, beschluss_text, datum, typ, erstellt_durch)
values
  ('ba000000-0000-4000-8000-000000000073'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid,
   'c0000000-0000-4000-8000-000000000073'::uuid,
   'Die Gemeinschaft beschliesst die Vorschuesse nach dem Wirtschaftsplan 2073.',
   '2073-01-15', 'positiv_beschluss',
   '11111111-1111-4111-8111-111111111173'::uuid),
  ('bb000000-0000-4000-8000-000000000073'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid,
   'd0000000-0000-4000-8000-000000000073'::uuid,
   'Die Gemeinschaft beschliesst die Vorschuesse nach dem Wirtschaftsplan 2073.',
   '2073-01-15', 'positiv_beschluss',
   '11111111-1111-4111-8111-111111111173'::uuid),
  ('bc000000-0000-4000-8000-000000000073'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid,
   'f0000000-0000-4000-8000-000000000073'::uuid,
   'Die Gemeinschaft beschliesst die Vorschuesse nach dem Wirtschaftsplan 2073.',
   '2073-01-15', 'positiv_beschluss',
   '11111111-1111-4111-8111-111111111173'::uuid),
  ('bd000000-0000-4000-8000-000000000073'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid,
   'a9000000-0000-4000-8000-000000000073'::uuid,
   'Die Gemeinschaft beschliesst die Vorschuesse nach dem Wirtschaftsplan 2073.',
   '2073-01-15', 'positiv_beschluss',
   '11111111-1111-4111-8111-111111111173'::uuid),
  ('be000000-0000-4000-8000-000000000073'::uuid,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid,
   'b9000000-0000-4000-8000-000000000073'::uuid,
   'Die Gemeinschaft beschliesst die Vorschuesse nach dem Wirtschaftsplan 2073.',
   '2073-01-15', 'positiv_beschluss',
   '11111111-1111-4111-8111-111111111173'::uuid);

update public.wirtschaftsplan
   set beschluss_sammlung_entry_id = case weg_id
         when 'c0000000-0000-4000-8000-000000000073'::uuid
           then 'ba000000-0000-4000-8000-000000000073'::uuid
         when 'd0000000-0000-4000-8000-000000000073'::uuid
           then 'bb000000-0000-4000-8000-000000000073'::uuid
         when 'f0000000-0000-4000-8000-000000000073'::uuid
           then 'bc000000-0000-4000-8000-000000000073'::uuid
         when 'a9000000-0000-4000-8000-000000000073'::uuid
           then 'bd000000-0000-4000-8000-000000000073'::uuid
         when 'b9000000-0000-4000-8000-000000000073'::uuid
           then 'be000000-0000-4000-8000-000000000073'::uuid
       end
 where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid
   and jahr = 2073;

-- ============================================================================
-- Die Sperre
-- ============================================================================

select throws_ok(
  $q$select public.activate_wirtschaftsplan(
       'e0000000-0000-4000-8000-000000000073'::uuid)$q$,
  '22023',
  null,
  'unvollstaendige Anteile (0,75) verhindern die Aktivierung'
);

select is(
  (select pg_catalog.count(*)
     from public.sollstellung
    where wirtschaftsplan_id = 'e0000000-0000-4000-8000-000000000073'::uuid),
  0::bigint,
  'der abgewiesene Plan hat keine einzige Sollstellung erzeugt'
);

select is(
  (select wp.status
     from public.wirtschaftsplan wp
    where wp.id = 'e0000000-0000-4000-8000-000000000073'::uuid),
  'entwurf',
  'der abgewiesene Plan bleibt Entwurf'
);

select throws_ok(
  $q$select public.activate_wirtschaftsplan(
       'e3000000-0000-4000-8000-000000000073'::uuid)$q$,
  '22023',
  null,
  'eine WEG ohne Einheiten wird abgewiesen statt still nichts zu erzeugen'
);

select throws_ok(
  $q$select public.activate_wirtschaftsplan(
       'e4000000-0000-4000-8000-000000000073'::uuid)$q$,
  '22023',
  null,
  'Anteile ueber dem Ganzen (1,2) werden abgewiesen'
);

-- ============================================================================
-- Was weiterhin durchgehen muss
-- ============================================================================

select lives_ok(
  $q$select public.activate_wirtschaftsplan(
       'e1000000-0000-4000-8000-000000000073'::uuid)$q$,
  'vollstaendige Anteile (400 + 600 von 1000) gehen durch'
);

-- 12 Monate x 2 Einheiten
select is(
  (select pg_catalog.count(*)
     from public.sollstellung
    where wirtschaftsplan_id = 'e1000000-0000-4000-8000-000000000073'::uuid),
  24::bigint,
  'zwei Einheiten ueber zwoelf Monate ergeben 24 Forderungen'
);

-- Das Versprechen aus 0060: der Alt-Zweig rechnet unveraendert.
-- A = 400/1000 * 12000 / 12 = 400,00   B = 600/1000 * 12000 / 12 = 600,00
select is(
  (select s.betrag
     from public.sollstellung s
    where s.wirtschaftsplan_id = 'e1000000-0000-4000-8000-000000000073'::uuid
      and s.unit_id = 'd1000000-0000-4000-8000-000000000073'::uuid
      and s.monat = 1),
  400.00::numeric(12, 2),
  'Einheit A zahlt unveraendert 400,00 monatlich'
);

select is(
  (select s.betrag
     from public.sollstellung s
    where s.wirtschaftsplan_id = 'e1000000-0000-4000-8000-000000000073'::uuid
      and s.unit_id = 'd2000000-0000-4000-8000-000000000073'::uuid
      and s.monat = 1),
  600.00::numeric(12, 2),
  'Einheit B zahlt unveraendert 600,00 monatlich'
);

-- Der eigentliche Punkt: die Gemeinschaft traegt ihre Kosten vollstaendig.
select is(
  (select pg_catalog.sum(s.betrag)
     from public.sollstellung s
    where s.wirtschaftsplan_id = 'e1000000-0000-4000-8000-000000000073'::uuid),
  12000.00::numeric,
  'die Summe aller Sollstellungen entspricht den Gesamtkosten'
);

select lives_ok(
  $q$select public.activate_wirtschaftsplan(
       'e2000000-0000-4000-8000-000000000073'::uuid)$q$,
  'gemischte Nenner (1/2 + 250/1000 + 25/100) gehen durch — geprueft wird der Bruch, nicht der Zaehler'
);

select is(
  (select pg_catalog.sum(s.betrag)
     from public.sollstellung s
    where s.wirtschaftsplan_id = 'e2000000-0000-4000-8000-000000000073'::uuid),
  12000.00::numeric,
  'auch bei gemischten Nennern bleibt die Summe vollstaendig'
);

-- ============================================================================
-- Die Sperre wirkt vor dem Generator, also auch mit Positionen
-- ============================================================================

insert into public.verteilungsschluessel (id, tenant_id, weg_id, name)
values ('aa100000-0000-4000-8000-000000000073'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid,
        'c0000000-0000-4000-8000-000000000073'::uuid, 'MEA 0073');

insert into public.verteilungsschluessel_version
  (id, tenant_id, verteilungsschluessel_id, typ, quelle, gueltig_ab)
values ('ab100000-0000-4000-8000-000000000073'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid,
        'aa100000-0000-4000-8000-000000000073'::uuid,
        'mea', 'gesetz', date '2073-01-01');

insert into public.wirtschaftsplan (id, tenant_id, weg_id, jahr, bezeichnung, gesamtkosten)
values ('e5000000-0000-4000-8000-000000000073'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid,
        'c0000000-0000-4000-8000-000000000073'::uuid,
        2074, 'Plan Luecke mit Positionen', 12000);

insert into public.wirtschaftsplan_position
  (tenant_id, wirtschaftsplan_id, position, kostenart, jahresbetrag,
   verteilungsschluessel_version_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa73'::uuid,
        'e5000000-0000-4000-8000-000000000073'::uuid,
        1, 'Betriebskosten', 12000,
        'ab100000-0000-4000-8000-000000000073'::uuid);

-- Der Positions-Zweig wuerde normalisieren und damit die drei erfassten
-- Einheiten fuer 100 % zahlen lassen. Das verdeckt, dass eine Einheit fehlt —
-- deshalb greift die Sperre auch hier.
select throws_ok(
  $q$select public.activate_wirtschaftsplan(
       'e5000000-0000-4000-8000-000000000073'::uuid)$q$,
  '22023',
  null,
  'die Sperre wirkt auch auf Plaene mit Positionen'
);

-- ============================================================================
-- Agenten-Sperre bleibt vorrangig
-- ============================================================================

select pg_catalog.set_config('app.actor_type', 'agent', true);

select throws_ok(
  $q$select public.activate_wirtschaftsplan(
       'e1000000-0000-4000-8000-000000000073'::uuid)$q$,
  '42501',
  null,
  'Agenten koennen nicht aktivieren — die Pruefung bleibt vor der MEA-Sperre'
);

select pg_catalog.set_config('app.actor_type', 'user', true);

select * from finish();

rollback;
