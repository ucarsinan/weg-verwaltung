-- WEG-Verwaltung pgTAP regression contract for 0069 Dokumentenablage.
--
-- Scope:
--   - doc_typ kennt die neuen Arten und lehnt Unbekanntes ab
--   - dokument_datum ist Pflicht
--   - aufbewahrungsregel ist mandantengetrennt, auditiert, agent-gesperrt
--   - die Frist rechnet ab dem Jahresende des Dokumentdatums (§ 147 Abs. 4 AO)
--   - die Mandantenregel schlaegt den gesetzlichen Rueckfall, und die Sicht
--     sagt, welche von beiden gegriffen hat
--   - die Agent-Sperre und die Audit-Emitter auf aufbewahrungsregel und
--     document tun wirklich etwas (Abschnitte 6 und 7, nachgetragen — siehe
--     unten)
--   - public.dokument_entfernen (0072) entfernt nur eigene Dokumente, nur in
--     der richtigen WEG, meldet ehrlich ob etwas passiert ist und landet im
--     Audit-Trail (Abschnitte 8-10)
--
-- Die Fristrechnung wird von Hand nachgerechnet, nicht auf "laeuft durch"
-- geprueft: Rechnung vom 15.03.2019 mit 8 Jahren ergibt 2027-12-31, weil die
-- Frist erst zum Schluss des Kalenderjahrs 2019 beginnt.
--
-- Fix Round 1 (Review): private._aufbewahrung_jahre wurde entfernt und in
-- public.dokument_uebersicht eingebettet (kein schemaweites Grant auf
-- "private", kein SECURITY DEFINER, kein Parameter-Guard mehr noetig — RLS
-- auf aufbewahrungsregel filtert selbst). Die frueheren Assertions 4-6 riefen
-- die Funktion direkt auf; sie pruefen dieselben drei Fakten jetzt ueber die
-- Sicht. Assertion 11 ist neu (Review Minor 9): eine Mandantenregel mit
-- jahre = null muss als "dauerhaft" UND als "mandantenregel" erkennbar
-- bleiben — ein coalesce(r.jahre, ...) haette das verwechselt.
--
-- Nachtrag 0072 (Branch-Review): dieser Vertrag nannte die Agent-Sperre und
-- die Audit-Emitter von Anfang an im Scope, sicherte aber beides nie zu —
-- ebenso wenig wie docs/specs/2026-09-22-dokumentenablage-design.md und
-- docs/09-tom-art32.md, die sich auf diesen Vertrag berufen. Abschnitte 6
-- und 7 holen das nach. Abschnitte 8-10 decken public.dokument_entfernen
-- ab, die neue SECURITY-DEFINER-Funktion aus 0072: sie existiert, weil die
-- SELECT-Policy aus 0015 ("deleted_at is null") jedes UPDATE ablehnt, das
-- deleted_at setzt — die neue Zeile waere unter ihrer eigenen Policy
-- unsichtbar. 0072 bringt keinen eigenen Vertrag mit; die Zusicherungen
-- gehoeren fachlich hierher, zur Dokumentenablage.

begin;

select plan(26);

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
-- 2. Der gesetzliche Rueckfall, ueber die Sicht (nicht mehr per Funktion)
-- ===========================================================================

-- Fixture fuer Test 6 (dauerhafte Aufbewahrung): das Protokoll wird hier
-- schon angelegt, weil es in dieser Sektion gebraucht wird.
insert into public.document (tenant_id, weg_id, doc_typ, titel, dokument_datum)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa69'::uuid,
        'cccccccc-cccc-4ccc-8ccc-cccccccccc69'::uuid,
        'protokoll', 'Versammlung 2019', date '2019-06-01');

select is(
  (select u.aufzubewahren_bis from public.dokument_uebersicht as u
    where u.titel = 'Heizungswartung 2019'),
  date '2027-12-31',
  'ohne Mandantenregel gilt der gesetzliche Rueckfall von 8 Jahren'
);

select is(
  (select u.frist_herkunft from public.dokument_uebersicht as u
    where u.titel = 'Heizungswartung 2019'),
  'gesetzlicher_rueckfall',
  'die Sicht benennt den Rueckfall ausdruecklich'
);

select is(
  (select u.aufzubewahren_bis from public.dokument_uebersicht as u
    where u.titel = 'Versammlung 2019'),
  null,
  'Versammlungsprotokolle sind dauerhaft aufzubewahren (jahre ist im Rueckfall null)'
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
-- 5. Eine Mandantenregel mit jahre = null bedeutet dauerhaft (Review Minor 9)
-- ===========================================================================

-- 'vertrag' faellt ohne Regel unter den Rueckfall von 10 Jahren (gegriffen).
-- Ein coalesce(r.jahre, <rueckfall>) wuerde diese Zeile mit dem Rueckfall
-- verwechseln, weil beide "null-oder-nicht" nicht unterscheiden koennen —
-- deshalb entscheidet r.id (Existenz der Regelzeile), nicht r.jahre.
insert into public.aufbewahrungsregel (tenant_id, doc_typ, jahre, rechtsgrundlage)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa69'::uuid, 'vertrag', null,
        'Verwalter-Entscheid: Vertraege dauerhaft aufbewahren');

insert into public.document (tenant_id, weg_id, doc_typ, titel, dokument_datum)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa69'::uuid,
        'cccccccc-cccc-4ccc-8ccc-cccccccccc69'::uuid,
        'vertrag', 'Dauervertrag Hausmeister', date '2020-01-01');

select ok(
  (select u.aufzubewahren_bis is null and u.frist_herkunft = 'mandantenregel'
     from public.dokument_uebersicht as u
    where u.titel = 'Dauervertrag Hausmeister'),
  'eine Mandantenregel mit jahre = null bedeutet dauerhaft und bleibt als Mandantenregel erkennbar, nicht als Rueckfall'
);

-- ===========================================================================
-- 6. Agent-Sperre auf aufbewahrungsregel — Nachtrag
-- ===========================================================================
--
-- 0069 haengt public.tg_finance_allocation_block_agent_writes als
-- aufbewahrungsregel_block_agent_writes an alle drei Schreiboperationen
-- (0069, Zeilen 154-158). Der Scope-Kommentar dieses Vertrags, die Spec
-- (docs/specs/2026-09-22-dokumentenablage-design.md) und docs/09-tom-art32.md
-- zaehlten die Sperre als abgedeckt — zugesichert war sie nie. Das ist die
-- schlechtere Sorte Luecke: ein Compliance-Dokument stuetzte sich auf einen
-- Vertrag, der dazu schwieg.
--
-- Jede der drei Zusicherungen faellt, sobald die entsprechende Klausel aus
-- der Trigger-Definition verschwindet — ohne sie geht die Anweisung durch,
-- statt mit 42501 zu scheitern. UPDATE und DELETE zielen bewusst auf die
-- vorhandene 'vertrag'-Regel: eine Anweisung ohne Treffer wuerde den
-- Row-Level-Trigger gar nicht erst ausloesen und die Zusicherung wertlos
-- machen.

select pg_catalog.set_config('app.actor_type', 'agent', true);

select throws_ok(
  $q$insert into public.aufbewahrungsregel (tenant_id, doc_typ, jahre)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa69'::uuid, 'korrespondenz', 3)$q$,
  '42501',
  null,
  'ein Agent kann keine Aufbewahrungsregel anlegen'
);

select throws_ok(
  $q$update public.aufbewahrungsregel set jahre = 3
      where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa69'::uuid
        and doc_typ = 'vertrag'$q$,
  '42501',
  null,
  'ein Agent kann eine vorhandene Aufbewahrungsregel nicht aendern'
);

select throws_ok(
  $q$delete from public.aufbewahrungsregel
      where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa69'::uuid
        and doc_typ = 'vertrag'$q$,
  '42501',
  null,
  'ein Agent kann eine vorhandene Aufbewahrungsregel nicht loeschen'
);

select pg_catalog.set_config('app.actor_type', 'user', true);

-- ===========================================================================
-- 7. Audit-Emitter auf aufbewahrungsregel und document — Nachtrag
-- ===========================================================================
--
-- 0069 haengt audit_writer.tg_emit_audit_event an beide Tabellen (Zeilen
-- 164-167 fuer aufbewahrungsregel, 170-174 fuer document — dort zum ersten
-- Mal ueberhaupt). Auch das stand im Scope, in der Spec und in
-- docs/09-tom-art32.md, aber in keiner Zusicherung. Muster: 0059.
--
-- Die Einfuegungen stehen bewusst in eigenen Anweisungen: der AFTER-Trigger
-- schreibt erst danach, eine Zusicherung im selben Statement saehe die
-- Audit-Zeile nicht (derselbe Grund wie in 0059).

insert into public.aufbewahrungsregel (id, tenant_id, doc_typ, jahre, rechtsgrundlage)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee69'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa69'::uuid, 'bescheid', 7,
        'Audit-Probe');

select is(
  (select count(*)::int from public.audit_event as ae
    where ae.entity_typ = 'aufbewahrungsregel'
      and ae.entity_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee69'::uuid
      and ae.action = 'insert'),
  1,
  'eine neue Aufbewahrungsregel erzeugt genau eine audit_event-Zeile'
);

-- Dieses Dokument traegt den Rest des Abschnitts: es wird gleich versucht
-- zu entfernen, einmal vom fremden Mandanten, einmal vom eigenen.
insert into public.document (id, tenant_id, weg_id, doc_typ, titel, dokument_datum)
values ('ffffffff-ffff-4fff-8fff-ffffffffff69'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa69'::uuid,
        'cccccccc-cccc-4ccc-8ccc-cccccccccc69'::uuid,
        'doku', 'Entfernbarer Beleg', date '2021-09-01');

select is(
  (select count(*)::int from public.audit_event as ae
    where ae.entity_typ = 'document'
      and ae.entity_id = 'ffffffff-ffff-4fff-8fff-ffffffffff69'::uuid
      and ae.action = 'insert'),
  1,
  'ein neues Dokument erzeugt genau eine audit_event-Zeile (0069 haengte den Emitter erstmals an document)'
);

-- ===========================================================================
-- 8. public.dokument_entfernen (0072) — der Soft-Delete, den RLS allein
--    unmoeglich macht
-- ===========================================================================
--
-- Warum es die Funktion ueberhaupt gibt: die SELECT-Policy aus 0015 filtert
-- "deleted_at is null" (0015, Zeilen 192-194). PostgreSQL verlangt, dass die
-- neue Zeile eines UPDATE unter der SELECT-Policy sichtbar bleibt — ein
-- UPDATE, das deleted_at setzt, macht sie unsichtbar und wird mit
-- "new row violates row-level security policy for table \"document\""
-- abgelehnt. Die Policy bleibt bewusst unveraendert; der Schreibpfad
-- wandert in eine SECURITY-DEFINER-Funktion (0072).

select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    pg_catalog.to_regprocedure('public.dokument_entfernen(uuid,uuid)'),
    'EXECUTE')
  and not pg_catalog.has_function_privilege(
    'anon',
    pg_catalog.to_regprocedure('public.dokument_entfernen(uuid,uuid)'),
    'EXECUTE')
  and not pg_catalog.has_function_privilege(
    'service_role',
    pg_catalog.to_regprocedure('public.dokument_entfernen(uuid,uuid)'),
    'EXECUTE'),
  'nur authenticated darf dokument_entfernen aufrufen, anon und service_role nicht'
);

-- Die weg_id-Einschraenkung der bisherigen Server Action (.eq("id", ...)
-- .eq("weg_id", ...)) darf beim Umzug in die Funktion nicht verloren gehen.
select is(
  public.dokument_entfernen(
    'ffffffff-ffff-4fff-8fff-ffffffffff69'::uuid,
    '00000000-0000-4000-8000-000000000069'::uuid),
  false,
  'eine falsche weg_id entfernt nichts und meldet false statt eines stillen Erfolgs'
);

-- public.document traegt KEINEN *_block_agent_writes-Trigger — anders als
-- aufbewahrungsregel (Abschnitt 6). Der einzige Guard auf diesem Pfad sitzt
-- im Funktionskoerper; faellt er weg, entfernt ein Agent Unterlagen.
--
-- Der Agent bekommt bewusst ein EIGENES Dokument zum Angreifen. Faellt der
-- Guard weg, geht der Aufruf durch und entfernt, worauf er zeigt — zeigte er
-- auf 'Entfernbarer Beleg', waere dieser fuer die Abschnitte 9 und 10 schon
-- weg und deren Zusicherungen wuerden vakuos bestehen, statt den echten
-- Fehler zu zeigen. Ein kaputter Guard darf keine andere Zusicherung
-- verdecken.
insert into public.document (id, tenant_id, weg_id, doc_typ, titel, dokument_datum)
values ('ffffffff-ffff-4fff-8fff-ffffffffaa69'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa69'::uuid,
        'cccccccc-cccc-4ccc-8ccc-cccccccccc69'::uuid,
        'doku', 'Agent-Probe', date '2021-09-02');

select pg_catalog.set_config('app.actor_type', 'agent', true);

select throws_ok(
  $q$select public.dokument_entfernen(
       'ffffffff-ffff-4fff-8fff-ffffffffaa69'::uuid,
       'cccccccc-cccc-4ccc-8ccc-cccccccccc69'::uuid)$q$,
  '42501',
  null,
  'ein Agent kann kein Dokument entfernen'
);

select pg_catalog.set_config('app.actor_type', 'user', true);

-- ===========================================================================
-- 9. Mandantentrennung der Regeltabelle
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

-- Der eigentliche Grund, warum die Funktion den Mandanten selbst aufloest
-- statt ihn als Parameter entgegenzunehmen: sie laeuft als Owner mit
-- BYPASSRLS, RLS auf public.document greift in ihr also NICHT. Bleibt
-- "tenant_id = v_tenant_id" in der WHERE-Klausel weg, entfernt jeder
-- angemeldete Nutzer mit einer geratenen dokument_id die Unterlagen eines
-- fremden Mandanten. Diese Zusicherung ist die einzige, die das abfaengt.
select is(
  public.dokument_entfernen(
    'ffffffff-ffff-4fff-8fff-ffffffffff69'::uuid,
    'cccccccc-cccc-4ccc-8ccc-cccccccccc69'::uuid),
  false,
  'ein fremder Mandant entfernt das Dokument eines anderen nicht, auch mit korrekter dokument_id UND weg_id'
);

-- ===========================================================================
-- 10. Zurueck beim eigenen Mandanten: der ganze Lebenslauf des Soft-Delete
-- ===========================================================================

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111169",'
  '"role":"authenticated",'
  '"app_metadata":{"tenant_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa69",'
  '"role":"verwalter_mitarbeiter"}}',
  true
);

set local role authenticated;

-- Das "false" von eben war keine Hoeflichkeitsfloskel: es ist auch wirklich
-- nichts passiert.
select is(
  (select count(*)::int from public.document
    where id = 'ffffffff-ffff-4fff-8fff-ffffffffff69'::uuid),
  1,
  'nach dem Versuch des fremden Mandanten ist das Dokument unangetastet'
);

select is(
  public.dokument_entfernen(
    'ffffffff-ffff-4fff-8fff-ffffffffff69'::uuid,
    'cccccccc-cccc-4ccc-8ccc-cccccccccc69'::uuid),
  true,
  'der eigene Mandant entfernt sein Dokument und bekommt true zurueck'
);

select is(
  (select count(*)::int from public.document
    where id = 'ffffffff-ffff-4fff-8fff-ffffffffff69'::uuid),
  0,
  'das entfernte Dokument ist unter der SELECT-Policy aus 0015 unsichtbar'
);

-- Kein Fehler, keine zweite Stempelung, kein Wiederbeleben: ein bereits
-- entferntes Dokument ist schlicht "nichts getroffen".
select is(
  public.dokument_entfernen(
    'ffffffff-ffff-4fff-8fff-ffffffffff69'::uuid,
    'cccccccc-cccc-4ccc-8ccc-cccccccccc69'::uuid),
  false,
  'ein bereits entferntes Dokument meldet false statt eines Fehlers'
);

-- Doppelt unterscheidungskraeftig: beweist, dass der document_audit_emit aus
-- 0069 auch auf dem Definer-Pfad feuert, UND dass der zweite Aufruf oben
-- nichts geschrieben hat (sonst staenden hier zwei Zeilen).
select is(
  (select count(*)::int from public.audit_event as ae
    where ae.entity_typ = 'document'
      and ae.entity_id = 'ffffffff-ffff-4fff-8fff-ffffffffff69'::uuid
      and ae.action = 'update'
      and ae.payload->>'deleted_at' is not null),
  1,
  'das Entfernen steht genau einmal im Audit-Trail'
);

select * from finish();

rollback;
