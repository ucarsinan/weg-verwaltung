# WEG-Verwaltung Agent Report

Datum: `2026-09-22`
Agent/Rolle: `Claude (Opus 5)`
Task: `Katalogweite RLS-Zusicherung als pgTAP-Vertrag (docs/09-tom-art32.md § 9.7)`
Betroffener Worker-Bereich: `Security / Datenbankvertraege`

## Kurzfazit

Erledigt und gegen einen echten Verstoss geprueft. Die Mandantentrennung war die
zentrale Zusage dieser Anwendung und bis hierher die einzige Kernzusage ohne
Test. `infra/supabase/tests/0000_rls_katalog.sql` schliesst das mit fuenf
fixture-freien Zusicherungen.

## Was bedeutet das?

Bisher galt: jede Tabellenmigration schaltet RLS und FORCE RLS ein, weil es so
Konvention ist. Niemand pruefte nach. Eine neue Tabelle ohne RLS waere gruen
durch CI gelaufen, und die Mandantentrennung waere fuer diese Tabelle
unwirksam gewesen — ohne dass es jemandem aufgefallen waere.

Jetzt macht genau das die Suite rot, bevor die Migration ausgerollt werden kann.

## Handfester Fahrplan

1. `docs/09-tom-art32.md` per PR #22 — erledigt.
2. Doku-Rueckstand auf `0067` per PR #23 — erledigt.
3. Katalogweite RLS-Zusicherung — dieser Report. Freigabe fuer Merge noetig.
4. Backup-/Wiederherstellungsregime — Betriebsentscheidung.
5. Cloud-Migrationsstand abgleichen — freigabepflichtig.

## Entscheidung fuer den Nutzer

Freigeben. Der Vertrag fuegt nur Tests hinzu; er aendert kein Schema, keine
Policy und keine Anwendung. Er laeuft gegen eine ephemere lokale Datenbank und
fasst die Cloud nicht an.

## Findings

**Finding 1 — Der Vorschlag aus § 9.7 haette zwei Tabellen uebersehen**

- Status: `SUPPORTED`
- Prioritaet: `P2`
- Problem: Der in der TOM-Liste notierte Wortlaut prueft `relkind = 'r'`. Damit
  faellt `relkind = 'p'` heraus — die partitionierten Elterntabellen.
- Auswirkung: Gemessen sind das zwei Tabellen. Gerade deren Policies schuetzen
  den Zugriff ueber das Partition-Routing; ein fehlendes FORCE RLS dort waere
  gravierender als an einer Blatt-Tabelle. Die Messung waechst von 61 auf 63.
- Naechster Schritt: Der umgesetzte Vertrag prueft `relkind in ('r','p')` —
  umgesetzt. § 9.7 wurde entsprechend korrigiert statt kopiert.
- Begruendung: Einen eigenen Vorschlag ungeprueft zu uebernehmen, waere derselbe
  Fehler wie eine Konvention ungeprueft zu lassen.

**Finding 2 — Eine Zaehlung auf 0 kann still gruen sein**

- Status: `SUPPORTED`
- Prioritaet: `P1`
- Problem: Vier der fuenf Zusicherungen zaehlen Verstoesse und erwarten `0`.
  Eine Abfrage, die gar nichts mehr trifft — falsches Schema, umbenannte
  Katalogspalte, leere Datenbank — liefert ebenfalls `0`.
- Auswirkung: Ohne Gegenmassnahme waere dieser Vertrag genau der Schein-Test,
  den er verhindern soll. Das Repository hat diese Falle schon einmal gehabt
  (`if (isVisible())`-Huellen in der E2E-Suite).
- Naechster Schritt: Die erste Zusicherung ist eine Untergrenze — sie belegt,
  dass die Katalogabfrage mindestens 60 Tabellen sieht. Umgesetzt.
- Begruendung: Ein Test muss beweisen, dass er hingesehen hat, bevor er
  bescheinigt, nichts gefunden zu haben.

**Finding 3 — Der Vertrag wurde rot gemacht, nicht nur gruen gesehen**

- Status: `SUPPORTED`
- Prioritaet: `P2`
- Problem: Ein Vertrag, der nur im Gutfall laeuft, belegt nicht, dass er greift.
- Auswirkung: Ohne Gegenprobe waere unklar, ob die Zusicherungen ueberhaupt
  ansprechen.
- Naechster Schritt: In der lokalen Datenbank wurde eine Tabelle
  `public.zz_probe_ohne_rls` ohne RLS angelegt. Ergebnis: `Failed 3/5 subtests`
  — RLS, FORCE RLS und Policy-Pflicht schlugen gleichzeitig an. Tabelle danach
  entfernt, voller Lauf wieder gruen.
- Begruendung: Ein Test, der nie rot wird, ist Dekoration.

## Geaenderte Dateien

- `infra/supabase/tests/0000_rls_katalog.sql` — neu, 5 Zusicherungen.
- `justfile` — neue Liste `SECURITY_DB_TESTS`, neues Rezept `test-security-db`,
  Aufnahme in `test-db-all`.
- `docs/09-tom-art32.md` — § 9.1 von „teilweise" auf „belegt" mit Begruendung,
  § 9.6 Zahlen und neue Zeile, § 9.7 um die erledigte Massnahme gekuerzt,
  § 9.9 Historie.
- `docs/03-security-model.md` — Zielzustand-Punkt 10 und die naechste empfohlene
  Aufgabe (pgTAP-CI-Gate ist erledigt; jetzt Backup/Wiederherstellung).
- `TEST_INFRA.md`, `PROJECT_REALITY.md`, `AGENTS.md` — Zahlen, Verdrahtung,
  Kommandoliste, neue Reihenfolge der naechsten Schritte.

## Warum `0000` und nicht `0068`

Vertragsdateien tragen sonst die Nummer der Migration, die sie pruefen. Dieser
Vertrag gehoert zu keiner einzelnen Migration, sondern zum Zustand des gesamten
Katalogs. `0000` sortiert ihn vor alle migrationsgebundenen Vertraege und sagt
genau das aus. Eine Migration `0068` gibt es nicht und soll es fuer diesen Zweck
auch nicht geben — der Vertrag beschreibt keine Aenderung, sondern eine
Invariante.

## Ausgefuehrte Checks

- `supabase db reset --local` auf Migrationsstand `0067` (colima).
- Katalogmessung direkt per `psql` im Container, vor dem Schreiben des Vertrags:
  61 Tabellen `relkind='r'` (davon 16 Partitionen) + 2 `relkind='p'`, alle 63 mit
  RLS und FORCE RLS; 0 Nicht-Partitionen ohne Policy; 0 Tabellen im Schema
  `private`.
- `supabase test db supabase/tests/0000_rls_katalog.sql --local` — `Result: PASS`,
  5 Zusicherungen.
- Gegenprobe mit einer Tabelle ohne RLS — `Failed 3/5 subtests`, danach
  aufgeraeumt.
- `just test-db-all` — `Files=16, Tests=324, Result: PASS`.
- `./scripts/verify.sh` — siehe Git-Status.

## Git-Status

Branch `claude/rls-katalog-vertrag`, abgezweigt von `main` (`9674b57`).

## Security-Check

Der Vertrag liest ausschliesslich `pg_catalog` und veraendert nichts; er laeuft
in einer Transaktion mit `rollback`. Keine Policy, kein Grant, keine Migration
wurde angefasst. Die Probetabelle existierte nur in der ephemeren lokalen
Datenbank und wurde entfernt. Keine Cloud-Aktion.

## Bewusst nicht geaendert

- `0001_rls_negative.sql` bleibt die kommentierte Skizze. Sie aufzuwerten haette
  bedeutet, Fixtures fuer Cross-Tenant-Szenarien zu bauen — ein eigener Slice
  mit eigenem Risiko. Die Luecke war die fehlende katalogweite Zusicherung,
  nicht diese Datei.
- Keine Policy-Inhalte geprueft. Der Vertrag belegt, dass eine Policy existiert,
  nicht dass sie richtig ist. Das leisten die fachlichen Vertraege.
- `auth_rls_initplan` (7x WARN) bleibt offen — Performance, nicht Sicherheit.

## Risiken

Der Vertrag prueft die **lokale** Datenbank nach `supabase db reset`. Weicht die
Cloud vom Migrationsstand ab, sagt er darueber nichts. Genau deshalb steht der
Cloud-Abgleich als naechster freigabepflichtiger Schritt in `PROJECT_REALITY.md`.

## Folgeaufgaben

1. Backup-/Wiederherstellungsregime inkl. einem echten Wiederherstellungslauf.
2. Cloud-Migrationsstand abgleichen (freigabepflichtig).
3. AVV und Art.-30-Verzeichnis — juristische Spur.
