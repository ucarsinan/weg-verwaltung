# WEG-Verwaltung Agent Report

Datum: `2026-07-12`
Agent/Rolle: `Claude`
Task: `sha256-Checksumme in signProtokoll als Buffer statt \x-Hex an bytea-Spalte document_version.sha256 uebergeben — Root-Cause-Fix + Test`
Betroffener Worker-Bereich: `Worker B (apps/web/src/*, Server Actions)`

## Kurzfazit

Erledigt. `signProtokoll` in `protokoll-actions.ts` schrieb den SHA-256-Hash als rohen Node-`Buffer`
in die `bytea`-Spalte `document_version.sha256`. Das ist kein kosmetischer Bug: lokal gegen die echte
Postgres-Instanz nachgestellt, bricht dadurch **jeder** reale Aufruf von `signProtokoll` an Schritt 9
(Insert `document_version`) mit einer Check-Constraint-Verletzung ab — nachdem das PDF bereits in
Storage hochgeladen und eine verwaiste `document`-Zeile bereits angelegt wurde. Behoben durch Umstellung
auf das von PostgREST erwartete `\x`-Hex-String-Format, mit TDD-Test (rot vor dem Fix, gruen danach)
und vollem `./scripts/verify.sh`-Lauf.

## Was bedeutet das?

Das digitale Signieren eines Protokolls (Kernfunktion, "unterzeichnet"-Status) war praktisch nicht
nutzbar — jeder Versuch waere mit einem generischen Fehler "Dokument-Version fehlgeschlagen"
gescheitert, und es haette sich pro Versuch eine verwaiste PDF-Datei in Storage sowie eine verwaiste
`document`-Zeile ohne zugehoerige `document_version` angesammelt. Der Bug war unbemerkt, weil es fuer
`signProtokoll` bislang keinen Test gab und niemand die Spalte `document_version.sha256` bislang liest
(sie ist laut Migrationskommentar ein reiner "forensic anchor").

## Handfester Fahrplan

| Reihenfolge | Schritt | Datei/Bereich | Warum? | Freigabe noetig? |
| --- | --- | --- | --- | --- |
| `1` | Root-Cause lokal gegen echte Postgres-Instanz verifizieren | `infra/supabase` (lokaler Docker-Container) | Sicherstellen, dass es sich um einen Hard-Fail und nicht nur um "latente" Datenkorruption handelt | `nein` |
| `2` | Failing Unit-Test schreiben (TDD, rot) | `apps/web/src/app/(dashboard)/versammlungen/[meetingId]/protokoll/__tests__/sign-protokoll.test.ts` | Regression fuer den konkreten Bug absichern | `nein` |
| `3` | Fix anwenden: `\x`+hex statt raw Buffer | `apps/web/src/app/(dashboard)/versammlungen/[meetingId]/protokoll/protokoll-actions.ts:321-322,349` | Root Cause beheben, nicht nur Symptom | `nein` |
| `4` | Vollen `./scripts/verify.sh` laufen lassen | Repo-Root | Sicherstellen, dass nichts regressiert | `nein` |
| `5` | Commit/Push | — | Noch nicht ausgefuehrt | `ja` |

## Entscheidung fuer den Nutzer

- Empfohlene Entscheidung: `freigeben`
- Begruendung: Root Cause verifiziert (lokal gegen echte Postgres-Instanz reproduziert und der Fix
  ebenso verifiziert), Fix ist minimal und zielgerichtet, Test deckt exakt das ab, was kaputt war,
  `./scripts/verify.sh` komplett gruen (Lint, Typecheck Web+Agent, 171 Web-Tests + 73 Agent-Tests, Build).
- Naechste Nutzeraktion: Commit freigeben (Staging/Commit wurde bewusst nicht ausgefuehrt, siehe Git-Status).

## Findings

| Status | Prioritaet | Problem | Evidenz | Auswirkung | Konkreter Schritt | Begruendung |
| --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED` | `P1` | `signProtokoll` scheitert bei jedem realen Aufruf am `document_version`-Insert, weil `createHash(...).digest()` (Node `Buffer`) ueber `postgrest-js` als JSON `{"type":"Buffer","data":[...]}` serialisiert wird; Postgres wandelt dieses JSON-Objekt beim Cast auf `bytea` in dessen eigene Text-Repraesentation (~140+ Bytes) statt es als Hash zu interpretieren, was die Check-Constraint `octet_length(sha256) = 32` verletzt | Lokal reproduziert gegen `supabase_db_weg-verwaltung-local` (Postgres 17) via `json_to_recordset` (identischer Mechanismus wie PostgREST-Insert): `ERROR: new row for relation "t_docver_test" violates check constraint "t_docver_test_sha256_check"`; Quelle: `apps/web/src/app/(dashboard)/versammlungen/[meetingId]/protokoll/protokoll-actions.ts:322,349` (vor Fix), Spaltendefinition `infra/supabase/migrations/0015_dokumente.sql:73` | Kernfunktion "Protokoll unterzeichnen" war nicht nutzbar; jeder Fehlversuch hinterlaesst eine verwaiste PDF in Storage (`weg-docs`) und eine verwaiste `document`-Zeile ohne `document_version` | Bereits behoben: `sha256Hex = "\\x" + digest("hex")` statt rohem Buffer | Fix an der Quelle (Serialisierungsformat), nicht am Symptom; mit echter Postgres-Instanz statt nur Annahme verifiziert |
| `SUPPORTED` | `P3` | `createClient()` in `apps/web/src/lib/supabase/server.ts` uebergibt `createServerClient` kein `Database`-Generic, wodurch `.from()/.insert()`-Aufrufe unget ypt sind und `tsc --noEmit` den Buffer/`string`-Mismatch bei `sha256` (generierter Typ: `string`, siehe `database.types.gen.ts:1150`) nicht erkennen konnte | `apps/web/src/lib/supabase/server.ts:10-13` vs. `apps/web/src/lib/supabase/database.types.gen.ts:1150` | Aehnliche bytea/Typ-Mismatches an anderen Insert-Stellen wuerden ebenfalls nicht vom Typechecker gefangen | Nicht in diesem Scope behoben (waere eine separate, groessere Aenderung mit App-weiten Typerwirkungen) | Ausserhalb des angefragten Scopes; als Folgeaufgabe vermerkt |
| `NOT_FOUND` | — | Existierender Shared-Helper fuer bytea-Hex-Encoding (z. B. fuer eine Invitation-Token-Funktion) | Repo-weite Suche nach `invitation.ts`, `\\x`-Pattern und Aufrufstellen von `create_tenant_invitation`/`accept_tenant_invitation` (RPCs existieren in `infra/supabase/migrations`, aber keine TS-Aufrufer vorhanden) | Kein Refactoring-Ziel vorhanden | Inline-Fix ohne Abstraktion, wie in der Aufgabenstellung als Fallback vorgesehen | Keine verfruehte Abstraktion fuer ein Muster, das noch nirgends sonst existiert |

## Geaenderte Dateien

- `apps/web/src/app/(dashboard)/versammlungen/[meetingId]/protokoll/protokoll-actions.ts`: `sha256Bytes` (raw `Buffer`) durch `sha256Hex` (`\x`-praefigierter Hex-String) ersetzt, Kommentar zur Begruendung ergaenzt.
- `apps/web/src/app/(dashboard)/versammlungen/[meetingId]/protokoll/__tests__/sign-protokoll.test.ts`: neu — Unit-Test, der den `document_version`-Insert-Payload abfaengt und sicherstellt, dass `sha256` ein `\x`-praefigierter 64-stelliger Hex-String ist, kein Buffer/Objekt.

## Betroffene Systembereiche

- RLS/Audit/HMAC/Migrationen: nein (nur Anwendungscode; Spaltendefinition/Check-Constraint unveraendert)
- Web-App/Fachmodule: ja — `protokoll-actions.ts` (Server Action `signProtokoll`)
- Agent/Guardrails/RAG: nein
- Meetings/Votes/Beschluss-Sammlung: nein
- Finance/Hausgeld: nein
- CI/Tooling/Dokumentation: nein (dieser Report)

## Architektur- und Securitycheck

- RLS/Tenant-Isolation beruehrt? `nein`
- Audit/HMAC/Append-only beruehrt? `nein` (nur der Datenwert einer bestehenden append-only-Spalte, nicht die Append-only-Logik selbst)
- Migrationen beruehrt? `nein`
- Agent-Write-Grenzen beruehrt? `nein` (rein menschliche Server Action, kein Agent-Pfad)
- Remote-/Cloud-Systeme beruehrt? `nein` (nur lokale Docker-Postgres-Instanz zur Verifikation genutzt, keine Cloud-/Linked-Kommandos)
- ADR oder Decision-Eintrag erforderlich? `nein`

## Ausgefuehrte Checks

| Check | Ergebnis | Hinweis |
| --- | --- | --- |
| Lokale Postgres-Reproduktion des Bugs (`json_to_recordset` gegen Tabelle mit identischer Check-Constraint) | fail (wie erwartet, bestaetigt Root Cause) | `supabase_db_weg-verwaltung-local`, Postgres 17 |
| Lokale Postgres-Verifikation des Fix-Formats (`\x`-Hex) | pass | Ergebnis: exakt 32 Bytes, korrekter Hash |
| `pnpm --filter @weg-verwaltung/web test -- sign-protokoll.test.ts` (vor Fix) | fail (rot, TDD) | `expected 'object' to be 'string'` |
| `pnpm --filter @weg-verwaltung/web test -- sign-protokoll.test.ts` (nach Fix) | pass | 1/1 |
| `./scripts/verify.sh` (Lint, Typecheck Web+Agent, Test Web+Agent, Build, git diff --check, Whitespace-Check) | pass | 171 Web-Tests + 73 Agent-Tests gruen, Build erfolgreich |

## Git-Status

- Dateien gestaged? `nein`
- Commit erstellt? `nein`
- Push ausgefuehrt? `nein`
- Wenn nein: Was fehlt fuer Commit/Push? Nutzerfreigabe fuer Staging/Commit (laut Arbeitsregel keine Git-Aktionen ohne ausdrueckliche Freigabe)
- Vorgeschlagene Stage-Dateien:
  - `apps/web/src/app/(dashboard)/versammlungen/[meetingId]/protokoll/protokoll-actions.ts`
  - `apps/web/src/app/(dashboard)/versammlungen/[meetingId]/protokoll/__tests__/sign-protokoll.test.ts`
  - `docs/agent-reports/2026-07-12-worker-b-protokoll-sha256-bytea-fix.md`
- Bewusst ausgeschlossene Dateien: keine (nichts anderes im Arbeitsverzeichnis veraendert)
- Vorgeschlagene Commit-Message: `fix(protokoll): encode document_version.sha256 as \x-hex, not raw Buffer`
- Push-Ziel: `nicht relevant (noch kein Commit)`

Es wurde nichts gepusht.

## Security-Check

- Secrets gelesen oder ausgegeben? `nein`
- Produktive Daten beruehrt? `nein` (nur lokale Docker-Postgres-Instanz, keine Cloud-/Linked-Verbindung)
- Externe Dienste kontaktiert? `nein`
- Sensible Daten geloggt? `nein`

## Bewusst nicht geaendert

- `apps/web/src/lib/supabase/server.ts`: `createServerClient` weiterhin ohne `Database`-Generic — waere ein separater, app-weiter Typisierungs-Task mit potenziell vielen Folgefehlern, nicht Teil dieses Fixes.
- Kein Shared-Helper fuer bytea-Hex-Encoding extrahiert, da aktuell keine zweite Verwendungsstelle im Code existiert (Invitation-Token-Feature laut Aufgabenstellung noch nicht vorhanden).

## Risiken

| Risiko | Bedeutung | Naechster Schritt |
| --- | --- | --- |
| Bereits in der Cloud-DB vorhandene, mit dem alten Buffer-Bug erzeugte `document_version.sha256`-Werte sind vermutlich korrupt (falls ueberhaupt ein Insert je erfolgreich war) | Forensischer Anker fuer betroffene Protokoll-Dokumente waere ungueltig | Falls in der Cloud-DB Zeilen mit auffaelliger `octet_length(sha256)` existieren, mit Nutzerfreigabe pruefen und ggf. per Migration/Skript neu berechnen — ausserhalb dieses Scopes, da kein Remote-/Cloud-Zugriff ohne Freigabe erfolgt |
| `createClient()` ohne `Database`-Generic verdeckt weitere Typ-Mismatches dieser Art | Aehnliche Bugs an anderen `.insert()`-Stellen bleiben fuer `tsc` unsichtbar | Als P3-Folgeaufgabe: `createServerClient<Database>(...)` einfuehren und resultierende Typfehler schrittweise beheben |

## Folgeaufgaben

| Prioritaet | Aufgabe | Begruendung |
| --- | --- | --- |
| `P2` | Pruefen, ob in der Cloud-DB bereits fehlerhafte `document_version.sha256`-Werte existieren (nur mit Freigabe, da Remote-Zugriff) | Forensische Integritaet des Audit-Ankers |
| `P3` | `Database`-Generic an `createServerClient` in `apps/web/src/lib/supabase/server.ts` ergaenzen | Verhindert kuenftige, vom Typechecker unentdeckte bytea/Typ-Mismatches |
