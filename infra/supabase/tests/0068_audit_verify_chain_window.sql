-- WEG-Verwaltung pgTAP regression contract for 0068: das Forward-Fenster der
-- Kettenpruefung.
--
-- Scope:
--   public.audit_verify_chain() muss eine intakte Kette auch als intakt melden.
--
-- Warum dieser Vertrag existiert:
--   `0045` zaehlte das zu pruefende Fenster mit
--       (c.valid_after_seq is null or ae.seq > c.valid_after_seq)
--   `0050` hat die Funktion neu gebaut und dabei den NULL-Zweig verloren:
--       (not v_checkpoint_found or ae.seq > v_valid_after_seq)
--
--   Der Reparatur-Checkpoint aus `0045` wird faul angelegt und traegt dabei
--   `valid_after_seq = NULL` — die Bedeutung ist "ab der Genesis-Zeile dieses
--   Mandanten gueltig", also ALLE Zeilen. Genau in diesem Normalfall ergibt
--   `ae.seq > NULL` aber NULL, und `false or NULL` ist NULL: jede Zeile faellt
--   aus dem Fenster.
--
--   Gemessen am 2026-09-22 gegen Stand 0067: zwei Audit-Zeilen vorhanden, Kette
--   nachweislich ohne Bruchstelle, und die Funktion meldete trotzdem
--   `status = warning`, `rows_checked = 0`, `seq_from = NULL`.
--
--   Folge: Die Funktion kann `intact` NIE melden. Sie erkennt zwar echte
--   Bruchstellen (der Zaehler dafuer laeuft an `verify_chain_repaired` vorbei
--   und ist nicht betroffen) — aber sie bestaetigt niemals Unversehrtheit.
--   Eine naechtliche Pruefung, die auf `intact` wartet, waere dauerhaft rot;
--   eine, die nur `error` ausschliesst, waere gruen ohne Aussage. Beides ist
--   schlechter als keine Pruefung, weil es nach einer aussieht.
--
--   Dieselbe NULL-Falle wie in `0064`: ein Vergleich gegen NULL ergibt NULL,
--   nicht FALSE, und die umgebende Bedingung kippt still.
--
-- Laeuft in einer Transaktion und rollt alle Fixtures zurueck.

begin;

select plan(6);

-- ============================================================================
-- Statischer Vertrag: der NULL-Zweig muss im Migrationstext stehen
-- ============================================================================

select ok(
  (select count(*) > 0
     from pg_catalog.pg_proc as p
     join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'audit_verify_chain'
      and pg_catalog.pg_get_functiondef(p.oid) like '%v_valid_after_seq is null%'),
  'audit_verify_chain() behandelt valid_after_seq IS NULL ausdruecklich'
);

-- ============================================================================
-- Fixtures
-- ============================================================================

insert into public.tenant (id, name)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddd68'::uuid, '0068 Tenant')
on conflict (id) do update set name = excluded.name;

-- Die Funktion liest public.tenant_id() und public.has_role() aus dem Claim.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111168",'
  '"role":"authenticated",'
  '"app_metadata":{"tenant_id":"dddddddd-dddd-4ddd-8ddd-dddddddddd68",'
  '"role":"tenant_admin"}}',
  true
);

-- Ein Schreibvorgang auf einer auditierten Tabelle erzeugt Audit-Zeilen.
insert into public.weg (tenant_id, id, name, adresse)
values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddd68'::uuid,
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee68'::uuid,
  '0068 WEG',
  'Pruefweg 68'
);

select cmp_ok(
  (select count(*)::int from public.audit_event as ae
    where ae.tenant_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd68'::uuid),
  '>',
  0,
  'Vorbedingung: es gibt ueberhaupt Audit-Zeilen fuer diesen Mandanten'
);

-- ============================================================================
-- Der erste Aufruf legt den Checkpoint faul an. Erst der ZWEITE Aufruf laeuft
-- in die Falle, weil dann ein Checkpoint existiert — mit NULL-Grenze.
-- ============================================================================

create temporary table t0068_erster on commit drop as
select * from public.audit_verify_chain();

select ok(
  (select c.valid_after_seq is null
     from audit_writer.audit_chain_repair_checkpoint as c
    where c.tenant_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd68'::uuid),
  'Vorbedingung: der faule Checkpoint traegt valid_after_seq = NULL'
);

create temporary table t0068_zweiter on commit drop as
select * from public.audit_verify_chain();

-- ============================================================================
-- Die eigentlichen Zusicherungen
-- ============================================================================

select is(
  (select z.status from t0068_zweiter as z),
  'intact',
  'eine ungebrochene Kette wird als intakt gemeldet, nicht als Warnung'
);

select cmp_ok(
  (select z.rows_checked from t0068_zweiter as z),
  '>',
  0,
  'rows_checked zaehlt die tatsaechlich geprueften Zeilen'
);

-- seq_from/seq_to sind das sichtbare Ergebnis derselben Abfrage. Blieben sie
-- NULL, waere die Meldung in der Audit-Konsole ohne Aussage.
select ok(
  (select z.seq_from is not null and z.seq_to is not null from t0068_zweiter as z),
  'seq_from und seq_to benennen das gepruefte Fenster'
);

select * from finish();

rollback;
