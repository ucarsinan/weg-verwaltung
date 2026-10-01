# WEG-Verwaltung Agent Report

Datum: `2026-10-01`
Agent/Rolle: `Claude`
Task: `Rote pgTAP-Verträge 0050/0052/0054 untersuchen; Vorgang-Audit-Emitter reparieren (0076)`
Betroffener Worker-Bereich: `Audit / Vorgangszentrale`

## Kurzfazit

Teilweise erledigt. Der Produktfehler hinter `0054` und dem Abbruch von `0052` ist behoben (`0076`), `0054` ist grün und im CI-Gate. `0050` und `0052` bleiben wegen Grant-Lücken rot und folgen in `0077`.

## Was bedeutet das?

Jeder Schreibzugriff auf eine der sieben Vorgangs-Tabellen scheiterte lokal mit `permission denied for schema auth`, weil der Audit-Emitter `auth.uid()` aufrief. Die Annahme in `AGENTS.md`/`justfile`, es sei ein Loch im lokalen Bootstrap, war falsch: `audit_writer` kann `USAGE` auf `auth` nie bekommen (Begründung im Kopf von `0028`). Der Fehler besteht auch in der Cloud (read-only belegt am 2026-10-01, siehe Nachtrag).

## Handfester Fahrplan

| Reihenfolge | Schritt | Datei/Bereich | Warum? | Freigabe noetig? |
| --- | --- | --- | --- | --- |
| 1 | Diese Änderung committen und per PR nach `main` | Branch `claude/0076-vorgang-emitter-jwt` | Gate wird um `0054` erweitert | ja (Commit, Push, PR) |
| 2 | `0077`: Grants der 0050-Objekte und der sieben `vorgang*`-Tabellen härten, 0050/0052 ins Gate | neue Migration + Tests | Least-Privilege-Vertrag erfüllen | Plan steht; Rollout nein, nur lokal |
| 3 | Cloud prüfen, ob der Emitter-Fehler live ist (`has_schema_privilege('audit_writer','auth','usage')`, Insert in `vorgang` mit Testtenant) | Cloud, read-only | belegt, ob `0076` dort dringend ist | ja |
| 4 | `0076` (und später `0077`) ausrollen | `just db-migrate` | Handarbeit, Guard verlangt getipptes `push` | ja, nur der Nutzer |

## Entscheidung fuer den Nutzer

- Empfohlene Entscheidung: Commit und PR freigeben.
- Begruendung: Ändert keine RLS-Policy, keine Grants, keine Audit-Kette; Gesamtlauf grün.
- Naechste Nutzeraktion: Commit/Push-Freigabe; danach Entscheidung zu Schritt 3.

## Findings

| Status | Prioritaet | Problem | Evidenz | Auswirkung | Konkreter Schritt | Begruendung |
| --- | --- | --- | --- | --- | --- | --- |
| SUPPORTED | P2 | `tg_emit_vorgang_audit_event` ruft `auth.uid()` als `audit_writer` | `0052:185`; lokal 42501 bei `0054:113` und `0052:274` | Kein Schreibzugriff auf Vorgangs-Tabellen möglich (lokal belegt) | `0076` | gleiche Fehlerklasse wie `0028`/`0059` |
| CONFLICTING | P3 | Annahme „Bootstrap-Lücke" in `AGENTS.md`/`justfile` | `0028`-Kopf: Grant auf `auth` ist unmöglich | Ein Bootstrap-Grant hätte nichts behoben | Doku korrigiert | Fehldiagnose beseitigt |
| SUPPORTED | P3 | `anon`/`authenticated` haben alle vier Rechte auf den sieben `vorgang*`-Tabellen | `0052` Tests 6–8; `has_table_privilege`-Abfrage | Kein Datenleck: RLS erzwungen, keine DELETE-Policy, Timeline-Trigger lehnen UPDATE/DELETE ab | `0077` | Least Privilege |
| SUPPORTED | P3 | `0050`: Tests 38/39/41/42/45/46 Grant-Lücken | lokaler Lauf | Rechte über Vertrag hinaus | `0077` | siehe oben |
| SUPPORTED | P3 | `throws_ok` mit Beschreibung als erwarteter Meldung | `0050` 52–54, `0052` 19/22–25, `0054` 6–7 | Tests rot trotz richtigem Fehlercode | `null` als Meldung eingefügt | Test-Autorenfehler; Fehlercode bleibt geprüft |
| SUPPORTED | P3 | Verschachtelte datenändernde CTE in `0052` Zeile 362 | PostgreSQL-Fehler | Test brach ab | CTE auf Top-Level | reiner Syntaxfehler |

## Geaenderte Dateien

- `infra/supabase/migrations/0076_vorgang_emitter_jwt_inline.sql`: Emitter liest den Akteur inline aus den JWT-GUCs (Muster `0059`); kein Grant auf `auth`.
- `infra/supabase/tests/0054_…sql`, `0052_…sql`: `throws_ok`-Argumente korrigiert; in 0052 die CTE verschoben. Keine Zusicherung abgeschwächt oder entfernt.
- `justfile`: `0054` in `AUDIT_DB_TESTS`, Kommentar korrigiert.
- `AGENTS.md`, `TEST_INFRA.md`, `PROJECT_REALITY.md`: Migrationsstand, Gate-Zahlen (23 Verträge, 427 Zusicherungen), Backlog-Eintrag.

## Betroffene Systembereiche

- RLS/Audit/HMAC/Migrationen: Eine Funktionsdefinition ersetzt (`CREATE OR REPLACE`); Trigger-Bindungen, Audit-Kette, HMAC, Partitionen und RLS unverändert. Für JWT-Aufrufer liefert der Inline-Read dieselbe uuid wie `auth.uid()`; für Nicht-JWT-Sitzungen weiterhin `NULL`.
- Migration `0076`: Zweck oben; Risiko gering; Rollback: forward-only.

## Tests und Checks

- Lokal, ephemere DB, nach `supabase db reset` + Bootstrap: `just test-db-all` → `Files=23, Tests=427, Result: PASS`.
- Vorher-Nachweis: `0054` und `0052` waren ohne `0076` mit `permission denied for schema auth` rot (derselbe Testcode), danach grün bzw. nur noch Grant-Tests rot.
- `0052` einzeln: noch 3 rot (Tests 6–8, Grants) — bewusst nicht im Gate.
- sql-lint: Dateiname und Header `-- WEG-Verwaltung migration 0076:` entsprechen dem CI-Muster (nicht als CI-Job ausgeführt).
- **Nicht gelaufen:** `./scripts/verify.sh` (Vitest, tsc, mypy, Build), Cloud-Abfragen, E2E.

## Offene Risiken

- ~~Ob der Emitter-Fehler in der Cloud live ist, ist nicht geprüft;~~ Geprüft, er ist live (Nachtrag); AGENTS.md vermerkt, dass Cloud-Objekte trotz `migration list` abweichen können.
- Der Fehler tritt nur auf, wenn Vorgangs-Tabellen beschrieben werden; ob die App sie heute beschreibt, habe ich nicht untersucht.

## Git-Status

Nichts gestaged, nichts committet, nichts gepusht. Branch `claude/0076-vorgang-emitter-jwt` (von `origin/main`). Es wurde nichts gepusht.

## Nachtrag: Cloud-Stand (2026-10-01, read-only)

Geprüft mit `supabase migration list --linked` und Katalog-Abfragen (`supabase db query --linked`, nur SELECT auf Systemkataloge und Zeilenzahlen, keine Nutzdaten, nichts geschrieben).

| Prüfung | Cloud |
| --- | --- |
| Migrationen | Remote bis `0075` gefüllt; `0076`–`0078` fehlen |
| `has_schema_privilege('audit_writer','auth','usage')` | `false` |
| `tg_emit_vorgang_audit_event` enthält `auth.uid()` | `true` |
| Zeilen in `vorgang`, `vorgang_timeline_event`; `audit_event` mit `entity_typ like 'vorgang%'` | je 0 |

Der Fehler ist damit in der Cloud **live**: jeder Schreibzugriff auf die sieben Vorgangs-Tabellen scheitert dort mit `42501`. Die App hat Code dafür (`apps/web/src/app/(dashboard)/vorgaenge/actions.ts`, `lib/vorgangszentrale/queries.ts`), einen Vorgang anzulegen schlägt in der Cloud also sehr wahrscheinlich fehl. Das habe ich nicht in der Oberfläche nachgestellt, weil es in die Cloud schreiben würde. Die 0-Zeilen-Befunde passen zu "scheitert" ebenso wie zu "nie genutzt". Es gibt keinen Drift zum lokalen Stand. `0076` ist die dringlichste der drei Migrationen.
