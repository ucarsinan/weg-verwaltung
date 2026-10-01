# WEG-Verwaltung Agent Report

Datum: `2026-10-01`
Agent/Rolle: `Claude`
Task: `Grant-Härtung für Audit-Konsole (0050) und Vorgangs-Tabellen (0052) — Migration 0077`
Betroffener Worker-Bereich: `Audit / Vorgangszentrale`

## Kurzfazit

Erledigt (lokal). `0050` und `0052` sind grün und im CI-Gate. Das Gate umfasst jetzt 25 Verträge mit 509 Zusicherungen. Nicht ausgerollt.

## Was bedeutet das?

Supabase vergibt neuen Objekten automatisch Rechte an `anon`, `authenticated` und `service_role`. `revoke … from public` in `0050` und `0052` nahm diese Rechte nicht zurück, die Zielrechte wurden nur obendrauf gegeben. `0077` entzieht die überzähligen Rechte und vergibt genau die vorgesehenen neu. Es war kein Datenleck, sondern eine Verletzung des Least-Privilege-Vertrags: RLS ist erzwungen, es gibt keine DELETE-Policy, und die Timeline-Trigger lehnen UPDATE/DELETE ab.

## Handfester Fahrplan

| Reihenfolge | Schritt | Datei/Bereich | Warum? | Freigabe noetig? |
| --- | --- | --- | --- | --- |
| 1 | PR #41 (`0076`) mergen | GitHub | `0077` baut darauf auf, sql-lint verlangt lückenlose Nummern | ja |
| 2 | Diesen Branch committen, pushen, PR öffnen | `claude/0077-grant-hardening` | Gate-Erweiterung | ja |
| 3 | Cloud prüfen: Emitter-Fehler live? Grants der betroffenen Objekte? | Cloud, read-only | belegt Dringlichkeit | ja |
| 4 | `0076` und `0077` ausrollen | `just db-migrate` | Handarbeit, Guard verlangt getipptes `push` | ja, nur der Nutzer |

## Entscheidung fuer den Nutzer

- Empfohlene Entscheidung: Commit und PR freigeben, nach dem Merge von #41.
- Begruendung: Keine Policy-, Trigger-, Funktions- oder Audit-Ketten-Änderung; App nutzt die Objekte nur über den Nutzer-Client.
- Naechste Nutzeraktion: Commit-/Push-Freigabe.

## Findings

| Status | Prioritaet | Problem | Evidenz | Auswirkung | Konkreter Schritt | Begruendung |
| --- | --- | --- | --- | --- | --- | --- |
| SUPPORTED | P3 | Default-Grants auf `audit_event_feed`, `audit_reveal_event_payload` (anon, service_role), `audit_payload_reveal`, `audit_integrity_check` (anon, authenticated: alle vier Rechte) | `0050` Tests 38/39/41/42/45/46 rot | Über den Vertrag hinaus; Schutz allein durch Funktionsguard/RLS | `0077` | Least Privilege |
| SUPPORTED | P3 | Gleiche Klasse auf den sieben `vorgang*`-Tabellen | `0052` Tests 6–8 rot | wie oben; Timeline-Append-only hing nur an Trigger/RLS | `0077` | Least Privilege |
| SUPPORTED | P3 | `throws_ok` mit Beschreibung als erwarteter Meldung | `0050` 52–54 | Test rot trotz richtigem Fehlercode `42501` | `null` als Meldung, Fehlercode weiter geprüft | Test-Autorenfehler |
| INSUFFICIENT_EVIDENCE | P3 | `service_role` hält weiter alle Tabellenrechte auf den betroffenen Tabellen | bewusst nicht angefasst | `service_role` umgeht RLS ohnehin; Betreiberpfad | bei Bedarf eigener Auftrag | Außerhalb des Vertrags 0050/0052 |

## Geaenderte Dateien

- `infra/supabase/migrations/0077_grant_hardening_audit_console_and_vorgang.sql`: Rechte entziehen und gezielt neu vergeben.
- `infra/supabase/tests/0050_audit_console_read_api.sql`: Tests 52–54 `throws_ok` mit `null`-Meldung.
- `justfile`: `0050` und `0052` in `AUDIT_DB_TESTS`; Kommentar.
- `AGENTS.md`, `TEST_INFRA.md`, `PROJECT_REALITY.md`: Migrationsstand, Gate-Zahlen, Backlog-Eintrag als erledigt.

## Betroffene Systembereiche

- RLS/Audit/HMAC/Migrationen: Keine RLS-Policy, kein Trigger, keine Funktion, keine Audit-Kette geändert. Nur `REVOKE`/`GRANT`. Die App ruft die Objekte ausschließlich über `createClient()` (`authenticated`) auf (`app/(dashboard)/audit/actions.ts`), `authenticated` behält, was es nutzt.
- Rollback: forward-only.

## Tests und Checks

- Lokal, ephemere DB nach Reset + Bootstrap: `just test-db-all` → `Files=25, Tests=509, Result: PASS`.
- Vorher-Nachweis: dieselben Zusicherungen waren ohne `0077` rot (Lauf vom 2026-10-01, siehe oben), danach grün.
- `./scripts/verify.sh`: siehe Abschlussbericht im Chat.
- **Nicht gelaufen:** Cloud-Abfragen, E2E.

## Offene Risiken

- Branch baut auf PR #41 auf; ohne `0076` schlägt sql-lint (Lücke in der Nummerierung) fehl.
- ~~Cloud-Stand der Objekte unbekannt; Grants dort können abweichen.~~ Am 2026-10-01 geprüft: kein Drift, die Lücken bestehen dort (Nachtrag).

## Git-Status

Nichts gestaged, nichts committet, nichts gepusht. Branch `claude/0077-grant-hardening` (von `claude/0076-vorgang-emitter-jwt`). Es wurde nichts gepusht.

## Nachtrag: Cloud-Stand (2026-10-01, read-only)

Geprüft mit `supabase db query --linked` (nur Katalog-Abfragen, keine Nutzdaten, nichts geschrieben). Die Grant-Lücken aus diesem Report bestehen in der Cloud unverändert:

| Objekt | Cloud |
| --- | --- |
| Sieben `vorgang*`-Tabellen | `anon` und `authenticated`: SELECT, INSERT, UPDATE, DELETE |
| `audit_event_feed`, `audit_reveal_event_payload` | `anon` und `service_role` können ausführen |
| `audit_payload_reveal`, `audit_integrity_check` | `authenticated`: alle vier Rechte |

Kein Drift zum lokalen Stand. Die Einstufung P3 bleibt: RLS ist erzwungen, es gibt keine DELETE-Policy, und die Timeline-Trigger lehnen UPDATE/DELETE ab; die `vorgang*`-Tabellen sind leer. `0077` ist Härtung ohne Dringlichkeit.
