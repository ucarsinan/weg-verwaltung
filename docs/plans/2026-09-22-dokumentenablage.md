# Dokumentenablage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Verwalter legt Unterlagen einer WEG ab, findet sie wieder, lädt sie herunter und sieht, wie lange er sie aufbewahren muss.

**Architecture:** Das Datenmodell aus `0015` (`document`, `document_version`, Bucket `weg-docs`) bleibt unverändert bestehen und bekommt eine Oberfläche. Migration `0069` erweitert `doc_typ`, ergänzt das Pflichtfeld `dokument_datum`, legt die **bearbeitbare** Tabelle `aufbewahrungsregel` an und leitet die Frist in einer `security_invoker`-Sicht ab. Kein Festwert im Code außer einem erkennbar benannten gesetzlichen Rückfall.

**Tech Stack:** Postgres 17 (Supabase), pgTAP, Next.js 16 App Router, Server Actions über `runFormAction`, Vitest, Playwright.

**Spec:** [`docs/specs/2026-09-22-dokumentenablage-design.md`](../specs/2026-09-22-dokumentenablage-design.md)

## Abweichungen zwischen Plan und Umsetzung

**Status: umgesetzt (Tasks 1–6, 2026-09-23).** Dieser Plan beschreibt den Stand
*vor* der Implementierung. Wo er von dem abweicht, was tatsächlich gebaut und
committet wurde, steht das hier — nicht, weil der Plan falsch war (Pläne sind
Annahmen, keine Zusagen), sondern weil ein Leser sonst etwas glaubt, das der
Code nicht mehr tut. Details je Task: `.superpowers/sdd/2026-09-22-dokumentenablage/task-{1..6}-report.md`
und `progress.md` im selben Verzeichnis (Rulings 1–26).

Maßgeblich für das WAS ist weiterhin `docs/specs/2026-09-22-dokumentenablage-design.md`
(dort laufend nachgezogen); dieser Abschnitt korrigiert nur den Plan.

1. **`private._aufbewahrung_jahre` gibt es nicht.** Task 1 (Schritt 3 und 5,
   unten) plant eine `SECURITY DEFINER`-Funktion in Schema `private`, aufgerufen
   per `cross join lateral` aus `dokument_uebersicht`, plus (implizit, um sie
   für `authenticated` nutzbar zu machen) ein `grant usage on schema private to
   authenticated`. Beides wurde beim Bauen verworfen (Ruling 5, Review-Runde
   Task 1): ein schemaweites `USAGE`-Grant hätte die bewusste Abschottung von
   Schema `private` aus `0039`, `0042` (Security-Hotfix) und `0047` für **alle**
   privaten Funktionen aufgeweicht, nicht nur für diese eine. Tatsächlich
   umgesetzt: der gesetzliche Rückfall ist **inline per `left join
   public.aufbewahrungsregel`** in die Sicht eingebaut — RLS auf
   `aufbewahrungsregel` erledigt die Mandantentrennung von selbst, ganz ohne
   Grant, `SECURITY DEFINER` oder handgeschriebenen `tenant_id`-Guard. Seit
   `0071` (siehe Punkt 7) lebt dieser Rückfall in einer eigenen Sicht
   `public.aufbewahrung_effektiv`, die `dokument_uebersicht` joint.
2. **`0069` hat 12 Zusicherungen, nicht 11.** Der Plan schreibt `select
   plan(11)` und erwartet elf Zusicherungen (Schritt 3, 4, 6, 8 unten). Die
   tatsächliche Migration `infra/supabase/tests/0069_dokumentenablage.sql`
   zählt `select plan(12)` — eine zusätzliche Zusicherung aus dem Review kam
   dazu (Mandantenregel mit `jahre = null` bleibt von „dauerhaft" per
   Rückfall unterscheidbar). `0071` zählt inzwischen `plan(13)`.
3. **`baueStoragePfad` trägt ein Versionssegment.** Der Plan (Task 2, Schritt
   5) baut `<tenant>/<weg>/<doc_typ>/<dokumentId>.<ext>`. Tatsächlich:
   `<tenant>/<weg>/<doc_typ>/<dokumentId>-v<version_no>-<eindeutig>.<ext>` —
   ohne Versionssegment hätte eine zweite Version denselben Storage-Pfad
   getroffen wie die erste, und `weg-docs` vergibt keine UPDATE-Policy
   (`0015:265-273`); Versionierung wäre strukturell unmöglich gewesen (Ruling
   10, Task 3). `eindeutig` macht zusätzlich einen Retry nach einem
   gescheiterten Insert kollisionsfrei.
4. **Die Upload-Reihenfolge ist umgedreht.** Der Plan (Task 3, Schritt 5)
   legt zuerst die `document`-Zeile an und lädt danach hoch. Tatsächlich:
   erst **hochladen**, dann `document`, dann `document_version` — mit der
   `document`-ID per `randomUUID()` in der Action erzeugt, nicht aus einem
   `insert …returning`. Grund (Ruling 11, Task 3): `document` hat laut `0015`
   keine DELETE-Policy (nur Soft-Delete); bei „Dokumentzeile zuerst" hätte ein
   fehlgeschlagener Upload eine unlöschbare Dokumentzeile ohne Datei
   hinterlassen. Mit der tatsächlichen Reihenfolge schreibt der häufigste
   Fehlerfall (schlechte Datei, Storage-Problem) gar keine Datenbankzeile.
5. **Die Kompensation, die eine hochgeladene Datei entfernt, existiert
   nicht und kann nicht existieren.** Der Plan (Task 3, Schritt 5) ruft bei
   einem gescheiterten `document_version`-Insert `storage.from("weg-docs").remove([pfad])`
   auf. `weg-docs` vergibt laut `0015:265-273` bewusst **weder** eine
   UPDATE- **noch** eine DELETE-Policy auf `storage.objects` — „if a real
   delete is ever needed, it goes through a SECURITY DEFINER admin function
   with audit log entry. No app-side path." Dieser Aufruf hätte im echten
   Betrieb immer mit einem Berechtigungsfehler fehlgeschlagen (Ruling 16,
   Review Task 3, als Critical eingestuft — schlimmer als gemeldet: der
   deterministische Pfad ohne Zufallsanteil hätte bei einem fehlgeschlagenen
   Insert die gesamte Versionskette eines Dokuments eingefroren). Tatsächlich:
   keine Kompensation. Die verwaiste Datei wird auf Error-Level mit vollem
   Pfad und Dokument-ID protokolliert, damit sie über die
   `SECURITY DEFINER`-Admin-Funktion aus `0015` von Hand entfernt werden kann.
6. **`parseDokumentForm` (und `parseRegelForm`) leben nicht in `actions.ts`.**
   Der Plan (Task 3, Schritt 5; Task 4, Schritt 1) exportiert sie direkt aus
   der `"use server"`-Datei. Next.js verlangt, dass eine `"use server"`-Datei
   ausschließlich `async`-Funktionen exportiert — ein synchrones
   `parseDokumentForm` bricht den Build. Tatsächlich: die reine
   Formularvalidierung liegt in `modules/dokumente/form.ts`, `actions.ts`
   importiert sie (Ruling 1, Vorab-Scan). Muster wie
   `modules/finanzen/verteilungsschluessel.ts` (`pruefeTeile`).
7. **Task 4 brachte eine eigene Migration, `0071`.** Der Plan listet für
   Task 4 keine Migrationsdatei (nur Seite, Formular, Actions, Tests). Ruling
   20 (vor Task 4 entdeckt) zeigte: die Einstellungsseite muss für **alle
   sieben** Dokumentarten die geltende Frist samt Herkunft zeigen — auch für
   Arten ganz ohne Dokument. `dokument_uebersicht` (Task 1) hat aber nur
   Zeilen für tatsächlich vorhandene Dokumente. Ohne eine eigene Sicht hätte
   die Seite die Rückfallwerte in TypeScript duplizieren müssen — genau der
   Festwert, den die Nutzervorgabe „keine Festwerte" verbietet. Migration
   `0071` zieht den kompletten Rückfall-`CASE` aus `0069` in
   `public.aufbewahrung_effektiv`; `dokument_uebersicht` liest seither von
   dort statt selbst zu rechnen.
8. **Das Upload-Limit steht im Plan bereits korrekt bei 10 MB.** Zur
   Vollständigkeit gegen die Liste der bekannten Abweichungen geprüft: dieser
   Plan selbst nennt an keiner Stelle 25 MB (nur `docs/specs/…-design.md`
   dokumentiert ausdrücklich und korrekt, dass ursprünglich 25 MB vorgesehen
   waren und warum auf 10 MB gesenkt wurde). Keine Korrektur nötig — hier zur
   Nachvollziehbarkeit vermerkt, damit diese Liste nicht unvollständig
   aussieht.

**Was NICHT abweicht:** `DocTyp`, `FristHerkunft`, `formatAufbewahrung`,
`pruefeDatei`/`DateiPruefung`, `MAX_UPLOAD_BYTES` (10 MB, an den geplanten drei
Stellen), die Routen unter `/wegs/[id]/dokumente` und
`/einstellungen/aufbewahrung`, und die Migrationsnummer `0069` selbst.

## Global Constraints

- **Migrationsnummer `0069`.** Erste Zeile exakt: `-- WEG-Verwaltung migration 0069: <Beschreibung>`. `sql-lint` erzwingt Header und lückenlose Nummerierung.
- **Jede neue Tabelle in `public`** trägt `enable row level security` **und** `force row level security` und mindestens eine Policy — sonst wird `infra/supabase/tests/0000_rls_katalog.sql` rot.
- **Keine Tabelle in `private`.** Derselbe Vertrag.
- **Fachliche Werte gehören als Daten in die Datenbank**, nicht als Konstante in den Code. Einzige Ausnahme hier: der gesetzliche Rückfall in `private._aufbewahrung_jahre`, und die Sicht meldet ihn als solchen. **Abweichung 1:** Diese Funktion wurde nicht gebaut — der Rückfall ist inline in der Sicht (seit `0071` in `public.aufbewahrung_effektiv`), siehe „Abweichungen zwischen Plan und Umsetzung" oben.
- **Upload-Grenze 10 MB**, an genau zwei Stellen und mit derselben Zahl: `serverActions.bodySizeLimit` in `apps/web/next.config.ts` und `file_size_limit` des Buckets `weg-docs`.
- **Sicherheitsinvarianten bleiben hart:** RLS, Append-only auf `document_version`, Agent-Schreibsperre. Nicht konfigurierbar machen.
- **Dokumentationspflicht:** Betroffene `.md`-Dateien im selben Commit nachziehen, nicht später.
- **`./scripts/verify.sh` muss vor jedem Commit grün sein.**
- Sprache: Deutsch in Kommentaren, Doku und Oberfläche; Englisch in Commit-Messages.

## File Structure

| Datei | Verantwortung |
| --- | --- |
| `infra/supabase/migrations/0069_dokumentenablage.sql` | Schema-Erweiterung, Regeltabelle, ~~Rückfall-Funktion~~ (inline in der Sicht, Abweichung 1), Sicht, Audit-Emitter |
| `infra/supabase/tests/0069_dokumentenablage.sql` | pgTAP-Vertrag (12 Zusicherungen, Abweichung 2), rechnet die Frist von Hand nach |
| `infra/supabase/migrations/0070_weg_docs_bucket_limit.sql` | **nicht im Plan vorgesehen** — Bucket-Grenze `weg-docs` auf 10 MB (Task 3) |
| `infra/supabase/migrations/0071_aufbewahrung_effektiv.sql` + `infra/supabase/tests/0071_aufbewahrung_effektiv.sql` | **nicht im Plan vorgesehen** — eigenständige Rückfall-Sicht (Abweichung 7), 13 Zusicherungen |
| `apps/web/src/lib/supabase/database.types.gen.ts` | neu erzeugt |
| `apps/web/src/lib/supabase/database.types.ts` | `DocTyp`, `FristHerkunft` von Hand ergänzt |
| `apps/web/src/modules/dokumente/aufbewahrung.ts` | Anzeigelogik der Frist — **keine** Fristrechnung |
| `apps/web/src/modules/dokumente/upload.ts` | Dateivalidierung (Typ, Größe), Pfadbildung (mit Versionssegment, Abweichung 3) |
| `apps/web/src/modules/dokumente/form.ts` | **nicht im Plan vorgesehen** — reine Formularvalidierung (`parseDokumentForm`, `parseNeueVersionForm`, `parseLoescheDokumentForm`), ausgelagert aus `actions.ts` (Abweichung 6) |
| `apps/web/src/modules/dokumente/index.ts` | Barrel |
| `apps/web/src/app/(dashboard)/wegs/[id]/dokumente/page.tsx` | Liste **ohne** Filter (der Brief gab nur Struktur vor, kein Filter-UI — siehe Spec-Fußnote) |
| `apps/web/src/app/(dashboard)/wegs/[id]/dokumente/actions.ts` | Hochladen, neue Version, aus der Liste entfernen (Reihenfolge und Kompensation abweichend, Abweichung 4+5) |
| `apps/web/src/app/(dashboard)/wegs/[id]/dokumente/neu/page.tsx` + `upload-form.tsx` | Hochladen |
| `apps/web/src/app/(dashboard)/wegs/[id]/dokumente/[dokumentId]/page.tsx` + `neue-version-form.tsx` + `entferne-dokument-button.tsx` | Versionen, Herunterladen, neue Version, Entfernen (die beiden Formulare fehlten im Plan) |
| `apps/web/src/app/(dashboard)/einstellungen/aufbewahrung/page.tsx` + `regel-form.tsx` + `actions.ts` | Fristregeln bearbeiten |
| `apps/web/e2e/dokumente.spec.ts` | der Beweis, dass die Regel Daten ist — geschrieben, **nie ausgeführt** (freigabepflichtig, Ruling 2/25) |

---

### Task 1: Migration 0069 und pgTAP-Vertrag

**Files:**
- Create: `infra/supabase/migrations/0069_dokumentenablage.sql`
- Create: `infra/supabase/tests/0069_dokumentenablage.sql`
- Modify: `justfile` (Vertrag in `AUDIT_DB_TESTS` aufnehmen — er prüft auch den Audit-Emitter)

**Interfaces:**
- Produces: `public.aufbewahrungsregel(tenant_id, doc_typ, jahre, rechtsgrundlage, notiz)`; ~~`private._aufbewahrung_jahre(uuid, text) returns table(jahre int, herkunft text)`~~ (nicht gebaut, Abweichung 1); `public.dokument_uebersicht(tenant_id, weg_id, dokument_id, titel, doc_typ, dokument_datum, version_no, storage_path, mime_type, file_size_bytes, aufzubewahren_bis, frist_herkunft)`
- Consumes: `public.document`, `public.document_version` aus `0015`; `audit_writer.tg_emit_audit_event()` aus `0026`; `public.tg_finance_allocation_block_agent_writes()` aus `0056`

> **Der folgende Vertrags- und Migrationstext (Schritt 3 und 5) zeigt den Stand
> vor Ruling 5.** Er wurde nicht so gebaut — siehe „Abweichungen zwischen Plan
> und Umsetzung" oben (Punkte 1 und 2) für das, was tatsächlich in
> `infra/supabase/migrations/0069_dokumentenablage.sql` und
> `infra/supabase/tests/0069_dokumentenablage.sql` steht.

- [ ] **Step 1: Voraussetzung prüfen — Nummer noch frei?**

```bash
ls infra/supabase/migrations/*.sql | tail -1
ls .claude/worktrees/*/infra/supabase/migrations/0069*.sql 2>/dev/null || echo "0069 frei"
```

Erwartet: letzte Migration ist `0068_…`, kein `0069` in einem Nachbar-Worktree.

- [ ] **Step 2: Docker starten und Datenbank auf aktuellen Stand bringen**

```bash
colima start
cd infra && supabase db reset --local
```

- [ ] **Step 3: Den pgTAP-Vertrag schreiben — zuerst, und er muss rot werden**

Create `infra/supabase/tests/0069_dokumentenablage.sql`:

```sql
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

select is(
  (select count(*)::int from public.aufbewahrungsregel),
  0,
  'ein fremder Mandant sieht keine Regel des anderen'
);

select * from finish();

rollback;
```

- [ ] **Step 4: Den Vertrag laufen lassen — er MUSS scheitern**

```bash
cd infra && supabase test db supabase/tests/0069_dokumentenablage.sql --local
```

Erwartet: `Result: FAIL`. Die Fehler nennen `column "dokument_datum" of relation "document" does not exist` bzw. `relation "public.aufbewahrungsregel" does not exist`.

Läuft der Vertrag versehentlich grün, ist die Fixture falsch — nicht weitermachen.

- [ ] **Step 5: Die Migration schreiben**

Create `infra/supabase/migrations/0069_dokumentenablage.sql`:

```sql
-- WEG-Verwaltung migration 0069: Dokumentenablage und Aufbewahrungsfristen.
--
-- Zweck:
--   Das Datenmodell aus 0015 bekommt die Felder, die eine Ablage braucht, und
--   eine bearbeitbare Regel fuer die Aufbewahrungsfrist.
--
-- Warum die Frist nicht im Code steht:
--   Die Frist fuer Buchungsbelege sank von zehn auf acht Jahre, und zwar auch
--   fuer Belege, deren Frist noch lief. Eine Konstante haette eine Migration
--   ueber den gesamten Bestand verlangt. Deshalb: Regel als Daten je Mandant,
--   Frist abgeleitet in einer Sicht.
--
-- Warum ein eigenes Dokumentdatum:
--   § 147 Abs. 4 AO laesst die Frist mit dem Schluss des Kalenderjahrs
--   beginnen, in dem der Beleg entstanden ist — nicht mit dem Hochladen. Eine
--   2019er Rechnung, heute hochgeladen, waere sonst bis 2034 statt bis 2027
--   aufzubewahren. Beim Uebernehmen eines Altbestands ist das der Normalfall.
--
-- Was die Frist NICHT tut:
--   Sie ist eine Anzeige. Nichts wird nach Ablauf geloescht, archiviert oder
--   freigegeben. Die Verwaltungsunterlagen gehoeren der WEG; der Verwalter
--   verwahrt sie treuhaenderisch und gibt sie heraus, statt sie zu entsorgen.
--   0015 bildet das bereits ab (Soft-Delete, Hard-Delete mangels Policy
--   blockiert) — daran aendert diese Migration nichts.
--
-- Betroffene Tabellen:
--   public.document (CHECK erweitert, Spalte ergaenzt, Audit-Emitter),
--   public.aufbewahrungsregel (neu).
--
-- RLS-Auswirkung:
--   Neue Tabelle mit RLS und FORCE RLS und vier Policies nach dem Muster der
--   uebrigen Fachtabellen. Die Sicht ist security_invoker, die RLS der
--   Basistabellen bleibt also in Kraft.
--
-- Teststrategie:
--   infra/supabase/tests/0069_dokumentenablage.sql, 11 Zusicherungen. Die
--   Fristrechnung wird von Hand nachgerechnet.
--
-- Rollback / Forward-Fix:
--   Vorwaerts-Fix bevorzugt. Ein Rueckbau muesste dokument_datum und die
--   Regeltabelle entfernen; die erweiterten doc_typ-Werte liessen sich nur
--   zuruecknehmen, wenn keine Zeile sie mehr benutzt.

-- ---------------------------------------------------------------------------
-- 1. doc_typ erweitern
-- ---------------------------------------------------------------------------

alter table public.document
  drop constraint if exists document_doc_typ_check;

alter table public.document
  add constraint document_doc_typ_check
  check (doc_typ in (
    'beschluss', 'protokoll', 'doku',
    'rechnung', 'vertrag', 'bescheid', 'korrespondenz'
  ));

comment on column public.document.doc_typ is
  'Dokumentart. Bestimmt ueber public.aufbewahrungsregel bzw. den gesetzlichen Rueckfall die Aufbewahrungsfrist.';

-- ---------------------------------------------------------------------------
-- 2. dokument_datum als Pflichtfeld
-- ---------------------------------------------------------------------------

-- Bestand sind heute ausschliesslich signierte Protokolle; dort ist das
-- Erstellungsdatum zugleich das Dokumentdatum. Erst fuellen, dann verschaerfen.
alter table public.document
  add column if not exists dokument_datum date;

update public.document
   set dokument_datum = created_at::date
 where dokument_datum is null;

alter table public.document
  alter column dokument_datum set not null;

comment on column public.document.dokument_datum is
  'Datum des Dokuments selbst, nicht des Hochladens. Startpunkt der Aufbewahrungsfrist nach § 147 Abs. 4 AO (Schluss des Kalenderjahrs).';

-- ---------------------------------------------------------------------------
-- 3. Die bearbeitbare Regel
-- ---------------------------------------------------------------------------

create table if not exists public.aufbewahrungsregel (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default public.tenant_id()
                   references public.tenant(id) on delete restrict,
  doc_typ          text not null
                   check (doc_typ in (
                     'beschluss', 'protokoll', 'doku',
                     'rechnung', 'vertrag', 'bescheid', 'korrespondenz'
                   )),
  -- NULL bedeutet dauerhaft. Eine 0 waere mehrdeutig ("sofort loeschbar"?)
  -- und ist deshalb ausgeschlossen.
  jahre            int check (jahre is null or jahre between 1 and 100),
  rechtsgrundlage  text,
  notiz            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, doc_typ)
);

comment on table public.aufbewahrungsregel is
  'Aufbewahrungsfrist je Dokumentart, bearbeitbar je Mandant. Fehlt eine Zeile, greift der gesetzliche Rueckfall aus private._aufbewahrung_jahre — die Frist ist also nie undefiniert.';

comment on column public.aufbewahrungsregel.jahre is
  'NULL bedeutet dauerhaft aufzubewahren.';

comment on column public.aufbewahrungsregel.rechtsgrundlage is
  'Freitext und bewusst nicht aus einer festen Liste: welche Vorschrift gilt, entscheidet der Verwalter nach eigener Beratung, nicht dieses Produkt.';

alter table public.aufbewahrungsregel enable row level security;
alter table public.aufbewahrungsregel force row level security;
revoke all on public.aufbewahrungsregel
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.aufbewahrungsregel to authenticated;

create policy aufbewahrungsregel_select_own_tenant
  on public.aufbewahrungsregel for select to authenticated
  using (tenant_id = (select public.tenant_id()));

create policy aufbewahrungsregel_insert_own_tenant
  on public.aufbewahrungsregel for insert to authenticated
  with check (tenant_id = (select public.tenant_id()));

create policy aufbewahrungsregel_update_own_tenant
  on public.aufbewahrungsregel for update to authenticated
  using (tenant_id = (select public.tenant_id()))
  with check (tenant_id = (select public.tenant_id()));

create policy aufbewahrungsregel_delete_own_tenant
  on public.aufbewahrungsregel for delete to authenticated
  using (tenant_id = (select public.tenant_id()));

-- Die KI aendert keine Aufbewahrungsfristen.
drop trigger if exists aufbewahrungsregel_block_agent_writes on public.aufbewahrungsregel;
create trigger aufbewahrungsregel_block_agent_writes
  before insert or update or delete on public.aufbewahrungsregel
  for each row
  execute function public.tg_finance_allocation_block_agent_writes();

-- Eine geaenderte Frist ist eine nachweispflichtige Entscheidung.
drop trigger if exists aufbewahrungsregel_audit_emit on public.aufbewahrungsregel;
create trigger aufbewahrungsregel_audit_emit
  after insert or update or delete on public.aufbewahrungsregel
  for each row execute function audit_writer.tg_emit_audit_event();

-- ---------------------------------------------------------------------------
-- 4. Nebenbefund aus dem Entwurf: document war nicht auditiert
-- ---------------------------------------------------------------------------

-- Protokolle und kuenftig Belege sind Beweismittel. Die Beschluss-Sammlung
-- daneben ist append-only UND auditiert; document war es nicht.
drop trigger if exists document_audit_emit on public.document;
create trigger document_audit_emit
  after insert or update or delete on public.document
  for each row execute function audit_writer.tg_emit_audit_event();

-- ---------------------------------------------------------------------------
-- 5. Der gesetzliche Rueckfall
-- ---------------------------------------------------------------------------

create or replace function private._aufbewahrung_jahre(
  p_tenant_id uuid,
  p_doc_typ   text
)
returns table (jahre int, herkunft text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.jahre, 'mandantenregel'::text
    from public.aufbewahrungsregel as r
   where r.tenant_id = p_tenant_id
     and r.doc_typ = p_doc_typ
  union all
  -- Rueckfall: ein konservativer Vorschlag, keine Rechtsauskunft.
  --   protokoll/beschluss  dauerhaft (Praxis, nicht AO)
  --   rechnung             8  (§ 147 Abs. 3 Nr. 4 AO, Buchungsbeleg)
  --   korrespondenz        6  (§ 147 Abs. 3, Handels- und Geschaeftsbriefe)
  --   bescheid/vertrag/doku 10 (gegriffen, NICHT aus einer Vorschrift)
  -- Zu lange aufzubewahren ist wegen Art. 17 DSGVO kein risikofreier Default —
  -- genau deshalb ist die Regel bearbeitbar und die Herkunft sichtbar.
  select
    case p_doc_typ
      when 'protokoll'     then null
      when 'beschluss'     then null
      when 'rechnung'      then 8
      when 'korrespondenz' then 6
      else 10
    end,
    'gesetzlicher_rueckfall'::text
  where not exists (
    select 1 from public.aufbewahrungsregel as r
     where r.tenant_id = p_tenant_id
       and r.doc_typ = p_doc_typ
  )
$$;

comment on function private._aufbewahrung_jahre(uuid, text) is
  'Aufbewahrungsjahre je Dokumentart: erst die Mandantenregel, sonst ein konservativer gesetzlicher Rueckfall. Die zweite Spalte benennt, welche von beiden gegriffen hat — der Rueckfall darf in der Anzeige nicht wie eine Entscheidung des Verwalters aussehen.';

revoke all on function private._aufbewahrung_jahre(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- 6. Die Sicht
-- ---------------------------------------------------------------------------

create or replace view public.dokument_uebersicht
with (security_invoker = on) as
select
  d.tenant_id,
  d.weg_id,
  d.id                as dokument_id,
  d.titel,
  d.doc_typ,
  d.dokument_datum,
  d.created_at,
  d.deleted_at,
  v.version_no,
  v.storage_path,
  v.mime_type,
  v.file_size_bytes,
  -- § 147 Abs. 4 AO: die Frist beginnt zum Schluss des Kalenderjahrs, in dem
  -- das Dokument entstanden ist. jahre is null bedeutet dauerhaft.
  case
    when f.jahre is null then null
    else pg_catalog.make_date(
           pg_catalog.date_part('year', d.dokument_datum)::int, 12, 31
         ) + pg_catalog.make_interval(years => f.jahre)
  end::date          as aufzubewahren_bis,
  f.herkunft         as frist_herkunft
from public.document as d
left join public.document_version as v
  on v.tenant_id = d.tenant_id
 and v.id = d.current_version_id
cross join lateral private._aufbewahrung_jahre(d.tenant_id, d.doc_typ) as f;

comment on view public.dokument_uebersicht is
  'Dokument mit aktueller Version und abgeleiteter Aufbewahrungsfrist. security_invoker haelt die RLS der Basistabellen in Kraft. aufzubewahren_bis ist NULL, wenn dauerhaft aufzubewahren ist.';

grant select on public.dokument_uebersicht to authenticated;
```

- [ ] **Step 6: Migration anwenden und den Vertrag erneut laufen lassen**

```bash
cd infra && supabase db reset --local
supabase test db supabase/tests/0069_dokumentenablage.sql --local
```

Erwartet: `Result: PASS`, 11 Zusicherungen. **Tatsächlich: 12** (Abweichung 2) —
der gebaute Vertrag ist ohnehin anders aufgebaut, siehe Warnhinweis oben.

- [ ] **Step 7: Vertrag in das CI-Gate hängen**

In `justfile`, `AUDIT_DB_TESTS` am Ende ergänzen:

```
supabase/tests/0069_dokumentenablage.sql
```

- [ ] **Step 8: Volles Gate**

```bash
just test-db-all
```

Erwartet: `Files=18, Tests=341, Result: PASS` (17 + 1 Datei, 330 + 11 Zusicherungen).
**Tatsächlich nach allen sechs Tasks: `Files=19, Tests=355`** — zwei neue
Vertragsdateien (`0069` mit 12, `0071` mit 13 Zusicherungen), nicht eine; siehe
„Abweichungen" oben, Punkte 2 und 7.

- [ ] **Step 9: Commit**

```bash
git add infra/supabase/migrations/0069_dokumentenablage.sql \
        infra/supabase/tests/0069_dokumentenablage.sql justfile
git commit -m "feat(docs): document store schema with editable retention rules (0069)"
```

---

### Task 2: Typen und Modul

**Files:**
- Modify: `apps/web/src/lib/supabase/database.types.gen.ts` (neu erzeugt)
- Modify: `apps/web/src/lib/supabase/database.types.ts`
- Create: `apps/web/src/modules/dokumente/aufbewahrung.ts`
- Create: `apps/web/src/modules/dokumente/upload.ts`
- Create: `apps/web/src/modules/dokumente/index.ts`
- Create: `apps/web/src/modules/dokumente/__tests__/aufbewahrung.test.ts`
- Create: `apps/web/src/modules/dokumente/__tests__/upload.test.ts`

**Interfaces:**
- Consumes: die Sicht `public.dokument_uebersicht` aus Task 1
- Produces: `DOC_TYP_LABEL`, `formatAufbewahrung`, `istDauerhaft`, `MAX_UPLOAD_BYTES`, `ERLAUBTE_MIME_TYPEN`, `pruefeDatei`, `baueStoragePfad`

- [ ] **Step 1: Die Tests zuerst**

Create `apps/web/src/modules/dokumente/__tests__/aufbewahrung.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { DOC_TYP_LABEL, formatAufbewahrung, istDauerhaft } from "../aufbewahrung";

describe("formatAufbewahrung", () => {
  it("nennt ein Fristende im deutschen Format", () => {
    expect(formatAufbewahrung("2027-12-31", "mandantenregel")).toBe(
      "bis 31.12.2027",
    );
  });

  it("sagt dauerhaft statt ein Datum zu erfinden", () => {
    expect(formatAufbewahrung(null, "gesetzlicher_rueckfall")).toBe("dauerhaft");
  });

  it("markiert den gesetzlichen Rueckfall als Vorschlag", () => {
    // Ein Rueckfallwert darf nicht aussehen wie eine Entscheidung des
    // Verwalters — sonst haelt er ihn fuer geprueft.
    expect(formatAufbewahrung("2027-12-31", "gesetzlicher_rueckfall")).toContain(
      "Vorschlag",
    );
  });
});

describe("istDauerhaft", () => {
  it("erkennt dauerhafte Aufbewahrung am fehlenden Fristende", () => {
    expect(istDauerhaft(null)).toBe(true);
    expect(istDauerhaft("2027-12-31")).toBe(false);
  });
});

describe("DOC_TYP_LABEL", () => {
  it("benennt alle sieben Arten", () => {
    expect(Object.keys(DOC_TYP_LABEL)).toHaveLength(7);
    expect(DOC_TYP_LABEL.rechnung).toBe("Rechnung");
  });
});
```

Create `apps/web/src/modules/dokumente/__tests__/upload.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  ERLAUBTE_MIME_TYPEN,
  MAX_UPLOAD_BYTES,
  baueStoragePfad,
  pruefeDatei,
} from "../upload";

function datei(name: string, type: string, size: number): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

describe("pruefeDatei", () => {
  it("nimmt ein PDF unterhalb der Grenze an", () => {
    expect(pruefeDatei(datei("a.pdf", "application/pdf", 1_000_000))).toEqual({
      ok: true,
    });
  });

  it("lehnt eine zu grosse Datei ab und nennt die Grenze", () => {
    const r = pruefeDatei(datei("a.pdf", "application/pdf", MAX_UPLOAD_BYTES + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.meldung).toContain("10");
  });

  it("lehnt einen nicht erlaubten Dateityp ab", () => {
    const r = pruefeDatei(datei("a.exe", "application/x-msdownload", 1000));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.meldung).toContain("Dateityp");
  });

  it("lehnt eine leere Datei ab", () => {
    // file_size_bytes > 0 ist eine CHECK-Bedingung in 0015 — die Meldung soll
    // aus dem Formular kommen, nicht als Datenbankfehler.
    const r = pruefeDatei(datei("leer.pdf", "application/pdf", 0));
    expect(r.ok).toBe(false);
  });

  it("die Grenze entspricht 10 MB", () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });

  it("erlaubt genau die fuenf Typen des Buckets", () => {
    expect(ERLAUBTE_MIME_TYPEN).toHaveLength(5);
  });
});

describe("baueStoragePfad", () => {
  it("folgt dem Muster aus 0015", () => {
    expect(
      baueStoragePfad({
        tenantId: "11111111-1111-4111-8111-111111111111",
        wegId: "22222222-2222-4222-8222-222222222222",
        docTyp: "rechnung",
        dokumentId: "33333333-3333-4333-8333-333333333333",
        dateiname: "Wartung.pdf",
      }),
    ).toBe(
      "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/rechnung/33333333-3333-4333-8333-333333333333.pdf",
    );
  });

  it("nimmt die Endung aus dem Dateinamen und nichts sonst", () => {
    // Ein Dateiname aus dem Browser ist Nutzereingabe. Nur die Endung wird
    // uebernommen, der Rest des Namens landet nie im Pfad.
    expect(
      baueStoragePfad({
        tenantId: "11111111-1111-4111-8111-111111111111",
        wegId: "22222222-2222-4222-8222-222222222222",
        docTyp: "doku",
        dokumentId: "33333333-3333-4333-8333-333333333333",
        dateiname: "../../etc/passwd.pdf",
      }),
    ).toContain("/doku/33333333-3333-4333-8333-333333333333.pdf");
  });
});
```

- [ ] **Step 2: Tests laufen lassen — sie müssen scheitern**

```bash
cd apps/web && pnpm vitest run src/modules/dokumente --reporter=dot
```

Erwartet: FAIL, `Cannot find module '../aufbewahrung'`.

- [ ] **Step 3: Typen neu erzeugen**

```bash
cd infra && supabase gen types typescript --local > ../apps/web/src/lib/supabase/database.types.gen.ts
```

Dann in `apps/web/src/lib/supabase/database.types.ts` von Hand ergänzen:

```ts
export type DocTyp =
  | "beschluss"
  | "protokoll"
  | "doku"
  | "rechnung"
  | "vertrag"
  | "bescheid"
  | "korrespondenz";

export type FristHerkunft = "mandantenregel" | "gesetzlicher_rueckfall";
```

- [ ] **Step 4: `aufbewahrung.ts` schreiben**

```ts
import type { DocTyp, FristHerkunft } from "@/lib/supabase/database.types";

export const DOC_TYP_LABEL: Record<DocTyp, string> = {
  beschluss: "Beschluss",
  protokoll: "Protokoll",
  doku: "Sonstige Unterlage",
  rechnung: "Rechnung",
  vertrag: "Vertrag",
  bescheid: "Bescheid",
  korrespondenz: "Korrespondenz",
};

/** Kein Fristende heisst dauerhaft — nicht "unbekannt". */
export function istDauerhaft(aufzubewahrenBis: string | null): boolean {
  return aufzubewahrenBis === null;
}

/**
 * Die Frist wird NICHT hier gerechnet. Sie kommt aus der Sicht
 * `dokument_uebersicht`; diese Funktion formatiert nur.
 *
 * Der Zusatz "Vorschlag" beim gesetzlichen Rueckfall ist kein Schmuck: ohne
 * ihn sieht ein gegriffener Wert aus wie eine gepruefte Entscheidung.
 */
export function formatAufbewahrung(
  aufzubewahrenBis: string | null,
  herkunft: FristHerkunft,
): string {
  const basis = istDauerhaft(aufzubewahrenBis)
    ? "dauerhaft"
    : `bis ${new Date(aufzubewahrenBis as string).toLocaleDateString("de-DE")}`;

  return herkunft === "gesetzlicher_rueckfall" ? `${basis} (Vorschlag)` : basis;
}
```

- [ ] **Step 5: `upload.ts` schreiben**

```ts
import type { DocTyp } from "@/lib/supabase/database.types";

/**
 * 10 MB. Dieselbe Zahl steht in apps/web/next.config.ts als
 * serverActions.bodySizeLimit und als file_size_limit am Bucket weg-docs.
 * Weicht eine der drei ab, scheitert der Upload an einer anderen Stelle als
 * der Nutzer erwartet.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Identisch zur allowed_mime_types-Liste des Buckets aus 0015. */
export const ERLAUBTE_MIME_TYPEN = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export type DateiPruefung = { ok: true } | { ok: false; meldung: string };

export function pruefeDatei(datei: File): DateiPruefung {
  if (datei.size === 0) {
    return { ok: false, meldung: "Die Datei ist leer." };
  }
  if (datei.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      meldung: `Die Datei ist zu groß. Erlaubt sind 10 MB, diese hat ${(
        datei.size /
        1024 /
        1024
      ).toFixed(1)} MB.`,
    };
  }
  if (!(ERLAUBTE_MIME_TYPEN as readonly string[]).includes(datei.type)) {
    return {
      ok: false,
      meldung:
        "Dieser Dateityp ist nicht erlaubt. Möglich sind PDF, PNG, JPEG, DOCX und XLSX.",
    };
  }
  return { ok: true };
}

// Abweichung 3: Diese erste Fassung hat kein Versionssegment. Task 3 fügte
// eines hinzu (versionNo, eindeutig) — ohne wäre eine zweite Version auf
// denselben Pfad wie die erste getroffen, und weg-docs vergibt keine
// UPDATE-Policy (0015:265-273). Siehe „Abweichungen" oben, Punkt 3, für die
// tatsächliche Signatur in modules/dokumente/upload.ts.
/**
 * Pfadmuster aus 0015: <tenant>/<weg>/<doc_typ>/<uuid>.<ext>
 *
 * Aus dem Dateinamen wird ausschliesslich die Endung uebernommen. Der Name
 * kommt aus dem Browser und ist Nutzereingabe; er darf den Pfad nicht
 * mitbestimmen.
 */
export function baueStoragePfad(args: {
  tenantId: string;
  wegId: string;
  docTyp: DocTyp;
  dokumentId: string;
  dateiname: string;
}): string {
  const endung = args.dateiname.split(".").pop()?.toLowerCase() ?? "bin";
  const sicher = /^[a-z0-9]{1,8}$/.test(endung) ? endung : "bin";
  return `${args.tenantId}/${args.wegId}/${args.docTyp}/${args.dokumentId}.${sicher}`;
}
```

- [ ] **Step 6: Barrel anlegen**

Create `apps/web/src/modules/dokumente/index.ts`:

```ts
export {
  DOC_TYP_LABEL,
  formatAufbewahrung,
  istDauerhaft,
} from "./aufbewahrung";
export {
  ERLAUBTE_MIME_TYPEN,
  MAX_UPLOAD_BYTES,
  baueStoragePfad,
  pruefeDatei,
} from "./upload";
export type { DateiPruefung } from "./upload";
```

- [ ] **Step 7: Tests laufen lassen**

```bash
cd apps/web && pnpm vitest run src/modules/dokumente --reporter=dot
```

Erwartet: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/supabase/database.types.gen.ts \
        apps/web/src/lib/supabase/database.types.ts \
        apps/web/src/modules/dokumente
git commit -m "feat(docs): document module with retention display and upload guards"
```

---

### Task 3: Upload-Grenze und Dokumentenrouten

**Files:**
- Modify: `apps/web/next.config.ts`
- Create: `infra/supabase/migrations/0070_weg_docs_bucket_limit.sql`
- Create: `apps/web/src/app/(dashboard)/wegs/[id]/dokumente/page.tsx`
- Create: `apps/web/src/app/(dashboard)/wegs/[id]/dokumente/actions.ts`
- Create: `apps/web/src/app/(dashboard)/wegs/[id]/dokumente/neu/page.tsx`
- Create: `apps/web/src/app/(dashboard)/wegs/[id]/dokumente/neu/upload-form.tsx`
- Create: `apps/web/src/app/(dashboard)/wegs/[id]/dokumente/[dokumentId]/page.tsx`
- Create: `apps/web/src/app/(dashboard)/wegs/[id]/dokumente/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `pruefeDatei`, `baueStoragePfad`, `MAX_UPLOAD_BYTES` aus Task 2; `runFormAction`, `logPostgrestError`
- Produces: `uploadDokumentAction(prev: DokumentFormState, formData: FormData)`, `neueVersionAction`, `loescheDokumentAction`

- [ ] **Step 1: Die Grenze an beiden Stellen setzen**

In `apps/web/next.config.ts` ergänzen:

```ts
  // 10 MB. Der Standardwert ist 1 MB und hat einen Sicherheitszweck — die
  // Next.js-Doku nennt "excessive server resources in parsing large amounts of
  // data" und "potential DDoS attacks". Von einem sicheren Standard weicht man
  // so weit ab wie noetig und nicht weiter: eingescannte Protokolle und
  // Rechnungen liegen praktisch immer unter 10 MB.
  //
  // Dieselbe Zahl steht in modules/dokumente/upload.ts und als
  // file_size_limit am Bucket weg-docs (Migration 0070).
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
```

Create `infra/supabase/migrations/0070_weg_docs_bucket_limit.sql`:

```sql
-- WEG-Verwaltung migration 0070: Bucket-Grenze an die Upload-Grenze angleichen.
--
-- Zweck:
--   0015 setzte file_size_limit auf 100 MB. Die Web-App laedt ueber eine
--   Server Action hoch, und deren Body ist auf 10 MB begrenzt. Zwei
--   verschiedene Grenzen bedeuten zwei verschiedene Fehlermeldungen fuer
--   dieselbe Ursache — und eine Datei zwischen 10 und 100 MB scheitert an der
--   App, obwohl der Bucket sie erlauben wuerde.
--
-- Betroffene Tabellen:
--   storage.buckets (nur der Wert fuer weg-docs).
--
-- RLS-Auswirkung:
--   keine.
--
-- Teststrategie:
--   Teil des 0069-Vertrags waere falsch (andere Migration); hier genuegt der
--   Migrations-Texttest in apps/web/src/lib/supabase/__tests__.
--
-- Rollback / Forward-Fix:
--   Vorwaerts-Fix: neue Migration mit anderem Wert.

update storage.buckets
   set file_size_limit = 10485760          -- 10 MB, wie serverActions.bodySizeLimit
 where id = 'weg-docs';
```

- [ ] **Step 2: Migration anwenden und Gate laufen lassen**

```bash
cd infra && supabase db reset --local
cd .. && just test-db-all
```

Erwartet: `Result: PASS`, unverändert 18 Dateien.

- [ ] **Step 3: Action-Test zuerst**

Create `apps/web/src/app/(dashboard)/wegs/[id]/dokumente/__tests__/actions.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/action-kernel", async () => {
  const actual = await vi.importActual<
    typeof import("@/modules/action-kernel")
  >("@/modules/action-kernel");
  return { ...actual };
});

import { parseDokumentForm } from "../actions";

function fd(entries: Record<string, string | File>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

const PDF = new File(["inhalt"], "wartung.pdf", { type: "application/pdf" });

describe("parseDokumentForm", () => {
  it("nimmt eine vollstaendige Eingabe an", () => {
    const r = parseDokumentForm(
      fd({
        weg_id: "22222222-2222-4222-8222-222222222222",
        titel: "Heizungswartung 2019",
        doc_typ: "rechnung",
        dokument_datum: "2019-03-15",
        datei: PDF,
      }),
    );
    expect("input" in r).toBe(true);
  });

  it("verlangt ein Dokumentdatum", () => {
    // Ohne Datum waere die Aufbewahrungsfrist falsch — deshalb Pflicht, und
    // die Meldung kommt aus dem Formular, nicht als 23502 aus der Datenbank.
    const r = parseDokumentForm(
      fd({
        weg_id: "22222222-2222-4222-8222-222222222222",
        titel: "Ohne Datum",
        doc_typ: "rechnung",
        dokument_datum: "",
        datei: PDF,
      }),
    );
    expect("errors" in r).toBe(true);
    if ("errors" in r) expect(r.errors.errors?.dokument_datum).toBeDefined();
  });

  it("lehnt ein Datum in der Zukunft ab", () => {
    const morgen = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const r = parseDokumentForm(
      fd({
        weg_id: "22222222-2222-4222-8222-222222222222",
        titel: "Von morgen",
        doc_typ: "rechnung",
        dokument_datum: morgen,
        datei: PDF,
      }),
    );
    expect("errors" in r).toBe(true);
  });

  it("lehnt eine unbekannte Dokumentart ab", () => {
    const r = parseDokumentForm(
      fd({
        weg_id: "22222222-2222-4222-8222-222222222222",
        titel: "Falsche Art",
        doc_typ: "quittung",
        dokument_datum: "2019-03-15",
        datei: PDF,
      }),
    );
    expect("errors" in r).toBe(true);
  });

  it("verlangt eine Datei", () => {
    const r = parseDokumentForm(
      fd({
        weg_id: "22222222-2222-4222-8222-222222222222",
        titel: "Ohne Datei",
        doc_typ: "rechnung",
        dokument_datum: "2019-03-15",
      }),
    );
    expect("errors" in r).toBe(true);
  });
});
```

- [ ] **Step 4: Test laufen lassen — muss scheitern**

```bash
cd apps/web && pnpm vitest run "src/app/(dashboard)/wegs/[id]/dokumente" --reporter=dot
```

Erwartet: FAIL, `parseDokumentForm` existiert nicht.

- [ ] **Step 5: `actions.ts` schreiben**

> **Dieser Code-Block wurde nicht so gebaut.** Drei Punkte weichen ab —
> Reihenfolge (Abweichung 4), die Kompensation ruft eine Storage-Löschung auf,
> die es nicht geben kann (Abweichung 5), und `parseDokumentForm` steht hier
> statt in `modules/dokumente/form.ts` (Abweichung 6). Siehe „Abweichungen"
> oben für Details und Begründung; die tatsächliche Datei ist
> `apps/web/src/app/(dashboard)/wegs/[id]/dokumente/actions.ts`.

```ts
"use server";

import { createHash } from "node:crypto";

import { logPostgrestError, runFormAction } from "@/modules/action-kernel";
import type { ParseResult } from "@/modules/action-kernel";
import { baueStoragePfad, pruefeDatei } from "@/modules/dokumente";
import type { DocTyp } from "@/lib/supabase/database.types";

export interface DokumentFormState {
  errors?: {
    titel?: string[];
    doc_typ?: string[];
    dokument_datum?: string[];
    datei?: string[];
    _form?: string[];
  };
}

interface DokumentInput {
  wegId: string;
  titel: string;
  docTyp: DocTyp;
  dokumentDatum: string;
  datei: File;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DOC_TYPEN: DocTyp[] = [
  "beschluss",
  "protokoll",
  "doku",
  "rechnung",
  "vertrag",
  "bescheid",
  "korrespondenz",
];

/** Exportiert, damit die Validierung ohne Datenbank testbar ist. */
export function parseDokumentForm(
  formData: FormData,
): ParseResult<DokumentInput, DokumentFormState> {
  const errors: NonNullable<DokumentFormState["errors"]> = {};

  const wegId = String(formData.get("weg_id") ?? "");
  const titel = String(formData.get("titel") ?? "").trim();
  const docTyp = String(formData.get("doc_typ") ?? "");
  const dokumentDatum = String(formData.get("dokument_datum") ?? "");
  const datei = formData.get("datei");

  if (!UUID_RE.test(wegId)) errors._form = ["Ungültige WEG."];
  if (titel.length === 0) errors.titel = ["Bitte einen Titel angeben."];
  if (!DOC_TYPEN.includes(docTyp as DocTyp)) {
    errors.doc_typ = ["Bitte eine Dokumentart wählen."];
  }

  if (!ISO_DATE_RE.test(dokumentDatum)) {
    errors.dokument_datum = ["Bitte das Datum des Dokuments angeben."];
  } else if (dokumentDatum > new Date().toISOString().slice(0, 10)) {
    // Ein Datum in der Zukunft würde die Aufbewahrungsfrist zu lang machen.
    errors.dokument_datum = ["Das Datum darf nicht in der Zukunft liegen."];
  }

  if (!(datei instanceof File)) {
    errors.datei = ["Bitte eine Datei auswählen."];
  } else {
    const pruefung = pruefeDatei(datei);
    if (!pruefung.ok) errors.datei = [pruefung.meldung];
  }

  if (Object.keys(errors).length > 0) return { errors: { errors } };

  return {
    input: {
      wegId,
      titel,
      docTyp: docTyp as DocTyp,
      dokumentDatum,
      datei: datei as File,
    },
  };
}

export async function uploadDokumentAction(
  _prev: DokumentFormState,
  formData: FormData,
): Promise<DokumentFormState> {
  return runFormAction<DokumentInput, DokumentFormState>(
    {
      scope: "uploadDokument",
      guardError: (message) => ({ errors: { _form: [message] } }),
      parse: parseDokumentForm,
      execute: async (ctx, input) => {
        // 1. Dokumentzeile zuerst — sie liefert die ID für den Pfad.
        const { data: doc, error: docError } = await ctx.supabase
          .from("document")
          .insert({
            weg_id: input.wegId,
            doc_typ: input.docTyp,
            titel: input.titel,
            dokument_datum: input.dokumentDatum,
            created_by: ctx.userId,
          })
          .select("id")
          .single();

        if (docError || !doc) {
          logPostgrestError("uploadDokument.document", docError);
          return { errors: { errors: { _form: ["Anlegen fehlgeschlagen."] } } };
        }

        const pfad = baueStoragePfad({
          tenantId: ctx.tenantId,
          wegId: input.wegId,
          docTyp: input.docTyp,
          dokumentId: doc.id,
          dateiname: input.datei.name,
        });

        const bytes = Buffer.from(await input.datei.arrayBuffer());

        // 2. Hochladen.
        const { error: uploadError } = await ctx.supabase.storage
          .from("weg-docs")
          .upload(pfad, bytes, {
            contentType: input.datei.type,
            upsert: false,
          });

        if (uploadError) {
          logPostgrestError("uploadDokument.storage", uploadError);
          return {
            errors: { errors: { datei: ["Hochladen fehlgeschlagen."] } },
          };
        }

        // 3. Version eintragen. Die Prüfsumme entsteht hier, serverseitig —
        //    eine im Browser gerechnete wäre nur eine Behauptung des Clients
        //    und könnte späteres Verändern nicht mehr belegen.
        const sha256 = "\\x" + createHash("sha256").update(bytes).digest("hex");

        const { error: versionError } = await ctx.supabase
          .from("document_version")
          .insert({
            document_id: doc.id,
            version_no: 1,
            storage_path: pfad,
            mime_type: input.datei.type,
            file_size_bytes: bytes.byteLength,
            sha256,
            uploaded_by: ctx.userId,
          });

        if (versionError) {
          logPostgrestError("uploadDokument.version", versionError);
          // Kompensation: Storage und Datenbank liegen nicht in einer
          // Transaktion. Scheitert auch das Aufräumen, wird es protokolliert
          // statt verschwiegen — sonst bleibt eine verwaiste Datei unbemerkt.
          const { error: cleanupError } = await ctx.supabase.storage
            .from("weg-docs")
            .remove([pfad]);
          if (cleanupError) {
            logPostgrestError("uploadDokument.cleanup", cleanupError);
          }
          return {
            errors: { errors: { _form: ["Speichern fehlgeschlagen."] } },
          };
        }

        return {
          revalidate: [`/wegs/${input.wegId}/dokumente`],
          redirectTo: `/wegs/${input.wegId}/dokumente`,
        };
      },
    },
    formData,
  );
}
```

- [ ] **Step 6: Tests laufen lassen**

```bash
cd apps/web && pnpm vitest run "src/app/(dashboard)/wegs/[id]/dokumente" --reporter=dot
```

Erwartet: PASS.

- [ ] **Step 7: Die drei Seiten bauen**

`page.tsx` liest die Sicht statt der Tabellen:

```tsx
const { data: dokumente } = await supabase
  .from("dokument_uebersicht")
  .select(
    "dokument_id, titel, doc_typ, dokument_datum, version_no, file_size_bytes, aufzubewahren_bis, frist_herkunft",
  )
  .eq("weg_id", wegId)
  .is("deleted_at", null)
  .order("dokument_datum", { ascending: false });
```

Die Frist wird mit `formatAufbewahrung(d.aufzubewahren_bis, d.frist_herkunft)` angezeigt — nicht neu gerechnet.

`neu/upload-form.tsx` ist ein Client-Component mit `useActionState(uploadDokumentAction, {})`, Feldern für Titel, Art (Auswahl über `DOC_TYP_LABEL`), Dokumentdatum und Datei, und einem `SubmitButton` mit `useFormStatus` — wie `teile-form.tsx` in `finanzen/verteilungsschluessel/[keyId]/`.

`[dokumentId]/page.tsx` listet alle Versionen aus `document_version` absteigend und bietet je Version einen Download über eine signierte URL:

```ts
const { data: signed } = await supabase.storage
  .from("weg-docs")
  .createSignedUrl(version.storage_path, 60);
```

- [ ] **Step 8: Prüfen und committen**

```bash
./scripts/verify.sh
git add apps/web/next.config.ts infra/supabase/migrations/0070_weg_docs_bucket_limit.sql \
        "apps/web/src/app/(dashboard)/wegs/[id]/dokumente"
git commit -m "feat(docs): upload, list and version routes for the document store"
```

---

### Task 4: Einstellungen für die Fristregeln

> **Abweichung 7:** Diese Dateiliste fehlt eine Migration. Tatsächlich brachte
> Task 4 `infra/supabase/migrations/0071_aufbewahrung_effektiv.sql` samt
> `infra/supabase/tests/0071_aufbewahrung_effektiv.sql` (13 Zusicherungen) —
> ohne die neue Sicht `aufbewahrung_effektiv` hätte die Seite die
> Rückfallwerte in TypeScript duplizieren müssen. Details: „Abweichungen"
> oben.

**Files:**
- Create: `apps/web/src/app/(dashboard)/einstellungen/aufbewahrung/page.tsx`
- Create: `apps/web/src/app/(dashboard)/einstellungen/aufbewahrung/regel-form.tsx`
- Create: `apps/web/src/app/(dashboard)/einstellungen/aufbewahrung/actions.ts`
- Create: `apps/web/src/app/(dashboard)/einstellungen/aufbewahrung/__tests__/actions.test.ts`
- Modify: `apps/web/src/app/(dashboard)/einstellungen/page.tsx` (Verweis ergänzen) — **tatsächlich `modules/settings/settings-nav.ts` (`SETTINGS_SUBNAV`)**, weil `einstellungen/page.tsx` nur eine Weiterleitung ohne Platz für einen Link ist
- Create: `infra/supabase/migrations/0071_aufbewahrung_effektiv.sql` (Abweichung 7, im Plan ursprünglich nicht vorgesehen)
- Create: `infra/supabase/tests/0071_aufbewahrung_effektiv.sql`

**Interfaces:**
- Consumes: `DOC_TYP_LABEL` aus Task 2
- Produces: `speichereRegelAction(prev: RegelFormState, formData: FormData)`; `public.aufbewahrung_effektiv(doc_typ, jahre, herkunft, rechtsgrundlage, notiz, tenant_id)` (Abweichung 7)

- [ ] **Step 1: Test zuerst — die Mehrdeutigkeit von „0" ist der Kern**

```ts
import { describe, expect, it } from "vitest";
import { parseRegelForm } from "../actions";

function fd(e: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(e)) f.append(k, v);
  return f;
}

describe("parseRegelForm", () => {
  it("nimmt eine Jahreszahl an", () => {
    const r = parseRegelForm(fd({ doc_typ: "rechnung", jahre: "10" }));
    expect("input" in r).toBe(true);
    if ("input" in r) expect(r.input.jahre).toBe(10);
  });

  it("deutet ein leeres Feld als dauerhaft", () => {
    const r = parseRegelForm(fd({ doc_typ: "protokoll", jahre: "" }));
    expect("input" in r).toBe(true);
    if ("input" in r) expect(r.input.jahre).toBeNull();
  });

  it("lehnt 0 ab statt sie als dauerhaft zu deuten", () => {
    // Number("") ist 0 — ohne diese Prüfung würde ein leeres Feld als
    // "0 Jahre" durchgehen und die Frist stillschweigend auf sofort setzen.
    const r = parseRegelForm(fd({ doc_typ: "rechnung", jahre: "0" }));
    expect("errors" in r).toBe(true);
  });

  it("lehnt eine unsinnig lange Frist ab", () => {
    expect("errors" in parseRegelForm(fd({ doc_typ: "rechnung", jahre: "500" }))).toBe(
      true,
    );
  });
});
```

- [ ] **Step 2: Rot sehen, dann `actions.ts` schreiben**

`parseRegelForm` unterscheidet ausdrücklich `""` (dauerhaft, `null`) von `"0"` (Fehler). `speichereRegelAction` schreibt per `upsert` auf `(tenant_id, doc_typ)` und revalidiert `/einstellungen/aufbewahrung` **und** die Dokumentenlisten — sonst steht dort eine veraltete Frist.

- [ ] **Step 3: Seite und Formular**

Die Seite listet alle sieben Arten. Für jede zeigt sie die geltende Frist und woher sie stammt — der Rückfall ist als solcher beschriftet, nicht als Zahl ohne Herkunft. `rechtsgrundlage` ist ein Freitextfeld mit anklickbaren Vorschlägen („§ 147 Abs. 3 Nr. 4 AO — acht Jahre", „§ 147 Abs. 3 — sechs Jahre", „dauerhaft"), die überschreibbar sind.

- [ ] **Step 4: Prüfen und committen**

```bash
./scripts/verify.sh
git add "apps/web/src/app/(dashboard)/einstellungen"
git commit -m "feat(docs): editable retention rules in settings"
```

---

### Task 5: E2E — der Beweis, dass die Regel Daten ist

**Files:**
- Create: `apps/web/e2e/dokumente.spec.ts`
- Create: `apps/web/e2e/fixtures/test.pdf` (kleine, echte PDF-Datei)

**Interfaces:**
- Consumes: alle vorherigen Tasks
- Produces: nichts

- [ ] **Step 1: Den Spec schreiben**

Drei Tests. Der dritte trägt den ganzen Ansatz:

```ts
test("eine geänderte Fristregel schlägt auf die Dokumentenliste durch", async ({
  page,
}) => {
  // 1. Rechnung mit Dokumentdatum 2019-03-15 hochladen.
  //    Gesetzlicher Rückfall: 8 Jahre -> bis 31.12.2027
  // ...
  await expect(page.getByText("bis 31.12.2027")).toBeVisible();

  // 2. In den Einstellungen auf 10 Jahre stellen.
  await page.goto("/einstellungen/aufbewahrung");
  // ...

  // 3. Zurück zur Liste: dieselbe Rechnung, neue Frist.
  //    Ohne diesen Schritt bliebe "einstellbar" eine Behauptung.
  await expect(page.getByText("bis 31.12.2029")).toBeVisible();
});
```

Synchronisiert wird auf **Werte, die sich ändern** (`31.12.2027` → `31.12.2029`), nicht auf Meldungstexte.

- [ ] **Step 2: Freigabe einholen, dann laufen lassen**

`just e2e` läuft gegen die Cloud und ist freigabepflichtig. **Nicht ohne ausdrückliche Freigabe ausführen.** Mit Freigabe:

```bash
pnpm --filter @weg-verwaltung/web exec playwright test dokumente
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/dokumente.spec.ts apps/web/e2e/fixtures/test.pdf
git commit -m "test(e2e): prove the retention rule is data, not code"
```

---

### Task 6: Produkttexte und Dokumentation

**Files:**
- Modify: `apps/web/src/app/page.tsx`, `apps/web/src/app/preise/page.tsx`, `apps/web/src/app/__tests__/page.test.tsx`
- Modify: `AGENTS.md`, `PROJECT_REALITY.md`, `TEST_INFRA.md`, `docs/09-tom-art32.md`
- Create: `docs/agent-reports/2026-09-22-worker-general-dokumentenablage.md`

- [ ] **Step 1: Die Startseite ehrlich machen**

Dort steht heute „Keine Bankanbindung, keine Dokumentenablage, kein Mahnwesen und keine Rechtsberatung." Der mittlere Teil wird falsch.

Neue Formulierung — sie muss die Grenze mittragen:

> Dokumentenablage für die Verwaltung: Unterlagen je WEG ablegen, versionieren und mit Aufbewahrungsfrist führen. **Kein Eigentümerportal** — die Einsicht nach § 18 Abs. 4 WEG gewährt weiterhin der Verwalter.

Die Grenzenzeile wird zu „Keine Bankanbindung, kein Mahnwesen und keine Rechtsberatung."

`page.test.tsx` entsprechend anpassen — der Test pinnt die Aussagen.

- [ ] **Step 2: Zahlen und Stand nachziehen**

- `AGENTS.md`: Migrationsstand `0070`, Dokumentenablage im Abschnitt „Aktueller Stand"
- `TEST_INFRA.md`: Migrationsspanne, Vertragszahl und Zusicherungen
- `PROJECT_REALITY.md`: Implemented-Eintrag, Next Logical Step
- `docs/09-tom-art32.md` § 9.6: Vertragszahl und Zusicherungen

- [ ] **Step 3: Agent-Report nach `docs/agent-reports/report-template.md`**

- [ ] **Step 4: Letzter voller Lauf und Commit**

```bash
just test-db-all
./scripts/verify.sh
git add -A
git commit -m "docs: bring copy and project docs in line with the document store"
```

---

## Self-Review

**Spec-Abdeckung.** Jeder Abschnitt der Spec hat eine Task: Datenmodell → Task 1; Oberfläche → Task 3 und 4; Upload → Task 3; Tests → Task 1, 2, 3, 4, 5; Produkttexte → Task 6; der Nebenbefund zum Audit-Emitter → Task 1 Schritt 5.

**Eine Abweichung von der Spec, bewusst:** Die Bucket-Grenze wandert in eine eigene Migration `0070` statt in `0069`. Grund: `0069` ändert Fachschema, `0070` ändert eine Betriebsgrenze. Ein Rückbau der einen soll die andere nicht mitreißen.

**Platzhalter.** Keine. Die Seiten in Task 3 Schritt 7 und Task 4 Schritt 3 sind als Struktur mit den tragenden Abfragen beschrieben statt als vollständiges JSX — die Formularmuster stehen als benannte Vorlage im Repository (`teile-form.tsx`), und sie abzuschreiben hätte den Plan verdoppelt, ohne eine Entscheidung zu treffen.

**Typkonsistenz.** `DocTyp` und `FristHerkunft` entstehen in Task 2 und werden in Task 3 und 4 unter genau diesen Namen benutzt. `formatAufbewahrung(aufzubewahrenBis, herkunft)` hat in Task 2, 3 und 4 dieselbe Signatur. `pruefeDatei` liefert überall `DateiPruefung`.
