# WEG-Verwaltung Agent Report

Datum: `2026-10-01`
Agent/Rolle: `Claude`
Task: `Audit-Trail und Agenten-Sperre für weg_zugang — Migration 0078`
Betroffener Worker-Bereich: `Audit / Identity / Rollentrennung`

## Kurzfazit

Erledigt (lokal). `weg_zugang` protokolliert jede Vergabe und jeden Entzug und weist Agenten ab. Neuer Vertrag `0078_weg_zugang_audit.sql` (14 Zusicherungen) ist im CI-Gate: 26 Verträge, 523 Zusicherungen. Nicht ausgerollt. Die Vergabe-Oberfläche ist bewusst nicht gebaut.

## Was bedeutet das?

`0075` führte die Zuordnung "Nutzer darf WEG sehen" ein, aber ohne Spur: ein Entzug (DELETE) hinterließ nichts, und nichts hielt einen Agenten auf. `0078` hängt dieselben zwei Trigger an, die `aufbewahrungsregel` (`0069`) trägt: die Agenten-Sperre und den generischen Audit-Emitter. Wer wem wann welche WEG freigegeben oder entzogen hat, steht damit in der unlöschbaren `audit_event`-Kette.

## Handfester Fahrplan

| Reihenfolge | Schritt | Datei/Bereich | Warum? | Freigabe noetig? |
| --- | --- | --- | --- | --- |
| 1 | #41 und #42 mergen, dann diesen PR auf `main` umstellen | GitHub | Nummernfolge 0076 → 0077 → 0078 | ja |
| 2 | Cloud prüfen (Emitter-Fehler, Grants, `weg_zugang`-Trigger) | Cloud, read-only | Dringlichkeit | ja |
| 3 | `0076`–`0078` ausrollen | `just db-migrate` | Handarbeit, getipptes `push` | ja, nur der Nutzer |
| 4 | Entscheidung zur Eigentümersicht (Schritt 5 im Bericht 2026-09-29-eigentuemerrolle) | Produkt | Voraussetzung für Vergabe-UI | ja |

## Entscheidung fuer den Nutzer

- Empfohlene Entscheidung: Commit und gestapelten PR freigeben.
- Begruendung: Nur zwei Trigger, keine Policy-, Grant- oder Datenänderung; die Tabelle ist leer und ohne UI.
- Naechste Nutzeraktion: Commit-/Push-Freigabe.

## Findings

| Status | Prioritaet | Problem | Evidenz | Auswirkung | Konkreter Schritt | Begruendung |
| --- | --- | --- | --- | --- | --- | --- |
| SUPPORTED | P2 | `weg_zugang` ohne Audit-Trigger und ohne Agenten-Sperre | `0075` enthält keinen Trigger; `0069:154-165` zeigt das Vergleichsmuster | Entzug von Lesezugriff hinterließ keine Spur; ein Agent im Namen eines Admins hätte Zugang vergeben können | `0078` | Nachweispflicht und Suggestion-only-Invariante |
| SUPPORTED | – | Zusicherungen sind keine Schein-Tests | Trigger lokal entfernt: genau die 6 trigger-abhängigen Tests (1, 2, 7, 8, 13, 14) wurden rot, die übrigen 8 blieben grün | belegt, dass Katalog-, Audit- und Agententests echte Zusicherungen sind | – | Beweisstandard aus `0069` |
| INSUFFICIENT_EVIDENCE | P3 | `UPDATE` auf `weg_zugang` | kein Grant, keine Policy (0075) | Trigger deckt UPDATE mit ab, wird aber nicht geprüft, weil es unter RLS nicht erreichbar ist | keiner | nicht erreichbar |

## Geaenderte Dateien

- `infra/supabase/migrations/0078_weg_zugang_audit_and_agent_guard.sql`: zwei Trigger (`weg_zugang_block_agent_writes` über `public.tg_finance_allocation_block_agent_writes`, `weg_zugang_audit_emit` über `audit_writer.tg_emit_audit_event`).
- `infra/supabase/tests/0078_weg_zugang_audit.sql`: neuer Vertrag, 14 Zusicherungen.
- `justfile`: Vertrag in `SECURITY_DB_TESTS`.
- `AGENTS.md`, `TEST_INFRA.md`, `PROJECT_REALITY.md`: Migrationsstand und Gate-Zahlen.

## Betroffene Systembereiche

- RLS/Audit/HMAC/Migrationen: Keine RLS-Policy, kein Grant, keine Spalte, keine Daten geändert; Audit-Kette, HMAC und Partitionen unverändert. Mehr als bisher: je Vergabe/Entzug eine `audit_event`-Zeile. Der Emitter liest den Akteur inline aus den JWT-GUCs (`0028`), nicht über `auth.uid()`.
- Die Sperrfunktion heißt `tg_finance_allocation_block_agent_writes`, ist aber generisch; `0069` nutzt sie ebenso für `aufbewahrungsregel`.
- Rollback: forward-only.

## Tests und Checks

- Lokal, ephemere DB nach Reset und Bootstrap: `just test-db-all` → `Files=26, Tests=523, Result: PASS`.
- Rot-Beweis wie oben beschrieben, danach DB neu aufgebaut.
- `./scripts/verify.sh`: siehe Abschlussbericht im Chat.
- **Nicht gelaufen:** E2E. Cloud-Abfragen: siehe Nachtrag.

## Offene Risiken

- Der Branch baut auf #42 (und damit #41) auf; ohne `0076`/`0077` schlägt sql-lint an.
- Ohne Vergabe-UI und ohne einladbare Eigentümer kann der Trail in der Praxis noch nicht erzeugt werden; er greift ab der ersten Vergabe.

## Git-Status

Nichts gestaged, nichts committet, nichts gepusht. Branch `claude/0078-weg-zugang-audit` (von `claude/0077-grant-hardening`). Es wurde nichts gepusht.

## Nachtrag: Cloud-Stand (2026-10-01, read-only)

Geprüft mit `supabase db query --linked` (nur Katalog-Abfragen und eine Zeilenzahl, nichts geschrieben): `public.weg_zugang` existiert in der Cloud (`0075` ist ausgerollt), hat **0 Zeilen und 0 Trigger**. Die Lücke aus diesem Report besteht dort also, ist aber folgenlos, solange die Tabelle leer bleibt und es keine Vergabe-Oberfläche gibt. `0078` hat keine Dringlichkeit; es sollte vor der ersten Vergabe in der Cloud liegen.

Rollout-Empfehlung: `0076`–`0078` zusammen in einem `just db-migrate` nach dem Merge der drei PRs (Handarbeit, getipptes `push`), danach `migration list --linked` und dieselben Katalog-Abfragen als Nachweis.
