-- WEG-Verwaltung pgTAP regression tests for 0066 loeschbarer Abrechnungsentwurf.
--
-- Scope:
--   - der BEFORE-DELETE-Trigger auf public.abrechnung existiert
--   - ein Entwurf laesst sich samt Kostenpositionen und Anteilen loeschen:
--     die Kaskade laeuft durch den Positions-Guard, ohne zu blockieren
--   - eine beschlossene Abrechnung laesst sich nicht loeschen (23514)
--   - eine abgeloeste Abrechnung ebenfalls nicht — sie ist Teil der
--     Beschlusshistorie
--   - die Kaskaden-Ausnahme oeffnet den normalen Pfad nicht: eine Position
--     einer beschlossenen Abrechnung bleibt direkt unloeschbar
--
-- Laeuft in einer Transaktion und rollt alle Fixtures zurueck.

begin;

select plan(13);

-- ============================================================================
-- Katalog
-- ============================================================================

-- tgtype-Bits: 1 = ROW, 2 = BEFORE, 8 = DELETE.
select is(
  (
    select count(*)::int
    from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.abrechnung'::regclass
      and t.tgname = 'abrechnung_delete_draft_only'
      and not t.tgisinternal
      and (t.tgtype & 2) = 2
      and (t.tgtype & 8) = 8
  ),
  1,
  'auf public.abrechnung liegt ein BEFORE-DELETE-Trigger'
);

-- ============================================================================
-- Fixtures
-- ============================================================================

insert into public.tenant (id, name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa66'::uuid, '0066 Tenant')
on conflict (id) do update
set name = excluded.name;

-- erstelle_abrechnung/beschliesse_abrechnung lesen public.tenant_id() aus dem
-- JWT-Claim — im Test also einmal setzen.
select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub', '11111111-1111-4111-8111-111111111166',
    'role', 'authenticated',
    'app_metadata', pg_catalog.jsonb_build_object(
      'tenant_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa66',
      'role', 'tenant_admin'
    )
  )::text,
  true
);

insert into public.weg (id, tenant_id, name)
values (
  'c0000000-0000-4000-8000-000000000066'::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa66'::uuid,
  '0066 WEG'
);

insert into public.unit (id, tenant_id, weg_id, bezeichnung, mea_zaehler, mea_nenner)
values
  ('c1000000-0000-4000-8000-000000000066'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa66'::uuid, 'c0000000-0000-4000-8000-000000000066'::uuid, 'Whg A', 400, 1000),
  ('c2000000-0000-4000-8000-000000000066'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa66'::uuid, 'c0000000-0000-4000-8000-000000000066'::uuid, 'Whg B', 600, 1000);

insert into public.verteilungsschluessel (id, tenant_id, weg_id, name)
values
  ('e1000000-0000-4000-8000-000000000066'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa66'::uuid, 'c0000000-0000-4000-8000-000000000066'::uuid, 'MEA'),
  ('e2000000-0000-4000-8000-000000000066'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa66'::uuid, 'c0000000-0000-4000-8000-000000000066'::uuid, 'Pro Einheit');

insert into public.verteilungsschluessel_version (
  id, tenant_id, verteilungsschluessel_id, typ, quelle, gueltig_ab, parameter
)
values
  ('e1100000-0000-4000-8000-000000000066'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa66'::uuid, 'e1000000-0000-4000-8000-000000000066'::uuid, 'mea', 'gesetz', date '2000-01-01', '{}'::jsonb),
  ('e2100000-0000-4000-8000-000000000066'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa66'::uuid, 'e2000000-0000-4000-8000-000000000066'::uuid, 'einheit', 'beschluss', date '2000-01-01', '{}'::jsonb);

-- Zwei Kostenarten mit verschiedenen Schluesseln => 2 Kostenpositionen,
-- je 2 Anteile. Ohne diese Kinder waere der Kaskaden-Nachweis leer.
insert into public.ausgabe (
  tenant_id, weg_id, betrag, wert_datum, empfaenger, kostenart, verteilungsschluessel_version_id
)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa66'::uuid, 'c0000000-0000-4000-8000-000000000066'::uuid, 10000.00, date '2090-05-01', 'Verwalter', 'Verwaltung', 'e1100000-0000-4000-8000-000000000066'::uuid),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa66'::uuid, 'c0000000-0000-4000-8000-000000000066'::uuid, 2000.00, date '2090-07-01', 'Kabel AG', 'Kabel', 'e2100000-0000-4000-8000-000000000066'::uuid);

select public.erstelle_abrechnung(
  'c0000000-0000-4000-8000-000000000066'::uuid, 2090);

-- ============================================================================
-- Ein Entwurf ist loeschbar — der eigentliche Fehler aus 0063
-- ============================================================================

select is(
  pg_catalog.concat(
    (
      select count(*)
      from public.abrechnung_kostenposition k
      join public.abrechnung a on a.id = k.abrechnung_id
     where a.weg_id = 'c0000000-0000-4000-8000-000000000066'::uuid
    ),
    '/',
    (
      select count(*)
      from public.abrechnung_anteil an
     where an.unit_id in (
       'c1000000-0000-4000-8000-000000000066'::uuid,
       'c2000000-0000-4000-8000-000000000066'::uuid
     )
    )
  ),
  '2/4',
  'der Entwurf traegt Kostenpositionen und Anteile — die Kaskade hat etwas zu raeumen'
);

select lives_ok(
  $q$delete from public.abrechnung
      where weg_id = 'c0000000-0000-4000-8000-000000000066'::uuid
        and status = 'entwurf'$q$,
  'ein Abrechnungsentwurf laesst sich loeschen — die Kaskade blockiert nicht'
);

select is(
  pg_catalog.concat(
    (
      select count(*)
      from public.abrechnung a
     where a.weg_id = 'c0000000-0000-4000-8000-000000000066'::uuid
    ),
    '/',
    (
      select count(*)
      from public.abrechnung_kostenposition k
     where k.verteilungsschluessel_version_id in (
       'e1100000-0000-4000-8000-000000000066'::uuid,
       'e2100000-0000-4000-8000-000000000066'::uuid
     )
    ),
    '/',
    (
      select count(*)
      from public.abrechnung_anteil an
     where an.unit_id in (
       'c1000000-0000-4000-8000-000000000066'::uuid,
       'c2000000-0000-4000-8000-000000000066'::uuid
     )
    )
  ),
  '0/0/0',
  'Kopf, Kostenpositionen und Anteile sind restlos weg'
);

-- ============================================================================
-- Eine beschlossene Abrechnung bleibt unloeschbar
-- ============================================================================

select lives_ok(
  $q$select public.erstelle_abrechnung(
       'c0000000-0000-4000-8000-000000000066'::uuid, 2090)$q$,
  'nach dem Loeschen laesst sich ein neuer Entwurf fuer dasselbe Jahr anlegen'
);

select lives_ok(
  $q$select public.beschliesse_abrechnung(
       (select id from public.abrechnung
         where weg_id = 'c0000000-0000-4000-8000-000000000066'::uuid
           and status = 'entwurf'),
       date '2091-03-15')$q$,
  'der Entwurf laesst sich beschliessen'
);

select throws_ok(
  $q$delete from public.abrechnung
      where weg_id = 'c0000000-0000-4000-8000-000000000066'::uuid
        and status = 'beschlossen'$q$,
  '23514',
  null,
  'eine beschlossene Abrechnung laesst sich nicht loeschen'
);

select is(
  pg_catalog.concat(
    (
      select count(*)
      from public.abrechnung a
     where a.weg_id = 'c0000000-0000-4000-8000-000000000066'::uuid
       and a.status = 'beschlossen'
    ),
    '/',
    (
      select count(*)
      from public.abrechnung_kostenposition k
      join public.abrechnung a on a.id = k.abrechnung_id
     where a.weg_id = 'c0000000-0000-4000-8000-000000000066'::uuid
    )
  ),
  '1/2',
  'die beschlossene Abrechnung steht nach dem abgelehnten Loeschen unveraendert da'
);

-- Die Kaskaden-Ausnahme darf den normalen Pfad nicht oeffnen: solange die
-- Kopfzeile existiert, liest der Guard einen Status und greift.
select throws_ok(
  $q$delete from public.abrechnung_kostenposition
      where kostenart = 'Verwaltung'
        and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa66'::uuid$q$,
  '23514',
  null,
  'eine einzelne Position einer beschlossenen Abrechnung bleibt unloeschbar'
);

-- ============================================================================
-- Eine abgeloeste Abrechnung ist Historie und bleibt ebenfalls stehen
-- ============================================================================

select lives_ok(
  $q$select public.erstelle_abrechnung(
       'c0000000-0000-4000-8000-000000000066'::uuid, 2090)$q$,
  'fuer einen Zweitbeschluss laesst sich ein neuer Entwurf anlegen'
);

select lives_ok(
  $q$select public.beschliesse_abrechnung(
       (select id from public.abrechnung
         where weg_id = 'c0000000-0000-4000-8000-000000000066'::uuid
           and status = 'entwurf'),
       date '2091-09-20')$q$,
  'der Zweitbeschluss loest den Erstbeschluss ab'
);

select is(
  (
    select count(*)::int
    from public.abrechnung a
   where a.weg_id = 'c0000000-0000-4000-8000-000000000066'::uuid
     and a.status = 'abgeloest'
  ),
  1,
  'genau eine Abrechnung steht auf abgeloest'
);

select throws_ok(
  $q$delete from public.abrechnung
      where weg_id = 'c0000000-0000-4000-8000-000000000066'::uuid
        and status = 'abgeloest'$q$,
  '23514',
  null,
  'eine abgeloeste Abrechnung laesst sich nicht loeschen'
);

select * from finish();

rollback;
