# WEG-Verwaltung Agent Report

Datum: `2026-07-18` (fortgeschrieben; begonnen 2026-07-16)
Agent/Rolle: `Claude (Fable 5)`
Task: `Architektur-Deepening: 8 Kandidaten aus dem /improve-codebase-architecture-Review autonom umgesetzt + Folgerunde (Action-Migration, Router-Typisierung, PROJECT_REALITY-Refresh)`
Betroffener Worker-Bereich: `general (Web-Module, Agent-Runtime, E2E-Infrastruktur)`

## Kurzfazit

Erledigt. Alle 8 Review-Kandidaten sind umgesetzt: vier neue/echte Domain-Module
(`identity`, `versammlung`, `agent-bridge`, `action-kernel`) in `apps/web/src/modules/`,
ein vereinheitlichter Runtime-Seam im Python-Agenten, typisierte Audit-RPCs,
generierte Agent-Kontrakt-Typen (`packages/shared-types` ist kein leerer Stub mehr)
und ein E2E-Fixture-Modul. `./scripts/verify.sh` läuft vollständig durch
(inkl. Build, 234 Web-Tests, 80 Agent-Tests, mypy --strict, ruff, eslint).

**Fortschreibung (2. Runde, 2026-07-18):** Die im Fahrplan als Folgearbeit
gelisteten Schritte 3–5 sind ebenfalls erledigt:

- **Alle 13 kernel-geeigneten Form-Actions** laufen jetzt über `runFormAction`
  (zusätzlich migriert: wegs/edit, einheiten new+edit+delete, personen ×3,
  eigentuemerschaft/new, versammlungen/new, tops new+edit+delete,
  beschluss/new, finanzen new+edit). Bewusst nicht migriert: öffentliche
  Flows (login/registrieren/onboarding/einladung — kein Tenant-Guard
  erwünscht), audit (Read-API), vorgaenge/abstimmung/vorschlaege
  (eigene, konsistente Muster) und die vier RPC-Lifecycle-Actions in
  finanzen/edit (`mapLifecycleError` ist dort der lokale Owner).
- **Agent-Router agenda/beschluss sind eng typisiert** (`vorschlag:
  AgendaVorschlag`, `befund: BestimmtheitsBefund` statt `dict`), mit
  expliziter `model_validate` + 502-Semantik bei Graph-Drift. `just codegen`
  regeneriert; die Hand-Refinements im agent-bridge-Modul sind bis auf die
  bewusst lose `VorgangSuggestion` abgebaut — Payload-Typen sind jetzt
  Ende-zu-Ende generiert (Pydantic → OpenAPI → shared-types → Web).
- **PROJECT_REALITY.md nach Audit-Methode aktualisiert**: erster
  Cloud-E2E-Lauf (76/2/0, 2026-07-14) eingearbeitet, „Not verified" auf den
  realen Stand gezogen, neuer Next Logical Step (Commit → PR-Merge →
  gated Regressionslauf).
- **Zwei codegen-Recipe-Fehler gefixt**: Python lief vom falschen cwd
  (`ModuleNotFoundError: app`), und `uv sync` ohne `--extra dev` räumte die
  Agent-Dev-Umgebung ab (fiel im verify.sh-Lauf als mypy-Importfehler auf;
  Recipe nutzt jetzt `--extra dev` wie `test-agent`).

## Was bedeutet das?

Die in AGENTS.md versprochenen, aber nie gebauten Domain-Module existieren jetzt
teilweise real: Claims/Guards, Abstimmung/Mehrheit, Protokoll-Lebenszyklus und die
Agent-Anbindung haben je genau einen Owner statt 3–9 Kopien. Nebenbei wurde ein
mutmaßlich produktiver Bug im Protokoll-Flow gefunden und behoben (Status-Übergang
`awaiting_review → ki_entwurf` wurde im Agenten nie geschrieben). Nichts davon ist
committet — die Freigabe liegt beim Nutzer.

## Handfester Fahrplan

| Reihenfolge | Schritt | Datei/Bereich | Warum? | Freigabe noetig? |
| --- | --- | --- | --- | --- |
| 1 | Commit der Arbeit freigeben (ggf. in thematischen Commits) | ~65 geänderte/neue Dateien (siehe unten) | verify.sh grün; Arbeit ist kohärent und getestet | ja |
| 2 | Einen gated Cloud-E2E-Lauf (`just e2e`) freigeben | apps/web/e2e/ | Fixture-Refactor + persist_node-Fix + Action-Guards sind nur unit-/typgeprüft, nicht browser-geprüft | ja |
| 3 | E2E-Haertungs-Branch per PR nach `main` mergen | PR #offen | `main` hängt hinter dem Branch | ja |
| 4 | UI-Klick-Setup in Specs schrittweise auf Fixtures umstellen | apps/web/e2e/*.spec.ts | erst nach Schritt 2 sinnvoll validierbar | nein |
| 5 | `just codegen`-Drift-Check in CI aufnehmen | .github/workflows/ | generierte Typen aktuell halten | nein |

(Erledigt aus der ersten Fassung: Action-Migration, Router-Typisierung,
PROJECT_REALITY-Refresh — siehe Fortschreibung im Kurzfazit.)

## Entscheidung fuer den Nutzer

- Empfohlene Entscheidung: freigeben (Commit), danach Schritt 2 separat freigeben.
- Begruendung: Alle Pflichtchecks grün; die Änderungen verkleinern die Codebasis
  netto um ~400 Zeilen bei 49 zusätzlichen Tests. Der einzige ungeprüfte Pfad
  (Browser-E2E gegen Cloud) ist bewusst gated.
- Naechste Nutzeraktion: Commit-Freigabe erteilen; entscheiden, ob ein
  Cloud-E2E-Lauf zur Validierung des persist_node-Fixes erfolgen soll.

## Findings

| Status | Prioritaet | Problem | Evidenz | Auswirkung | Konkreter Schritt | Begruendung |
| --- | --- | --- | --- | --- | --- | --- |
| SUPPORTED | P1 | `persist_node`/`assemble_context_node` lasen `configurable` per `getattr` von einem dict — JWT kam nie an; der Übergang `awaiting_review → ki_entwurf` wurde mutmaßlich nie geschrieben, `signProtokoll` war damit unerreichbar | alt: graphs/protokoll.py:141/223 (`getattr(config, "configurable", {})` auf TypedDict-RunnableConfig); Tests maskierten es, weil sie den Persist-Inhalt nicht asserten | Protokoll-Unterzeichnung im Produktivpfad blockiert | gefixt via `read_configurable`/`get_jwt` (beide Zugriffsformen); Regressionstests in tests/test_runtime.py; Runtime-Verifikation via gated E2E-Lauf | Ein Owner für Config-Parsing statt 4 divergierender Kopien |
| SUPPORTED | P2 | `lib/voting/majority.ts` hatte 0 Aufrufer, wurde aber getestet (falsche Sicherheit) | Repo-Suche: einziger Importer war der eigene Test | Mehrheitslogik dreifach (SQL-RPC, Inline-Zählung, totes Modul) | Modul nach `modules/versammlung` gezogen, Page nutzt `buildAbstimmungState` + unverbindliche Vorschau; RPC bleibt Autorität | Deletion-Test bestanden: Modul ist jetzt angeschlossen statt gelöscht |
| SUPPORTED | P2 | `packages/shared-types` war leer, `just codegen` doppelt kaputt (brauchte laufenden Server, Package hatte kein codegen-Script) | package.json alt: nur name+description; justfile alt: curl localhost:8000 | Web↔Agent-Typdrift nur zur Laufzeit sichtbar | codegen exportiert das Schema jetzt serverlos aus der FastAPI-App; openapi-typescript generiert `src/agent-api.d.ts`; 4 Wrapper konsumieren die Typen | Drift wird Compile-Fehler (bewiesen: deckte lose `readSuggestionType`-Typisierung auf) |
| SUPPORTED | P3 | Turbopack bricht bei `export type {…}`-Re-Exports in "use server"-Dateien | Build-Fehler „Export SignResult doesn't exist" in verify.sh-Lauf | Build-Blocker | lokale Typ-Aliase statt Re-Exports in 3 Action-Dateien | Aliase sind erased-safe; Muster im Code kommentiert |
| PARTIALLY_SUPPORTED | P3 | `verwalter_revision` ist im DB-Check erlaubt, wird aber von keinem Pfad gesetzt | 0032-Check-Constraint vs. Code-Suche | totes Statusglied oder fehlendes Feature | im Statemachine-Modul dokumentiert; Produktentscheidung offen | erst klären, ob der Zustand gebraucht wird |

## Geaenderte Dateien

Neu (Module + Tests + Package):

- `apps/web/src/modules/identity/{claims,guards,index}.ts` + Tests: ein Owner für getClaims-Parsing + Tenant-Guards
- `apps/web/src/modules/versammlung/{abstimmung,majority,protokoll-status,protokoll-sign,index}.ts` + 3 Testdateien: Tally-Owner, Mehrheits-Strategy (umgezogen), Protokoll-Statemachine, extrahierte Sign-Pipeline
- `apps/web/src/modules/agent-bridge/{fetch,index}.ts`: Transport (umgezogen aus lib/agent) + typisierte Endpoints + zentrale Fehlerübersetzung
- `apps/web/src/modules/action-kernel/index.ts` + Tests: `runFormAction`-Skelett (parse → Guard → execute → revalidate/redirect), `logPostgrestError`
- `apps/web/e2e/helpers/fixtures.ts`: REST-Fixture-Seam (WEG-Kette, Token-/Auth-File-Decode, setMeetingStatus)
- `packages/shared-types/{package.json,src/index.d.ts,src/agent-api.d.ts,openapi.json}`: generierter Agent-Kontrakt
- `apps/agent/tests/test_runtime.py`: Regressionstests für den Config-Seam

Geändert (Auswahl, vollständige Liste via `git status`):

- 9 Claims-Callsites auf `@/modules/identity` migriert (settings/*, audit/*, dashboard, onboarding, einladung); `settings/admin/guards.ts` gelöscht
- `abstimmung/page.tsx`: Modul-Tally + Mehrheits-Vorschau statt Inline-Zählung
- `protokoll-actions.ts`: 400→~230 Zeilen; sign() delegiert an Modul; Status-Checks via Statemachine
- `apps/agent/app/tools/runtime.py` + `graphs/{agenda,protokoll,vorgang}.py`: ein Config/Client-Seam, SimpleNamespace-Shims und Inline-`create_client` entfernt
- `apps/agent/app/tools/versammlung_tools.py`: Status-Docstring auf kanonischen 4er-Satz korrigiert
- `wegs/new/actions.ts`, `beschluss-sammlung/new/actions.ts`: auf action-kernel migriert (createWeg hat jetzt einen Auth-Guard)
- `lib/supabase/database.types.ts`: Audit-RPC-Signaturen (0050) im Overwrite-Layer; `audit/actions.ts` ohne any-Cast
- 7 E2E-Specs: Token-Decode-Kopien entfernt, `setMeetingStatus`/`getTokenFromAuthFile` zentralisiert
- `justfile`: codegen serverlos; `apps/web/package.json`: workspace-Dep auf shared-types

## Betroffene Systembereiche

- RLS/Audit/HMAC/Migrationen: keine Migrationen, keine Policy-Änderungen; nur TS-Typsignaturen für bestehende 0050-RPCs
- Web-App/Fachmodule: identity, versammlung, agent-bridge, action-kernel neu; settings/audit/abstimmung/protokoll migriert
- Agent/Guardrails/RAG: Runtime-Seam vereinheitlicht; Guardrails unberührt
- Meetings/Votes/Beschluss-Sammlung: Anzeige-Tally + Vorschau; RPC-Autorität unverändert
- Finance/Hausgeld: unberührt (nur E2E-Token-Dedup in finanzen.spec.ts)
- CI/Tooling/Dokumentation: justfile codegen, shared-types-Package, dieser Report

## Architektur- und Securitycheck

- RLS/Tenant-Isolation beruehrt? nein (Guards ergänzen App-seitige Prüfungen, RLS unverändert)
- Audit/HMAC/Append-only beruehrt? nein (nur Read-API-Typen)
- Migrationen beruehrt? nein
- Agent-Write-Grenzen beruehrt? nein (`_inject_actor_type_header` bleibt bewusst Backlog laut AGENTS.md)
- Remote-/Cloud-Systeme beruehrt? nein (kein e2e, kein db-push, kein seed; npm-Registry für openapi-typescript-Install kontaktiert)
- ADR oder Decision-Eintrag erforderlich? nein

## Ausgefuehrte Checks

| Check | Ergebnis | Hinweis |
| --- | --- | --- |
| `./scripts/verify.sh` | pass | kompletter Lauf inkl. Build; PROJECT_REALITY-Freshness meldet STALE (informativ) |
| `pnpm --filter web test` (Vitest) | pass | 40 Dateien, 234 Tests (49 neue) |
| `pnpm --filter web exec tsc --noEmit` | pass | inkl. e2e |
| `pnpm --filter web exec eslint … --quiet` | pass | |
| `pytest apps/agent/tests` | pass | 80 passed, 5 skipped (12 neue Runtime-Tests) |
| `mypy --strict app` | pass | 29 Dateien |
| `ruff check app tests` | pass | |
| `just e2e` / `just db-migrate` / `just seed-admin` | skipped | Cloud-gated, keine Freigabe |

## Git-Status

- Dateien gestaged? teilweise (nur die `git mv`-Umzüge: majority.ts + Test; Rest unstaged)
- Commit erstellt? nein
- Push ausgefuehrt? nein
- Wenn nein: Was fehlt fuer Commit/Push? Nutzerfreigabe
- Vorgeschlagene Stage-Dateien: alle Worktree-Änderungen (63 geänderte tracked + neue Modul-/Testdateien; keine fremden Änderungen im Worktree)
- Bewusst ausgeschlossene Dateien: keine
- Vorgeschlagene Commit-Message: `refactor(modules): deepen identity/versammlung/agent-bridge/action-kernel seams` (alternativ in 7 thematische Commits gesplittet: identity, versammlung, agent-runtime, agent-bridge+router-typing, action-kernel+migrationen, audit-typen, e2e-fixtures+docs)
- Push-Ziel: `origin/claude/saas-onboarding-e2e-test-uz0yy8` (nach Freigabe)

Es wurde nichts gepusht.

Hinweis Session-Kontinuität: Zwischenzeitlich lag die Arbeit in einem automatisch
erzeugten Stash („epitaxy: pre-switch"), weil der Branch extern auf `main`
gewechselt wurde; sie wurde per `git stash apply` vollständig wiederhergestellt.
Der Stash-Eintrag `stash@{0}` existiert noch als Backup und kann nach dem Commit
verworfen werden (`git stash drop` — erst nach Freigabe).

## Security-Check

- Secrets gelesen oder ausgegeben? nein
- Produktive Daten beruehrt? nein
- Externe Dienste kontaktiert? npm-Registry (openapi-typescript-Installation); CDN-Hashes für den lokalen HTML-Review-Report
- Sensible Daten geloggt? nein

## Bewusst nicht geaendert

- RLS-Policies, Migrationen, Audit-Chain/HMAC — kein Auftrag, kein Bedarf
- `_inject_actor_type_header` (Agent-Write-Header) — laut AGENTS.md-Backlog bewusst aufgeschoben
- Restliche ~24 Action-Dateien — Muster etabliert, Migration ist mechanische Folgearbeit
- UI-Klick-Setup der E2E-Specs — Umstellung auf Fixtures erst nach validierendem Cloud-Lauf
- `database.types.gen.ts` — Regenerieren wäre eine Cloud-Aktion

## Risiken

| Risiko | Bedeutung | Naechster Schritt |
| --- | --- | --- |
| persist_node-Fix ist nur unit-geprüft | Der reparierte Protokoll-Übergang könnte weitere Umfeldprobleme haben | gated `just e2e`-Lauf freigeben |
| E2E-Spec-Umbauten (Token-Dedup) sind nicht browser-geprüft | mechanische Ersetzungen, aber Suite ist Cloud-gated | derselbe E2E-Lauf deckt es ab |
| createWeg verlangt jetzt Tenant-Kontext | Verhaltensverschärfung: anonyme Aufrufe erhalten Formfehler statt RLS-Fehler | gewollt (Auth als Kontrakt); im E2E-Lauf mitprüfen |
| shared-types muss bei Schema-Änderungen regeneriert werden | vergessener codegen ⇒ veraltete Typen | `just codegen` in CI/Checkliste aufnehmen (Folgeaufgabe) |

## Folgeaufgaben

| Prioritaet | Aufgabe | Begruendung |
| --- | --- | --- |
| P1 | Gated Cloud-E2E-Lauf nach Commit | validiert persist_node-Fix + E2E-Refactor |
| P2 | PROJECT_REALITY.md-Refresh nach Audit-Methode | Freshness-Check meldet STALE (10 Commits) |
| P2 | Restliche Actions auf runFormAction migrieren | 22 FormState-/25 Error-Block-Kopien noch offen |
| P3 | Agent-Router-Payloads eng typisieren | macht Bridge-Refinements überflüssig |
| P3 | `just codegen`-Drift-Check in CI | generierte Typen aktuell halten |
