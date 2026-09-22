-- WEG-Verwaltung pgTAP contract: RLS-Abdeckung ueber den gesamten Katalog.
--
-- Scope:
--   - Jede Tabelle in `public` traegt `relrowsecurity` UND `relforcerowsecurity`.
--   - Jede Nicht-Partition in `public` traegt mindestens eine Policy.
--   - Das Schema `private` enthaelt ueberhaupt keine Tabellen.
--
-- Warum dieser Vertrag existiert:
--   Mandantentrennung ist die zentrale Zusage dieser Anwendung, und sie war
--   bis hierher die einzige Kernzusage ohne Test. Gemessen am 2026-09-22 gegen
--   Migrationsstand 0067 war der Katalog vollstaendig in Ordnung: 63 von 63
--   Tabellen (61 mit relkind 'r', davon 16 Partitionen, plus 2 partitionierte
--   Elterntabellen) trugen beide Flags, und jede Nicht-Partition hatte eine
--   Policy. Die Massnahme war also umgesetzt — aber sie beruhte auf Disziplin
--   statt auf einer Pruefung. Tabelle 64 ohne RLS waere gruen durchgelaufen.
--
--   `docs/09-tom-art32.md` § 9.1 fuehrte die Trennungskontrolle deshalb als
--   „teilweise" statt „belegt". Dieser Vertrag macht aus der Konvention eine
--   Invariante: eine neue Tabelle ohne RLS macht die Suite rot, bevor sie
--   ausgerollt werden kann.
--
-- Warum keine Nummer einer Migration:
--   Dieser Vertrag gehoert zu keiner einzelnen Migration, sondern zum Zustand
--   des gesamten Katalogs. `0000` sortiert ihn vor alle migrationsgebundenen
--   Vertraege und sagt genau das aus.
--
-- Warum `relkind in ('r','p')`:
--   Der Vorschlag in § 9.7 prueft nur `relkind = 'r'` und uebersieht damit die
--   partitionierten Elterntabellen (`'p'`). Genau deren Policies schuetzen den
--   Zugriff ueber das Partition-Routing — sie duerfen am wenigsten fehlen.
--
-- Warum eine Untergrenze mitgeprueft wird:
--   Vier der fuenf Zusicherungen zaehlen Verstoesse und erwarten 0. Eine
--   Abfrage, die versehentlich gar nichts mehr trifft — falsches Schema,
--   umbenannte Katalogspalte, leere Datenbank — liefert ebenfalls 0 und waere
--   still gruen. Die erste Zusicherung haelt dagegen: sie belegt, dass der
--   Katalog ueberhaupt gelesen wurde. Ohne sie waere dieser Vertrag genau der
--   Schein-Test, den er verhindern soll.
--
-- Laeuft ohne Fixtures und veraendert nichts.

begin;

select plan(5);

-- ============================================================================
-- 1. Untergrenze zuerst: beweist, dass die Katalogabfrage etwas sieht.
-- ============================================================================

-- Am 2026-09-22 waren es 63. Die Untergrenze laesst Luft nach unten, damit eine
-- bewusst entfernte Tabelle den Vertrag nicht rot macht, faengt aber jede
-- Abfrage ab, die ins Leere laeuft.
select cmp_ok(
  (select count(*)::int
     from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')),
  '>=',
  60,
  'die Katalogabfrage sieht mindestens 60 Tabellen in public'
);

-- ============================================================================
-- 2. RLS ist auf jeder Tabelle eingeschaltet.
-- ============================================================================

select is(
  (select count(*)::int
     from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity),
  0,
  'jede Tabelle in public hat RLS eingeschaltet'
);

-- ============================================================================
-- 3. FORCE RLS gilt auch fuer den Eigentuemer der Tabelle.
-- ============================================================================

-- Ohne FORCE umgeht der Tabelleneigentuemer jede Policy. Da Migrationen als
-- Eigentuemer laufen, ist das kein theoretischer Fall.
select is(
  (select count(*)::int
     from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relforcerowsecurity),
  0,
  'jede Tabelle in public hat FORCE ROW LEVEL SECURITY'
);

-- ============================================================================
-- 4. Eingeschaltetes RLS ohne Policy ist eine verschlossene Tuer ohne Schluss.
-- ============================================================================

-- Partitionen sind ausgenommen: sie erben den Zugriff ueber die Policies der
-- Elterntabelle, und eigene Policies waeren dort Duplikate. Genau daher kommt
-- auch das `rls_enabled_no_policy`-INFO des Supabase-Advisors (siehe
-- 0014-Header und den AGENTS.md-Backlog).
select is(
  (select count(*)::int
     from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relispartition
      and not exists (
        select 1
          from pg_catalog.pg_policy p
         where p.polrelid = c.oid
      )),
  0,
  'jede Nicht-Partition in public hat mindestens eine Policy'
);

-- ============================================================================
-- 5. Im Schema `private` liegen Helfer, keine Daten.
-- ============================================================================

-- `private` ist fuer PostgREST nicht erreichbar und traegt deshalb keine
-- Policies. Genau darum darf dort auch keine Tabelle entstehen: sie waere
-- unsichtbar fuer jede Mandantenpruefung. Am 2026-09-22 war das Schema
-- tabellenfrei. Wer hier eine Tabelle anlegt, macht diesen Vertrag rot und
-- muss die Entscheidung bewusst treffen.
select is(
  (select count(*)::int
     from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private'
      and c.relkind in ('r', 'p')),
  0,
  'das Schema private enthaelt keine Tabellen'
);

select * from finish();

rollback;
