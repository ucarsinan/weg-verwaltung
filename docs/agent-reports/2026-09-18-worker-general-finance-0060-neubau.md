# WEG-Verwaltung Agent Report

Datum: `2026-09-18`
Agent/Rolle: `Claude (Opus 5)`
Task: `Finance-Slice 0060 neu bauen (PR #4 verworfen), Verteilungsschluessel-/Positionen-UI gegen die aktuelle Modulstruktur`
Betroffener Worker-Bereich: `Finance/Hausgeld`

## Kurzfazit

Erledigt, lokal verifiziert — mit einer benannten Luecke. Der Sollstellungs-Generator
liest jetzt Planpositionen mit je eigenem Verteilungsschluessel; ohne Positionen
bleibt der bisherige MEA-Pfad byte-identisch erhalten. `./scripts/verify.sh` laeuft
vollstaendig gruen (281 Web-Tests statt vorher 234, 80 Agent-Tests, mypy `--strict`,
Build). Nachtrag 2026-09-19: Docker wurde lokal hergestellt (colima) und
`just test-finance-db` ausgefuehrt — `Result: PASS`, 50 Assertions ueber beide
Finance-pgTAP-Dateien. Die Migration laesst sich auf den vollen Migrationsstand
anwenden. Der erste Lauf deckte einen `plan(17)`-Zaehlfehler bei 18 Assertions
auf; die Assertions selbst bestanden alle.

## Was bedeutet das?

Bisher verteilte ein Wirtschaftsplan seine Gesamtkosten pauschal nach
Miteigentumsanteilen auf alle Einheiten. Jetzt lassen sich einzelne Kostenarten
mit einem eigenen Schluessel planen — Reinigung nach Flaeche, Kabel pro Einheit,
Verwaltung nach MEA — so wie § 16 Abs. 2 WEG es seit der Reform ausdruecklich
zulaesst. Wer keine Positionen anlegt, merkt keinen Unterschied.

Nicht moeglich sind weiterhin **gemischte** Schluessel. Das betrifft ausgerechnet
Heizung und Warmwasser, die nach HeizKV zwingend 30/70 aufgeteilt werden muessen.
Der Grund ist strukturell und in `docs/08-finance-domain-model.md` als eigener
Folge-Slice dokumentiert.

## Handfester Fahrplan

| Reihenfolge | Schritt | Datei/Bereich | Warum? | Freigabe noetig? |
| --- | --- | --- | --- | --- |
| `1` | Commit der Aenderungen freigeben | 10 Pfade (siehe unten) | verify.sh gruen, Arbeitsstand sichern | ja |
| `2` | ~~`just test-finance-db`~~ erledigt 2026-09-19 (`Result: PASS`) | `infra/supabase/tests/0060_*.sql` | belegt die SQL-Arithmetik gegen echtes Postgres | nein (lokal, ephemer) |
| `3` | `just db-migrate` freigeben | `infra/supabase/migrations/0060_*.sql` | Migration gegen Frankfurt-Cloud ausrollen | ja |
| `4` | `just e2e` freigeben | `apps/web/e2e/` | erst der Browser-Lauf belegt den Slice Ende-zu-Ende | ja |
| `5` | Entscheidung zum `gemischt`-Slice (HeizKV) | `docs/08-finance-domain-model.md` § Migrationsstrategie 3 | Heizkosten sind die groesste Position und bleiben sonst ungeplant | ja (Produktentscheidung) |

## Entscheidung fuer den Nutzer

- Empfohlene Entscheidung: freigeben; Schritt 3/4 (`db-migrate`, `e2e`) als
  naechstes.
- Begruendung: Alle lokalen Pflichtchecks sind gruen, und der riskante Teil — die
  Geldarithmetik — ist seit dem pgTAP-Lauf nicht mehr nur statisch, sondern gegen
  echtes Postgres belegt. Das verbleibende Risiko liegt jetzt nur noch dort, wo
  ohne Cloud-Zugriff nicht geprueft werden kann: Schemastand der Frankfurt-DB und
  Browser-Verhalten der neuen Finance-Routen.
- Naechste Nutzeraktion: entscheiden, ob `just db-migrate` freigegeben wird —
  vorher einmal den Cloud-Schemastand gegenpruefen.

## Findings

| Status | Prioritaet | Problem | Evidenz | Auswirkung | Konkreter Schritt | Begruendung |
| --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED` | `P1` | Die PR-#4-Fassung verteilte `mea`-Anteile unnormalisiert. Nichts im Schema erzwingt, dass sich die MEA einer WEG auf 1 summieren (`0003_weg_domain.sql:49` prueft nur `> 0`) | PR-#4-`0060`, Zweig `if v_typ = 'mea'`; Gegenprobe: kein Constraint/Trigger auf die MEA-Summe | Bei MEA-Summe 0.6 waeren 40 % eines Positionsbetrags unverteilt geblieben — still, im Geldpfad | erledigt: `mea` wird im Positionen-Pfad auf die MEA-Summe der WEG normalisiert; Alt-Pfad unveraendert | Gleiche Fail-Closed-Haltung, die 0060 bei fehlenden Basiswerten schon hat; § 16 Abs. 2 WEG verteilt im *Verhaeltnis*, und der Plan muss voll finanziert sein |
| `SUPPORTED` | `P1` | `just lint`/`just typecheck` nutzten auf einer frischen venv systemweite `mypy`/`ruff` statt der Projekt-Binaries | `which mypy` → `/Library/Frameworks/...`; `uv sync --extra dev` fehlte in beiden Rezepten, `test-agent`/`codegen` machten es bereits richtig | Lokale Pflichtchecks wichen von CI ab; `ruff` meldete faelschlich gruen aus einem fremden Binary | erledigt: beide Rezepte auf `uv sync --project apps/agent --extra dev` + `.venv/bin/<tool>` umgestellt | CI (`ci.yml:95`) macht genau das; damit prueft lokal und CI dasselbe |
| `SUPPORTED` | `P2` | `gemischt` ist nicht aufloesbar: `verteilungsschluessel_basiswert` ist eindeutig ueber `(tenant_id, version_id, unit_id, gueltig_ab)` und hat keine Spalte fuer die Teil-Zugehoerigkeit | `0056_finance_allocation_foundation.sql`, Unique-Constraint der Basiswert-Tabelle | Heiz-/Warmwasserkosten (HeizKV: 30-50 % Flaeche, 50-70 % Verbrauch) lassen sich nicht positionsgenau planen | bewusst offen: fail-closed mit `0A000`; als eigener Slice in `docs/08-finance-domain-model.md` dokumentiert | Eine Diskriminator-Spalte vs. Komposition aus Sub-Versionen ist eine Schema-/Produktentscheidung, keine stille Annahme im Geldpfad |
| `SUPPORTED` | `P2` | Der pgTAP-Vertrag `0060` war zunaechst ungeprueft (kein Docker auf der Maschine) und deklarierte `plan(17)` bei 18 Assertions | erster Lauf 2026-09-19: „All 17 subtests passed" + „Bad plan" | Ohne echten Lauf waere der Zaehlfehler unentdeckt geblieben und der Test in CI/lokal dauerhaft rot | erledigt: colima installiert, `plan(18)` korrigiert, `just test-finance-db` → `Result: PASS` (50 Assertions) | Genau dafuer ist der Lauf da: die inhaltlichen Assertions (`0A000`, `23514`, MEA-Normalisierung, byte-identischer Fallback) bestanden auf Anhieb gegen echtes Postgres |
| `SUPPORTED` | `P3` | `database.types.gen.ts` kennt die 0056-Finanztabellen nicht (generiert am 26.06., vor 0056) | `grep verteilungsschluessel database.types.gen.ts` → leer | Ohne Typen greifen Route-Dateien zu Struktur-Krucken, wie es `vorgaenge/actions.ts` bereits tut | erledigt: vier Tabellen in der Overwrite-Schicht ergaenzt, dem dort dokumentierten Muster folgend | Regenerieren braucht Cloud-Zugriff; die Datei haelt dieses Vorgehen fuer RPCs bereits fest |

## Geaenderte Dateien

- `infra/supabase/migrations/0060_wirtschaftsplan_position_allocation.sql` (neu): Allokations-Helper + Generator liest Positionen; `mea` normalisiert; `gemischt` → `0A000`; Basiswert-Luecke → `23514`
- `infra/supabase/tests/0060_wirtschaftsplan_position_allocation.sql` (neu): 18 pgTAP-Assertions, ausgefuehrt und gruen
- `apps/web/src/lib/supabase/__tests__/wirtschaftsplan-position-allocation-0060.test.ts` (neu): 10 Migrations-Texttests, u. a. Byte-Identitaet des Fallback-Ausdrucks gegen `0047`
- `apps/web/src/modules/finanzen/` (neu): `verteilungsschluessel.ts`, `allocation.ts`, `index.ts` + 10 Modultests; die Anteils-Vorschau spiegelt die SQL-Semantik
- `apps/web/src/app/(dashboard)/wegs/[id]/finanzen/verteilungsschluessel/` (neu): Liste, Anlage, Basiswert-Sammelformular, Actions + 15 Action-Tests
- `apps/web/src/app/(dashboard)/wegs/[id]/finanzen/[planId]/positionen/` (neu): Positionsliste, Anlage-Formular, Actions + 12 Action-Tests
- `apps/web/src/lib/supabase/database.types.ts`: `VerteilungsschluesselTyp`/`-Quelle` + vier Tabellen in der Overwrite-Schicht
- `apps/web/src/app/(dashboard)/wegs/[id]/finanzen/page.tsx`: Verlinkung auf Verteilungsschluessel und Positionen
- `justfile`: `lint`/`typecheck` nutzen die Projekt-venv; `test-finance-db` fuehrt zusaetzlich `0060` aus
- `docs/08-finance-domain-model.md`: Migrationsstrategie um 0060 und den offenen `gemischt`-Slice ergaenzt

## Betroffene Systembereiche

- RLS/Audit/HMAC/Migrationen: Migration 0060 aendert **nur** zwei `private`-Funktionen. Keine Policy, kein Trigger, kein `alter table`, keine Lifecycle-RPC — per Test abgesichert.
- Web-App/Fachmodule: neues Domain-Modul `modules/finanzen`, vier neue Routen, alle Actions ueber `action-kernel`.
- Agent/Guardrails/RAG: nicht beruehrt.
- Meetings/Votes/Beschluss-Sammlung: nicht beruehrt.
- Finance/Hausgeld: Kern dieser Aenderung, siehe oben.
- CI/Tooling/Dokumentation: Justfile-Fix (lokale Checks == CI), Domain-Doku aktualisiert.

## Bewusst nicht enthalten

- `gemischt`/HeizKV-Aufloesung (eigener Slice, Schema-Entscheidung offen)
- Datums-Gueltigkeitspruefung Schluesselversion ↔ Planjahr (wuerde den
  0056-Draft-Validierungs-Trigger anfassen)
- Jahresabrechnung, Ruecklagen, Zahlungsabgleich, Mahnwesen
- Refactoring des bestehenden Wirtschaftsplan-Routencodes
- `PROJECT_REALITY.md`-Refresh (im Plan als eigener Schritt vorgesehen, noch offen)

## Git-Status

Nichts gestaged, nichts committed, **es wurde nichts gepusht.** Naechste Freigabe:
Commit.
