-- WEG-Verwaltung pgTAP regression contract for 0071 aufbewahrung_effektiv.
--
-- Scope:
--   - public.aufbewahrung_effektiv liefert immer alle sieben Dokumentarten,
--     auch ohne eine einzige Mandantenregel und ohne ein einziges Dokument
--     (anders als public.dokument_uebersicht, die nur Zeilen fuer
--     tatsaechlich vorhandene Dokumente hat)
--   - ohne Mandantenregel gilt der gesetzliche Rueckfall, mit korrekter
--     Herkunftskennzeichnung
--   - eine Mandantenregel schlaegt den Rueckfall bei Jahren UND Herkunft
--   - eine Mandantenregel mit jahre = null ("dauerhaft") bleibt von der
--     statutarisch dauerhaften Rueckfall-Zeile (z. B. protokoll) unterscheidbar
--     — beide tragen jahre = null, nur herkunft trennt sie
--   - ein fremder Mandant sieht seine eigenen Werte, nie die des anderen
--     Mandanten (Test unter "set local role authenticated", nicht als
--     "postgres" — der Table-Owner hat BYPASSRLS, FORCE ROW LEVEL SECURITY
--     waere sonst wirkungslos und die Zusicherung vakuos, siehe 0069)
--   - der Zwei-Hop-Pfad durch BEIDE Sichten (dokument_uebersicht ->
--     aufbewahrung_effektiv -> aufbewahrungsregel) haelt die Mandantentrennung
--     ein: zwei Mandanten, DERSELBE doc_typ, je eine eigene Regel — jeder
--     sieht ueber dokument_uebersicht nur seine eigene Frist (Fix Round 1:
--     der explizite "ae.tenant_id = d.tenant_id"-Abgleich, den 0069 schon
--     hatte und den die erste Fassung dieser Migration ersatzlos entfernt
--     hatte, ohne dass RLS allein ungetestet blieb)
--
-- infra/supabase/tests/0069_dokumentenablage.sql bleibt unveraendert gueltig:
-- dokument_uebersicht aendert sich an der Oberflaeche nicht, nur ihre interne
-- Herleitung (liest den Rueckfall jetzt von hier statt ihn selbst zu
-- berechnen).

begin;

select plan(12);

-- ===========================================================================
-- Fixtures
-- ===========================================================================

insert into public.tenant (id, name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa71'::uuid, '0071 Tenant A'),
       ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb71'::uuid, '0071 Tenant B')
on conflict (id) do update set name = excluded.name;

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111171",'
  '"role":"authenticated",'
  '"app_metadata":{"tenant_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa71",'
  '"role":"verwalter_mitarbeiter"}}',
  true
);

-- Ohne den Rollenwechsel bleibt die Session "postgres" — der Table-Owner mit
-- BYPASSRLS, fuer den FORCE ROW LEVEL SECURITY wirkungslos ist (Muster 0069).
set local role authenticated;

-- ===========================================================================
-- 1. Alle sieben Dokumentarten, auch ganz ohne Mandantenregel
-- ===========================================================================

select is(
  (select count(*)::int from public.aufbewahrung_effektiv),
  7,
  'aufbewahrung_effektiv liefert alle sieben Dokumentarten, auch ohne jede Mandantenregel'
);

-- ===========================================================================
-- 2. Der gesetzliche Rueckfall, ohne Mandantenregel
-- ===========================================================================

select ok(
  (select jahre = 8 and herkunft = 'gesetzlicher_rueckfall'
     from public.aufbewahrung_effektiv
    where doc_typ = 'rechnung'),
  'rechnung ohne Mandantenregel: gesetzlicher Rueckfall von 8 Jahren'
);

select ok(
  (select jahre is null and herkunft = 'gesetzlicher_rueckfall'
     from public.aufbewahrung_effektiv
    where doc_typ = 'protokoll'),
  'protokoll ohne Mandantenregel: gesetzlicher Rueckfall ist dauerhaft (jahre ist null)'
);

-- ===========================================================================
-- 3. Eine Mandantenregel schlaegt den Rueckfall bei Jahren UND Herkunft
-- ===========================================================================

insert into public.aufbewahrungsregel (tenant_id, doc_typ, jahre, rechtsgrundlage)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa71'::uuid, 'rechnung', 12,
        'eigene Rechtsberatung');

select ok(
  (select jahre = 12 and herkunft = 'mandantenregel'
     and rechtsgrundlage = 'eigene Rechtsberatung'
     from public.aufbewahrung_effektiv
    where doc_typ = 'rechnung'),
  'eine Mandantenregel von 12 Jahren verschiebt Jahre UND Herkunft, rechtsgrundlage wird durchgereicht'
);

-- ===========================================================================
-- 3b. Derselbe Tenant-Abgleich, jetzt durch den Zwei-Hop-Pfad geprueft:
--     dokument_uebersicht -> aufbewahrung_effektiv -> aufbewahrungsregel
-- ===========================================================================

insert into public.weg (tenant_id, id, name, adresse)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa71'::uuid,
        'cccccccc-cccc-4ccc-8ccc-cccccccccc71'::uuid,
        '0071 WEG A', 'Zwei-Hop-Weg A');

-- 15.05.2020 + Jahresende 2020 + die Mandantenregel von 12 Jahren (oben) ->
-- 31.12.2032. Derselbe doc_typ ('rechnung') wie unten bei Tenant B, mit
-- absichtlich demselben Dokumentdatum, damit ein durchgesickerter Wert des
-- anderen Mandanten sofort auffiele statt zufaellig zusammenzupassen.
insert into public.document (tenant_id, weg_id, doc_typ, titel, dokument_datum)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa71'::uuid,
        'cccccccc-cccc-4ccc-8ccc-cccccccccc71'::uuid,
        'rechnung', '0071 Zwei-Hop Tenant A', date '2020-05-15');

select ok(
  (select aufzubewahren_bis = date '2032-12-31' and frist_herkunft = 'mandantenregel'
     from public.dokument_uebersicht
    where titel = '0071 Zwei-Hop Tenant A'),
  'dokument_uebersicht traegt die 12-Jahre-Mandantenregel von Tenant A ueber beide Sichten hinweg bis zum Dokument'
);

-- ===========================================================================
-- 4. Eine Mandantenregel mit jahre = null bleibt von der statutarisch
--    dauerhaften Rueckfall-Zeile unterscheidbar
-- ===========================================================================

-- 'vertrag' faellt ohne Regel unter den Rueckfall von 10 Jahren (gegriffen,
-- keine dauerhafte Zeile) — der Verwalter entscheidet hier bewusst anders.
insert into public.aufbewahrungsregel (tenant_id, doc_typ, jahre, rechtsgrundlage)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa71'::uuid, 'vertrag', null,
        'Verwalter-Entscheid: Vertraege dauerhaft aufbewahren');

select ok(
  (select jahre is null and herkunft = 'mandantenregel'
     from public.aufbewahrung_effektiv
    where doc_typ = 'vertrag'),
  'eine Mandantenregel mit jahre = null bedeutet dauerhaft und bleibt als Mandantenregel erkennbar'
);

-- Die Kontrollprobe: protokoll ist WEITERHIN nur per Rueckfall dauerhaft
-- (keine Regel dafuer wurde angelegt) — dieselbe jahre-is-null-Ausgabe wie bei
-- vertrag, aber mit der jeweils anderen Herkunft. Ein coalesce(r.jahre, ...)
-- haette beide Zeilen ununterscheidbar gemacht.
select ok(
  (select jahre is null and herkunft = 'gesetzlicher_rueckfall'
     from public.aufbewahrung_effektiv
    where doc_typ = 'protokoll'),
  'protokoll bleibt gesetzlicher Rueckfall — dasselbe jahre = null wie vertrag, aber unterscheidbare Herkunft'
);

-- ===========================================================================
-- 5. Keine Zeilenverdopplung durch den Join
-- ===========================================================================

select is(
  (select count(*)::int from public.aufbewahrung_effektiv),
  7,
  'weiterhin genau sieben Zeilen nach zwei Mandantenregeln — kein Kreuzprodukt durch den Join'
);

-- ===========================================================================
-- 6. Ein fremder Mandant sieht seine eigenen Werte, nie die des anderen
-- ===========================================================================

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222271",'
  '"role":"authenticated",'
  '"app_metadata":{"tenant_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb71",'
  '"role":"verwalter_mitarbeiter"}}',
  true
);

set local role authenticated;

select ok(
  (select jahre = 8 and herkunft = 'gesetzlicher_rueckfall'
     from public.aufbewahrung_effektiv
    where doc_typ = 'rechnung'),
  'ein fremder Mandant sieht fuer rechnung den gesetzlichen Rueckfall (8 Jahre), nicht die 12 Jahre des anderen Mandanten'
);

-- vertrag faellt ohne Regel unter den Rueckfall von 10 Jahren (gegriffen,
-- siehe Abschnitt 1 der Sicht) — NICHT dauerhaft. Waere der fremde Mandant
-- faelschlich an die Mandantenregel von Tenant A gebunden, saehe er hier
-- "jahre is null" statt 10.
select ok(
  (select jahre = 10 and herkunft = 'gesetzlicher_rueckfall'
     from public.aufbewahrung_effektiv
    where doc_typ = 'vertrag'),
  'ein fremder Mandant sieht fuer vertrag den gesetzlichen Rueckfall von 10 Jahren, nicht die dauerhafte Mandantenregel des anderen'
);

select is(
  (select count(*)::int from public.aufbewahrung_effektiv),
  7,
  'auch fuer den fremden Mandanten bleiben es genau sieben Zeilen'
);

-- ===========================================================================
-- 6b. Derselbe Zwei-Hop-Pfad, jetzt fuer den fremden Mandanten: DERSELBE
--     doc_typ ('rechnung'), DASSELBE Dokumentdatum wie bei Tenant A oben —
--     nur der gesetzliche Rueckfall darf hier ankommen, nie die 12 Jahre von
--     Tenant A. Das ist die Zusicherung, die Fix Round 1 verlangt: der
--     Tenant-Abgleich muss durch BEIDE Sichten hindurch halten, nicht nur in
--     aufbewahrung_effektiv direkt (Abschnitt 6 oben).
-- ===========================================================================

insert into public.weg (tenant_id, id, name, adresse)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb71'::uuid,
        'dddddddd-dddd-4ddd-8ddd-dddddddddd71'::uuid,
        '0071 WEG B', 'Zwei-Hop-Weg B');

insert into public.document (tenant_id, weg_id, doc_typ, titel, dokument_datum)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb71'::uuid,
        'dddddddd-dddd-4ddd-8ddd-dddddddddd71'::uuid,
        'rechnung', '0071 Zwei-Hop Tenant B', date '2020-05-15');

-- 15.05.2020 + Jahresende 2020 + gesetzlicher Rueckfall von 8 Jahren ->
-- 31.12.2028 — NICHT 2032-12-31 (das waere Tenant As Mandantenregel).
select ok(
  (select aufzubewahren_bis = date '2028-12-31' and frist_herkunft = 'gesetzlicher_rueckfall'
     from public.dokument_uebersicht
    where titel = '0071 Zwei-Hop Tenant B'),
  'dokument_uebersicht sieht fuer den fremden Mandanten den gesetzlichen Rueckfall (2028-12-31), nicht die Mandantenregel von Tenant A (2032-12-31) — Tenant-Abgleich haelt durch beide Sichten'
);

select * from finish();

rollback;
