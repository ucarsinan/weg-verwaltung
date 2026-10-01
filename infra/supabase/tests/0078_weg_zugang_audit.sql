-- WEG-Verwaltung pgTAP regression tests for 0078: Audit und Agent-Sperre auf weg_zugang.
--
-- Scope:
--   - die beiden Trigger aus 0078 existieren
--   - ein tenant_admin kann Zugang vergeben und entziehen; jede Handlung erzeugt
--     genau eine audit_event-Zeile, dem handelnden Nutzer zugeordnet
--   - ein doppelter Zugang scheitert mit 23505
--   - verwalter_mitarbeiter und eigentuemer koennen weder vergeben noch entziehen
--   - ein Agent scheitert bei INSERT und DELETE mit 42501
--
-- Beweisstandard wie 0075: Jede Negativpruefung zielt auf eine Zeile, die
-- nachweislich existiert. Ein DELETE ohne Treffer loest den Row-Trigger nicht aus,
-- und unter RLS liefern SELECT/UPDATE/DELETE null Zeilen statt zu werfen — nur
-- INSERT wirft 42501. Deshalb wird "nicht entzogen" an der noch vorhandenen Zeile
-- belegt, nicht an einem Fehler.
--
-- Die AFTER-Trigger schreiben erst nach der Anweisung; die audit_event-Zeilen
-- werden deshalb in einer eigenen Anweisung (und als postgres, nach reset role)
-- gezaehlt (Muster aus 0059 und 0069).
--
-- Laeuft in einer Transaktion und rollt alle Fixtures zurueck.

begin;

select plan(14);

-- ============================================================================
-- Katalog
-- ============================================================================

select ok(
  exists (
    select 1 from pg_catalog.pg_trigger
     where tgrelid = 'public.weg_zugang'::regclass
       and tgname = 'weg_zugang_block_agent_writes'
       and not tgisinternal
  ),
  'weg_zugang traegt die Agenten-Sperre'
);

select ok(
  exists (
    select 1 from pg_catalog.pg_trigger
     where tgrelid = 'public.weg_zugang'::regclass
       and tgname = 'weg_zugang_audit_emit'
       and not tgisinternal
  ),
  'weg_zugang emittiert Audit-Ereignisse'
);

-- ============================================================================
-- Fixtures: ein Mandant, eine WEG, Admin, Verwalter-Mitarbeiter, zwei Eigentuemer
-- ============================================================================

insert into public.tenant (id, name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa78'::uuid, '0078 Tenant')
on conflict (id) do update set name = excluded.name;

insert into public.tenant_member (tenant_id, user_id, role)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa78'::uuid,
   '11111111-1111-4111-8111-111111111178'::uuid, 'tenant_admin'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa78'::uuid,
   '33333333-3333-4333-8333-333333333378'::uuid, 'verwalter_mitarbeiter'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa78'::uuid,
   '22222222-2222-4222-8222-222222222278'::uuid, 'eigentuemer'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa78'::uuid,
   '44444444-4444-4444-8444-444444444478'::uuid, 'eigentuemer');

insert into public.weg (id, tenant_id, name)
values ('c0000000-0000-4000-8000-000000000078'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa78'::uuid, '0078 WEG');

-- Ein bestehender Zugang fuer den zweiten Eigentuemer: das Ziel aller
-- Entzugs-Versuche der Nicht-Admins und des Agenten.
insert into public.weg_zugang (id, tenant_id, user_id, weg_id)
values ('f0000000-0000-4000-8000-000000000078'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa78'::uuid,
        '44444444-4444-4444-8444-444444444478'::uuid,
        'c0000000-0000-4000-8000-000000000078'::uuid);

-- ============================================================================
-- Der tenant_admin vergibt und entzieht
-- ============================================================================

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111178",'
  '"role":"authenticated",'
  '"app_metadata":{"tenant_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa78",'
  '"role":"tenant_admin"}}',
  true
);

-- Ohne den Rollenwechsel bleibt die Session Tabelleneigentuemer mit BYPASSRLS —
-- der Vertrag waere still gruen (Muster 0069).
set local role authenticated;

select lives_ok(
  $q$insert into public.weg_zugang (id, tenant_id, user_id, weg_id, erteilt_von)
     values ('f1000000-0000-4000-8000-000000000078'::uuid,
             'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa78'::uuid,
             '22222222-2222-4222-8222-222222222278'::uuid,
             'c0000000-0000-4000-8000-000000000078'::uuid,
             '11111111-1111-4111-8111-111111111178'::uuid)$q$,
  'ein tenant_admin kann Zugang vergeben'
);

select throws_ok(
  $q$insert into public.weg_zugang (tenant_id, user_id, weg_id)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa78'::uuid,
             '22222222-2222-4222-8222-222222222278'::uuid,
             'c0000000-0000-4000-8000-000000000078'::uuid)$q$,
  '23505',
  null,
  'derselbe Zugang laesst sich nicht doppelt vergeben'
);

select lives_ok(
  $q$delete from public.weg_zugang
      where id = 'f1000000-0000-4000-8000-000000000078'::uuid$q$,
  'ein tenant_admin kann Zugang entziehen'
);

select is(
  (select count(*)::int from public.weg_zugang
    where id = 'f1000000-0000-4000-8000-000000000078'::uuid),
  0,
  'der entzogene Zugang ist weg'
);

-- Audit pruefen als postgres: authenticated liest audit_event nicht.
reset role;

select is(
  (select count(*)::int from public.audit_event as ae
    where ae.entity_typ = 'weg_zugang'
      and ae.entity_id = 'f1000000-0000-4000-8000-000000000078'::uuid
      and ae.action = 'insert'
      and ae.actor_user_id = '11111111-1111-4111-8111-111111111178'::uuid),
  1,
  'die Vergabe erzeugt genau eine audit_event-Zeile, dem Admin zugeordnet'
);

select is(
  (select count(*)::int from public.audit_event as ae
    where ae.entity_typ = 'weg_zugang'
      and ae.entity_id = 'f1000000-0000-4000-8000-000000000078'::uuid
      and ae.action = 'delete'
      and ae.actor_user_id = '11111111-1111-4111-8111-111111111178'::uuid),
  1,
  'der Entzug erzeugt genau eine audit_event-Zeile, dem Admin zugeordnet'
);

-- ============================================================================
-- Kein Admin: weder vergeben noch entziehen
-- ============================================================================

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333378",'
  '"role":"authenticated",'
  '"app_metadata":{"tenant_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa78",'
  '"role":"verwalter_mitarbeiter"}}',
  true
);
set local role authenticated;

select throws_ok(
  $q$insert into public.weg_zugang (tenant_id, user_id, weg_id)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa78'::uuid,
             '22222222-2222-4222-8222-222222222278'::uuid,
             'c0000000-0000-4000-8000-000000000078'::uuid)$q$,
  '42501',
  null,
  'ein verwalter_mitarbeiter kann keinen Zugang vergeben'
);

-- DELETE wirft unter RLS nicht, es trifft nur null Zeilen. Der Beleg ist die
-- noch vorhandene Zeile.
delete from public.weg_zugang
 where id = 'f0000000-0000-4000-8000-000000000078'::uuid;

reset role;

select is(
  (select count(*)::int from public.weg_zugang
    where id = 'f0000000-0000-4000-8000-000000000078'::uuid),
  1,
  'ein verwalter_mitarbeiter kann keinen Zugang entziehen'
);

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222278",'
  '"role":"authenticated",'
  '"app_metadata":{"tenant_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa78",'
  '"role":"eigentuemer"}}',
  true
);
set local role authenticated;

select throws_ok(
  $q$insert into public.weg_zugang (tenant_id, user_id, weg_id)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa78'::uuid,
             '22222222-2222-4222-8222-222222222278'::uuid,
             'c0000000-0000-4000-8000-000000000078'::uuid)$q$,
  '42501',
  null,
  'ein eigentuemer kann sich selbst keinen Zugang vergeben'
);

delete from public.weg_zugang
 where id = 'f0000000-0000-4000-8000-000000000078'::uuid;

reset role;

select is(
  (select count(*)::int from public.weg_zugang
    where id = 'f0000000-0000-4000-8000-000000000078'::uuid),
  1,
  'ein eigentuemer kann fremden Zugang nicht entziehen'
);

-- ============================================================================
-- Ein Agent
-- ============================================================================
--
-- Der Agent handelt im Namen des tenant_admin: RLS wuerde ihn durchlassen. Allein
-- der Trigger haelt ihn auf. Beide Klauseln zielen auf die vorhandene Zeile
-- f0..78 bzw. auf einen Insert, damit der Row-Trigger tatsaechlich feuert.

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111178",'
  '"role":"authenticated",'
  '"app_metadata":{"tenant_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa78",'
  '"role":"tenant_admin"}}',
  true
);
set local role authenticated;
select pg_catalog.set_config('app.actor_type', 'agent', true);

select throws_ok(
  $q$insert into public.weg_zugang (tenant_id, user_id, weg_id)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa78'::uuid,
             '22222222-2222-4222-8222-222222222278'::uuid,
             'c0000000-0000-4000-8000-000000000078'::uuid)$q$,
  '42501',
  null,
  'ein Agent kann keinen Zugang vergeben'
);

select throws_ok(
  $q$delete from public.weg_zugang
      where id = 'f0000000-0000-4000-8000-000000000078'::uuid$q$,
  '42501',
  null,
  'ein Agent kann vorhandenen Zugang nicht entziehen'
);

select pg_catalog.set_config('app.actor_type', 'user', true);

select * from finish();

rollback;
