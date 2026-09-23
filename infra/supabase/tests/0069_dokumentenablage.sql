-- WEG-Verwaltung pgTAP regression contract for 0069 Dokumentenablage.
--
-- Scope:
--   - doc_typ kennt die neuen Arten und lehnt Unbekanntes ab
--   - dokument_datum ist Pflicht
--   - aufbewahrungsregel ist mandantengetrennt, auditiert, agent-gesperrt
--   - die Frist rechnet ab dem Jahresende des Dokumentdatums (§ 147 Abs. 4 AO)
--   - die Mandantenregel schlaegt den gesetzlichen Rueckfall, und die Sicht
--     sagt, welche von beiden gegriffen hat
--
-- Die Fristrechnung wird von Hand nachgerechnet, nicht auf "laeuft durch"
-- geprueft: Rechnung vom 15.03.2019 mit 8 Jahren ergibt 2027-12-31, weil die
-- Frist erst zum Schluss des Kalenderjahrs 2019 beginnt.

begin;

select plan(11);

-- ===========================================================================
-- Fixtures
-- ===========================================================================

insert into public.tenant (id, name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa69'::uuid, '0069 Tenant A'),
       ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb69'::uuid, '0069 Tenant B')
on conflict (id) do update set name = excluded.name;

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111169",'
  '"role":"authenticated",'
  '"app_metadata":{"tenant_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa69",'
  '"role":"verwalter_mitarbeiter"}}',
  true
);

-- Ohne den Rollenwechsel bleibt die Session "postgres" — der Table-Owner mit
-- BYPASSRLS, fuer den FORCE ROW LEVEL SECURITY wirkungslos ist. Erst als
-- "authenticated" greifen die Policies ueberhaupt (Muster aus 0057).
set local role authenticated;

insert into public.weg (tenant_id, id, name, adresse)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa69'::uuid,
        'cccccccc-cccc-4ccc-8ccc-cccccccccc69'::uuid,
        '0069 WEG', 'Ablageweg 69');

-- ===========================================================================
-- 1. Die neuen Dokumentarten
-- ===========================================================================

select lives_ok(
  $$insert into public.document (tenant_id, weg_id, doc_typ, titel, dokument_datum)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa69'::uuid,
            'cccccccc-cccc-4ccc-8ccc-cccccccccc69'::uuid,
            'rechnung', 'Heizungswartung 2019', date '2019-03-15')$$,
  'doc_typ akzeptiert die neue Art rechnung'
);

select throws_ok(
  $$insert into public.document (tenant_id, weg_id, doc_typ, titel, dokument_datum)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa69'::uuid,
            'cccccccc-cccc-4ccc-8ccc-cccccccccc69'::uuid,
            'quittung', 'Unbekannte Art', date '2019-03-15')$$,
  '23514',
  null,
  'eine unbekannte Dokumentart wird abgelehnt'
);

select throws_ok(
  $$insert into public.document (tenant_id, weg_id, doc_typ, titel)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa69'::uuid,
            'cccccccc-cccc-4ccc-8ccc-cccccccccc69'::uuid,
            'doku', 'Ohne Datum')$$,
  '23502',
  null,
  'dokument_datum ist Pflicht'
);

-- ===========================================================================
-- 2. Der gesetzliche Rueckfall
-- ===========================================================================

select is(
  (select r.jahre from private._aufbewahrung_jahre(
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa69'::uuid, 'rechnung') as r),
  8,
  'ohne Mandantenregel gilt der gesetzliche Rueckfall von 8 Jahren'
);

select is(
  (select r.herkunft from private._aufbewahrung_jahre(
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa69'::uuid, 'rechnung') as r),
  'gesetzlicher_rueckfall',
  'die Herkunft benennt den Rueckfall ausdruecklich'
);

select is(
  (select r.jahre from private._aufbewahrung_jahre(
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa69'::uuid, 'protokoll') as r),
  null,
  'Versammlungsprotokolle sind dauerhaft aufzubewahren (jahre is null)'
);

-- ===========================================================================
-- 3. Die Fristrechnung, von Hand nachgerechnet
-- ===========================================================================

-- Rechnung vom 15.03.2019, Rueckfall 8 Jahre.
-- Frist beginnt zum Schluss des Kalenderjahrs 2019 -> 31.12.2019
-- 31.12.2019 + 8 Jahre -> 31.12.2027
select is(
  (select u.aufzubewahren_bis from public.dokument_uebersicht as u
    where u.titel = 'Heizungswartung 2019'),
  date '2027-12-31',
  'die Frist rechnet ab dem Jahresende des Dokumentdatums, nicht ab dem Hochladen'
);

insert into public.document (tenant_id, weg_id, doc_typ, titel, dokument_datum)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa69'::uuid,
        'cccccccc-cccc-4ccc-8ccc-cccccccccc69'::uuid,
        'protokoll', 'Versammlung 2019', date '2019-06-01');

select is(
  (select u.aufzubewahren_bis from public.dokument_uebersicht as u
    where u.titel = 'Versammlung 2019'),
  null,
  'dauerhaft aufzubewahrende Unterlagen tragen kein Fristende'
);

-- ===========================================================================
-- 4. Die Mandantenregel schlaegt den Rueckfall
-- ===========================================================================

insert into public.aufbewahrungsregel (tenant_id, doc_typ, jahre, rechtsgrundlage)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa69'::uuid, 'rechnung', 10,
        'eigene Rechtsberatung');

select is(
  (select u.aufzubewahren_bis from public.dokument_uebersicht as u
    where u.titel = 'Heizungswartung 2019'),
  date '2029-12-31',
  'eine Mandantenregel von 10 Jahren verschiebt die Frist auf 2029'
);

select is(
  (select u.frist_herkunft from public.dokument_uebersicht as u
    where u.titel = 'Heizungswartung 2019'),
  'mandantenregel',
  'die Sicht benennt die Mandantenregel als Quelle'
);

-- ===========================================================================
-- 5. Mandantentrennung der Regeltabelle
-- ===========================================================================

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222269",'
  '"role":"authenticated",'
  '"app_metadata":{"tenant_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb69",'
  '"role":"verwalter_mitarbeiter"}}',
  true
);

set local role authenticated;

select is(
  (select count(*)::int from public.aufbewahrungsregel),
  0,
  'ein fremder Mandant sieht keine Regel des anderen'
);

select * from finish();

rollback;
