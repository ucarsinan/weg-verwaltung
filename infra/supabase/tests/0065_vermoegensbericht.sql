-- WEG-Verwaltung pgTAP regression tests for 0065 Vermoegensbericht.
--
-- Scope:
--   - Katalog: zwei Tabellen mit RLS/FORCE RLS
--   - DER STICHTAG: eine Zahlung, die nach dem 31.12. wertgestellt wurde, senkt
--     die ausgewiesene Forderung NICHT — mit einer Gegenprobe gegen
--     public.offener_posten, die denselben Rueckstand bewusst anders sieht
--   - der Ruecklagenstand steht auf dem Stichtag, nicht auf heute
--   - Spitzen beschlossener Abrechnungen landen als Forderung bzw.
--     Verbindlichkeit im Bericht
--   - ein Sachwert darf ohne Betrag stehen, eine Forderung nicht
--   - Statuswechsel nur ueber die RPC, fertiggestellte Berichte sind gesperrt
--     und nicht loeschbar, ein Entwurf dagegen schon (Kaskade)
--   - Berichtigung loest den Vorgaenger ab; Agent-Writes blockiert
--
-- Laeuft in einer Transaktion und rollt alle Fixtures zurueck.

begin;

select plan(25);

-- ============================================================================
-- Katalog
-- ============================================================================

select is(
  (
    select count(*)::int
    from unnest(array[
      'public.vermoegensbericht',
      'public.vermoegensbericht_position'
    ]) as t(name)
    where to_regclass(t.name) is not null
  ),
  2,
  'beide Berichtstabellen existieren'
);

select is(
  (
    select count(*)::int
    from pg_catalog.pg_class c
    where c.oid = any(array[
      'public.vermoegensbericht'::regclass,
      'public.vermoegensbericht_position'::regclass
    ])
      and c.relrowsecurity
      and c.relforcerowsecurity
  ),
  2,
  'beide Tabellen haben RLS und FORCE RLS'
);

-- ============================================================================
-- Fixtures
-- ============================================================================

insert into public.tenant (id, name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65'::uuid, '0065 Tenant')
on conflict (id) do update
set name = excluded.name;

select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub', '11111111-1111-4111-8111-111111111165',
    'role', 'authenticated',
    'app_metadata', pg_catalog.jsonb_build_object(
      'tenant_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65',
      'role', 'tenant_admin'
    )
  )::text,
  true
);

insert into public.weg (id, tenant_id, name)
values
  ('c0000000-0000-4000-8000-000000000065'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65'::uuid, '0065 WEG'),
  ('c9000000-0000-4000-8000-000000000065'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65'::uuid, '0065 Fremde WEG');

-- MEA 400/1000 und 600/1000 — summieren sich auf 1.
insert into public.unit (id, tenant_id, weg_id, bezeichnung, mea_zaehler, mea_nenner)
values
  ('c1000000-0000-4000-8000-000000000065'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65'::uuid, 'c0000000-0000-4000-8000-000000000065'::uuid, 'Whg A', 400, 1000),
  ('c2000000-0000-4000-8000-000000000065'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65'::uuid, 'c0000000-0000-4000-8000-000000000065'::uuid, 'Whg B', 600, 1000),
  ('c8000000-0000-4000-8000-000000000065'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65'::uuid, 'c9000000-0000-4000-8000-000000000065'::uuid, 'Whg Fremd', 100, 100);

insert into public.verteilungsschluessel (id, tenant_id, weg_id, name)
values
  ('e1000000-0000-4000-8000-000000000065'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65'::uuid, 'c0000000-0000-4000-8000-000000000065'::uuid, 'MEA'),
  ('e2000000-0000-4000-8000-000000000065'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65'::uuid, 'c0000000-0000-4000-8000-000000000065'::uuid, 'Pro Einheit');

insert into public.verteilungsschluessel_version (
  id, tenant_id, verteilungsschluessel_id, typ, quelle, gueltig_ab, parameter
)
values
  ('e1100000-0000-4000-8000-000000000065'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65'::uuid, 'e1000000-0000-4000-8000-000000000065'::uuid, 'mea', 'gesetz', date '2000-01-01', '{}'::jsonb),
  ('e2100000-0000-4000-8000-000000000065'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65'::uuid, 'e2000000-0000-4000-8000-000000000065'::uuid, 'einheit', 'beschluss', date '2000-01-01', '{}'::jsonb);

-- Wirtschaftsplan 2090: 12.000 => Soll A 4.800, Soll B 7.200 im Jahr.
insert into public.wirtschaftsplan (id, tenant_id, weg_id, jahr, bezeichnung, gesamtkosten)
values (
  'a1000000-0000-4000-8000-000000000065'::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65'::uuid,
  'c0000000-0000-4000-8000-000000000065'::uuid,
  2090, 'Plan 2090', 12000.00
);

select pg_catalog.set_config('app.wirtschaftsplan_lifecycle_manager', '1', true);
update public.wirtschaftsplan
   set status = 'aktiv', aktiviert_am = now()
 where id = 'a1000000-0000-4000-8000-000000000065'::uuid;
select pg_catalog.set_config('app.wirtschaftsplan_lifecycle_manager', '', true);

select private._generate_sollstellungen_for_plan('a1000000-0000-4000-8000-000000000065'::uuid, 1);

-- Ruecklage: Eroeffnung 1.000 zum 31.12.2089, im Jahr 2090 +500 und -200,
-- und eine Zufuehrung von 999 im Maerz 2091 — die darf im Bericht 2090
-- nirgends auftauchen.
insert into public.ruecklage_bewegung (tenant_id, weg_id, datum, betrag, richtung)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65'::uuid, 'c0000000-0000-4000-8000-000000000065'::uuid, date '2089-12-31', 1000.00, 'anfangsbestand'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65'::uuid, 'c0000000-0000-4000-8000-000000000065'::uuid, date '2090-06-01',  500.00, 'zufuehrung'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65'::uuid, 'c0000000-0000-4000-8000-000000000065'::uuid, date '2090-08-01',  200.00, 'entnahme'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65'::uuid, 'c0000000-0000-4000-8000-000000000065'::uuid, date '2091-03-01',  999.00, 'zufuehrung');

-- Zwei Zahlungen ueber je 400 auf Whg A: eine im Januar 2090, eine im Maerz
-- 2091. Fuer den Stichtag 31.12.2090 zaehlt nur die erste.
insert into public.zahlung (id, tenant_id, weg_id, betrag, wert_datum, zahler_referenz)
values
  ('f1000000-0000-4000-8000-000000000065'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65'::uuid, 'c0000000-0000-4000-8000-000000000065'::uuid, 400.00, date '2090-01-05', 'Whg A Januar'),
  ('f2000000-0000-4000-8000-000000000065'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65'::uuid, 'c0000000-0000-4000-8000-000000000065'::uuid, 400.00, date '2091-03-15', 'Whg A Februar, verspaetet');

insert into public.zahlungszuordnung (tenant_id, zahlung_id, sollstellung_id, betrag)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65'::uuid,
    'f1000000-0000-4000-8000-000000000065'::uuid,
    (select s.id from public.sollstellung s
      where s.wirtschaftsplan_id = 'a1000000-0000-4000-8000-000000000065'::uuid
        and s.unit_id = 'c1000000-0000-4000-8000-000000000065'::uuid
        and s.monat = 1),
    400.00
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65'::uuid,
    'f2000000-0000-4000-8000-000000000065'::uuid,
    (select s.id from public.sollstellung s
      where s.wirtschaftsplan_id = 'a1000000-0000-4000-8000-000000000065'::uuid
        and s.unit_id = 'c1000000-0000-4000-8000-000000000065'::uuid
        and s.monat = 2),
    400.00
  );

-- Ausgaben 2090: 10.000 nach MEA (A 4.000 / B 6.000) und 2.000 pro Einheit
-- (je 1.000). Zusammen A 5.000, B 7.000 gegen Soll 4.800 / 7.200 — die eine
-- Einheit schuldet nach, die andere bekommt zurueck. Beide Zweige im Test.
insert into public.ausgabe (
  tenant_id, weg_id, betrag, wert_datum, empfaenger, kostenart, verteilungsschluessel_version_id
)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65'::uuid, 'c0000000-0000-4000-8000-000000000065'::uuid, 10000.00, date '2090-05-01', 'Verwalter', 'Verwaltung', 'e1100000-0000-4000-8000-000000000065'::uuid),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65'::uuid, 'c0000000-0000-4000-8000-000000000065'::uuid,  2000.00, date '2090-07-01', 'Kabel AG', 'Kabel',      'e2100000-0000-4000-8000-000000000065'::uuid);

select public.erstelle_abrechnung('c0000000-0000-4000-8000-000000000065'::uuid, 2090);

select public.beschliesse_abrechnung(
  (select a.id from public.abrechnung a
    where a.weg_id = 'c0000000-0000-4000-8000-000000000065'::uuid
      and a.jahr = 2090
      and a.status = 'entwurf'),
  date '2091-04-01'
);

-- ============================================================================
-- Erstellung und die abgeleiteten Groessen
-- ============================================================================

select lives_ok(
  $q$select public.erstelle_vermoegensbericht(
       'c0000000-0000-4000-8000-000000000065'::uuid, 2090)$q$,
  'der Vermoegensbericht laesst sich erstellen'
);

select is(
  (
    select b.stichtag
    from public.vermoegensbericht b
   where b.weg_id = 'c0000000-0000-4000-8000-000000000065'::uuid
     and b.jahr = 2090
  ),
  date '2090-12-31',
  'der Stichtag ist das Jahresende'
);

select is(
  (
    select p.betrag_anfang
    from public.vermoegensbericht_position p
    join public.vermoegensbericht b on b.id = p.vermoegensbericht_id
   where b.weg_id = 'c0000000-0000-4000-8000-000000000065'::uuid
     and b.jahr = 2090
     and p.abschnitt = 'ruecklage'
  ),
  1000.00::numeric(12, 2),
  'der Ruecklagen-Anfangsbestand steht auf dem 31.12. des Vorjahres'
);

select is(
  (
    select p.betrag
    from public.vermoegensbericht_position p
    join public.vermoegensbericht b on b.id = p.vermoegensbericht_id
   where b.weg_id = 'c0000000-0000-4000-8000-000000000065'::uuid
     and b.jahr = 2090
     and p.abschnitt = 'ruecklage'
  ),
  1300.00::numeric(12, 2),
  'der Ruecklagen-Endbestand ignoriert die Zufuehrung von 2091'
);

-- Der eigentliche Punkt dieses Vertrags.
select is(
  (
    select p.betrag
    from public.vermoegensbericht_position p
    join public.vermoegensbericht b on b.id = p.vermoegensbericht_id
   where b.weg_id = 'c0000000-0000-4000-8000-000000000065'::uuid
     and b.jahr = 2090
     and p.abschnitt = 'forderung'
     and p.unit_id = 'c1000000-0000-4000-8000-000000000065'::uuid
     and p.bezeichnung like 'Rückständige Hausgeldvorschüsse%'
  ),
  4400.00::numeric(12, 2),
  'die Forderung steht auf dem Stichtag: die Zahlung vom Maerz 2091 mindert sie nicht'
);

-- Gegenprobe: die Tagesansicht sieht denselben Rueckstand bewusst anders.
-- Waeren beide gleich, wuerde der Test oben nichts beweisen.
select is(
  (
    select sum(o.offen_betrag)::numeric(12, 2)
    from public.offener_posten o
   where o.unit_id = 'c1000000-0000-4000-8000-000000000065'::uuid
     and o.jahr = 2090
  ),
  4000.00::numeric(12, 2),
  'public.offener_posten zieht dieselbe Zahlung sehr wohl ab — der Unterschied ist echt'
);

select is(
  (
    select p.betrag
    from public.vermoegensbericht_position p
    join public.vermoegensbericht b on b.id = p.vermoegensbericht_id
   where b.weg_id = 'c0000000-0000-4000-8000-000000000065'::uuid
     and b.jahr = 2090
     and p.abschnitt = 'forderung'
     and p.unit_id = 'c2000000-0000-4000-8000-000000000065'::uuid
     and p.bezeichnung like 'Rückständige Hausgeldvorschüsse%'
  ),
  7200.00::numeric(12, 2),
  'die unbezahlte Einheit steht mit dem vollen Jahressoll in den Forderungen'
);

select is(
  (
    select p.betrag
    from public.vermoegensbericht_position p
    join public.vermoegensbericht b on b.id = p.vermoegensbericht_id
   where b.weg_id = 'c0000000-0000-4000-8000-000000000065'::uuid
     and b.jahr = 2090
     and p.abschnitt = 'forderung'
     and p.bezeichnung like 'Nachschuss Jahresabrechnung%'
  ),
  200.00::numeric(12, 2),
  'ein Nachschuss aus der beschlossenen Abrechnung wird zur Forderung'
);

select is(
  (
    select p.betrag
    from public.vermoegensbericht_position p
    join public.vermoegensbericht b on b.id = p.vermoegensbericht_id
   where b.weg_id = 'c0000000-0000-4000-8000-000000000065'::uuid
     and b.jahr = 2090
     and p.abschnitt = 'verbindlichkeit'
     and p.bezeichnung like 'Guthaben Jahresabrechnung%'
  ),
  200.00::numeric(12, 2),
  'ein Abrechnungsguthaben wird zur Verbindlichkeit gegenueber dem Eigentuemer'
);

-- ============================================================================
-- Was eine Position sein darf und was nicht
-- ============================================================================

select lives_ok(
  $q$insert into public.vermoegensbericht_position (
       tenant_id, vermoegensbericht_id, abschnitt, bezeichnung, quelle
     )
     values (
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65'::uuid,
       (select b.id from public.vermoegensbericht b
         where b.weg_id = 'c0000000-0000-4000-8000-000000000065'::uuid and b.jahr = 2090),
       'sachwert', 'Aufsitzrasenmäher', 'manuell'
     )$q$,
  'ein Sachwert darf ohne Betrag stehen — er wird genannt, nicht bewertet'
);

select throws_ok(
  $q$insert into public.vermoegensbericht_position (
       tenant_id, vermoegensbericht_id, abschnitt, bezeichnung, quelle
     )
     values (
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65'::uuid,
       (select b.id from public.vermoegensbericht b
         where b.weg_id = 'c0000000-0000-4000-8000-000000000065'::uuid and b.jahr = 2090),
       'forderung', 'Forderung ohne Zahl', 'manuell'
     )$q$,
  '23514',
  null,
  'eine Forderung ohne Betrag wird abgelehnt'
);

select throws_ok(
  $q$insert into public.vermoegensbericht_position (
       tenant_id, vermoegensbericht_id, abschnitt, bezeichnung, betrag_anfang, betrag, quelle
     )
     values (
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65'::uuid,
       (select b.id from public.vermoegensbericht b
         where b.weg_id = 'c0000000-0000-4000-8000-000000000065'::uuid and b.jahr = 2090),
       'forderung', 'Forderung mit Anfangsbestand', 10.00, 20.00, 'manuell'
     )$q$,
  '23514',
  null,
  'ein Anfangsbestand ergibt nur fuer Konten und Ruecklagen einen Sinn'
);

select throws_ok(
  $q$insert into public.vermoegensbericht_position (
       tenant_id, vermoegensbericht_id, abschnitt, bezeichnung, betrag, quelle, unit_id
     )
     values (
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65'::uuid,
       (select b.id from public.vermoegensbericht b
         where b.weg_id = 'c0000000-0000-4000-8000-000000000065'::uuid and b.jahr = 2090),
       'forderung', 'Fremde Einheit', 10.00, 'manuell',
       'c8000000-0000-4000-8000-000000000065'::uuid
     )$q$,
  '23514',
  null,
  'eine Einheit einer fremden WEG wird abgelehnt'
);

-- ============================================================================
-- Lebenszyklus
-- ============================================================================

select throws_ok(
  $q$update public.vermoegensbericht
        set status = 'erstellt', erstellt_am = date '2091-05-01'
      where weg_id = 'c0000000-0000-4000-8000-000000000065'::uuid
        and jahr = 2090$q$,
  '42501',
  null,
  'ein direkter Statuswechsel am Bericht vorbei wird blockiert'
);

select lives_ok(
  $q$select public.stelle_vermoegensbericht_fertig(
       (select b.id from public.vermoegensbericht b
         where b.weg_id = 'c0000000-0000-4000-8000-000000000065'::uuid
           and b.jahr = 2090 and b.status = 'entwurf'),
       date '2091-05-01')$q$,
  'der Bericht laesst sich fertigstellen'
);

select throws_ok(
  $q$insert into public.vermoegensbericht_position (
       tenant_id, vermoegensbericht_id, abschnitt, bezeichnung, betrag, quelle
     )
     values (
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa65'::uuid,
       (select b.id from public.vermoegensbericht b
         where b.weg_id = 'c0000000-0000-4000-8000-000000000065'::uuid
           and b.jahr = 2090 and b.status = 'erstellt'),
       'konto', 'Nachtraeglich', 100.00, 'manuell'
     )$q$,
  '23514',
  null,
  'ein fertiggestellter Bericht nimmt keine Position mehr an'
);

select throws_ok(
  $q$delete from public.vermoegensbericht
      where weg_id = 'c0000000-0000-4000-8000-000000000065'::uuid
        and jahr = 2090 and status = 'erstellt'$q$,
  '23514',
  null,
  'ein fertiggestellter Bericht laesst sich nicht loeschen'
);

-- Berichtigung: jeder Eigentuemer darf einen richtigen Bericht verlangen.
select lives_ok(
  $q$select public.erstelle_vermoegensbericht(
       'c0000000-0000-4000-8000-000000000065'::uuid, 2090)$q$,
  'fuer dasselbe Jahr laesst sich ein Berichtigungsentwurf anlegen'
);

select lives_ok(
  $q$select public.stelle_vermoegensbericht_fertig(
       (select b.id from public.vermoegensbericht b
         where b.weg_id = 'c0000000-0000-4000-8000-000000000065'::uuid
           and b.jahr = 2090 and b.status = 'entwurf'),
       date '2091-06-01')$q$,
  'die Berichtigung laesst sich fertigstellen'
);

select is(
  (
    select pg_catalog.concat_ws(
      '/',
      count(*) filter (where status = 'erstellt'),
      count(*) filter (where status = 'abgeloest'),
      max(version_nr) filter (where status = 'erstellt')
    )
    from public.vermoegensbericht
   where weg_id = 'c0000000-0000-4000-8000-000000000065'::uuid
     and jahr = 2090
  ),
  '1/1/2',
  'nach der Berichtigung ist genau einer erstellt, einer abgeloest, Version 2'
);

-- Ein Entwurf muss loeschbar bleiben. Er hat mindestens die Ruecklagenzeile,
-- die Kaskade laeuft also wirklich durch den Positions-Guard.
select lives_ok(
  $q$select public.erstelle_vermoegensbericht(
       'c0000000-0000-4000-8000-000000000065'::uuid, 2089)$q$,
  'ein Bericht fuer ein Jahr ohne Plan laesst sich anlegen'
);

select lives_ok(
  $q$delete from public.vermoegensbericht
      where weg_id = 'c0000000-0000-4000-8000-000000000065'::uuid
        and jahr = 2089$q$,
  'ein Entwurf laesst sich samt Positionen loeschen — die Kaskade blockiert nicht'
);

-- ============================================================================
-- Agent-Guard
-- ============================================================================

select pg_catalog.set_config('app.actor_type', 'agent', true);

select throws_ok(
  $q$select public.erstelle_vermoegensbericht(
       'c0000000-0000-4000-8000-000000000065'::uuid, 2088)$q$,
  '42501',
  null,
  'Agenten koennen keinen Vermoegensbericht erstellen'
);

select pg_catalog.set_config('app.actor_type', 'user', true);

select * from finish();

rollback;
