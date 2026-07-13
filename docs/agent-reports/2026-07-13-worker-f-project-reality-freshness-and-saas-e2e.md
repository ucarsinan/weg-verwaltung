# WEG-Verwaltung Agent Report

Datum: 2026-07-13
Agent/Rolle: Claude (Sonnet 5)
Task: PROJECT_REALITY.md systematisch/automatisch aktuell halten + Browser-Walkthrough (Kaufseite→Registrierung→Onboarding→Trial→Einladung→Annahme) und `just e2e` vorbereiten
Betroffener Worker-Bereich: Worker F (CI, Tooling, Projektstatus), Worker B (Web-App/SaaS-Slice)

## Kurzfazit

Teilweise erledigt. Die PROJECT_REALITY.md-Freshness-Automation ist fertig und lokal verifiziert. Der Browser-Walkthrough ist als vollstaendiges, wiederholbares Playwright-E2E-Spec implementiert (typecheck-/lint-/list-sauber), konnte aber **nicht gegen die Cloud ausgefuehrt werden**: Diese Remote-Sandbox hat kein `.env.local` und keine Supabase-Credentials, `just e2e`/`just seed-admin` sind hier technisch blockiert, nicht nur durch die Freigabe-Regel.

## Was bedeutet das?

PROJECT_REALITY.md war seit dem `0057`/`0058`-Refresh (2026-07-12) hinter 7 Produktcode-Commits zurueckgefallen (Einladungs-UI, E-Mail-Modul, Settings-/Vorgaenge-Sub-Navigation) — das ist jetzt nachgezogen, und ein Skript+CI-Job macht kuenftiges Zurueckfallen automatisch sichtbar, statt es zu vergessen. Der komplette Registrierungs-/Einladungs-Flow ist jetzt als Test kodiert; er muss aber noch einmal in einer Umgebung mit echten Cloud-Zugangsdaten laufen, bevor er als verifiziert gelten kann.

## Handfester Fahrplan

| Reihenfolge | Schritt | Datei/Bereich | Warum? | Freigabe noetig? |
| --- | --- | --- | --- | --- |
| `1` | Diese Aenderungen committen | alle unten gelisteten Dateien | Speichert Freshness-Automation + E2E-Spec | ja |
| `2` | `just e2e` (bzw. gezielt `saas-onboarding.spec.ts`) in einer Umgebung mit `.env.local`/Cloud-Credentials ausfuehren | `apps/web/e2e/saas-onboarding.spec.ts` | Einziger Weg, den Flow wirklich als browser-verifiziert zu belegen | ja (Cloud-nah) |
| `3` | Ergebnis von Schritt 2 in PROJECT_REALITY.md nachtragen | `PROJECT_REALITY.md` | Haelt das Audit-Dokument akkurat | nein (nach Schritt 2) |

## Entscheidung fuer den Nutzer

- Empfohlene Entscheidung: freigeben (Commit), Schritt 2 in einer Umgebung mit Cloud-Zugang nachholen.
- Begruendung: Alle Aenderungen sind additiv (neue Dateien + reine Doku-/CI-Ergaenzungen), lokal gruen (Typecheck, Lint, 200 Vitest-Tests, YAML-Syntax-Check), nichts an RLS/Audit/Migrationen veraendert.
- Naechste Nutzeraktion: Commit/Push freigeben; danach Schritt 2 explizit freigeben, sobald eine Umgebung mit echten Supabase-Frankfurt-Credentials verfuegbar ist.

## Findings

| Status | Prioritaet | Problem | Evidenz | Auswirkung | Konkreter Schritt | Begruendung |
| --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED` | `P2` | PROJECT_REALITY.md war seit `d6809f4` (2026-07-13 08:01) trotz Commit-Titel „refresh … after invitation flow lands" bereits beim Schreiben inhaltlich hinter dem tatsaechlichen Stand (Einladungsseite existierte zu dem Zeitpunkt schon, wurde aber als fehlend beschrieben) und blieb danach 7 weitere Commits unangetastet | `git log --format='%h %ai %s'` zeigt `4168527` (Einladungsseite) vor `d6809f4` (Docs-Refresh) | Reviewer/Planner koennten auf Basis veralteter Next-Step-Angaben falsch priorisieren | Freshness-Skript + CI-Job + Doku-Verweis ergaenzt (dieser Report) | Macht Staleness systematisch sichtbar statt auf einzelne Sorgfalt angewiesen zu sein |
| `SUPPORTED` | `P2` | `just e2e`/`just seed-admin` in dieser Sandbox technisch unausfuehrbar | `node scripts/seed-admin.mjs` → „Missing env: need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"; kein `.env.local` im Repo, keine SUPABASE_*-Env-Vars gesetzt | Browser-Walkthrough (Schritt 2 aus dem vorherigen Next-Step) konnte in dieser Session nicht durchgefuehrt werden | E2E-Spec vorbereitet statt live geklickt; Ausfuehrung als expliziter Folgeschritt dokumentiert | Ehrliche Berichterstattung statt vorgetaeuschter Cloud-Verifikation |

## Geaenderte Dateien

- `scripts/check-project-reality-freshness.sh`: [NEW] Deterministischer, git-only Staleness-Check fuer PROJECT_REALITY.md (keine Secrets, keine Cloud-Aufrufe).
- `.github/workflows/project-reality-freshness.yml`: [NEW] Nicht-blockierender CI-Job, der den Check auf PRs mit `apps/**`/`infra/supabase/migrations/**`/`packages/**`-Aenderungen ausfuehrt.
- `scripts/verify.sh`: [MODIFIED] Ruft den Freshness-Check informativ (nie blockierend) auf.
- `AGENTS.md`: [MODIFIED] Neuer Abschnitt „PROJECT_REALITY.md aktuell halten" dokumentiert den Mechanismus und die Erwartung, bei „STALE" vor der naechsten groesseren Aufgabe zu refreshen.
- `TESTING.md`: [MODIFIED] Kurzer Verweis auf den neuen Freshness-Check.
- `PROJECT_REALITY.md`: [MODIFIED] Inhaltlich auf Stand `0059` gebracht (Einladungs-UI, E-Mail-Modul, Settings-/Vorgaenge-Sub-Navigation, neue Freshness-Automation, neues E2E-Spec) inkl. Freshness-Hinweis am Dateikopf; Next-Logical-Step auf „Spec gegen Cloud ausfuehren" umformuliert.
- `apps/web/e2e/helpers/admin-api.ts`: [NEW] Service-Role-Bootstrap fuer vorbestaetigte Test-Accounts (mirrort `scripts/seed-admin.mjs`), um die reale E-Mail-Bestaetigung headless zu umgehen.
- `apps/web/e2e/saas-onboarding.spec.ts`: [NEW] Playwright-Spec: Kaufseite → Registrierung (echter Sign-up-Call) → Onboarding-Wizard → Trial → Einladungslink erzeugen → zweiter Nutzer nimmt Einladung an → `/dashboard`.

## Betroffene Systembereiche

- RLS/Audit/HMAC/Migrationen: Keine Aenderungen.
- Web-App/Fachmodule: Kein Produktcode geaendert, nur ein neues E2E-Testspec + Test-Helper hinzugefuegt.
- Agent/Guardrails/RAG: Keine Aenderungen.
- Meetings/Votes/Beschluss-Sammlung: Keine Aenderungen.
- Finance/Hausgeld: Keine Aenderungen.
- CI/Tooling/Dokumentation: Neuer CI-Job, neues Skript, mehrere Doku-Ergaenzungen.

## Architektur- und Securitycheck

- RLS/Tenant-Isolation beruehrt? nein
- Audit/HMAC/Append-only beruehrt? nein
- Migrationen beruehrt? nein
- Agent-Write-Grenzen beruehrt? nein
- Remote-/Cloud-Systeme beruehrt? nein (E2E-Spec geschrieben, aber in dieser Session nicht ausgefuehrt — kein Cloud-Zugriff)
- ADR oder Decision-Eintrag erforderlich? nein

## Ausgefuehrte Checks

| Check | Ergebnis | Hinweis |
| --- | --- | --- |
| `pnpm --filter @weg-verwaltung/web typecheck` | pass | Nach `pnpm install --frozen-lockfile` (node_modules fehlte initial in der Sandbox) |
| `pnpm --filter @weg-verwaltung/web lint` | pass | |
| `pnpm --filter @weg-verwaltung/web test` | pass | 35 Dateien, 200 Tests |
| `npx playwright test saas-onboarding --list` | pass | 5 Tests geparst (2 Setup + 3 neue), keine Cloud-Ausfuehrung |
| `scripts/check-project-reality-freshness.sh` / `--strict` | pass | Faellt korrekt nach Doku-Refresh auf „OK" zurueck |
| `python3 -c "yaml.safe_load(...)"` | pass | Neue Workflow-Datei syntaktisch gueltig |
| `git diff --check` | pass | Keine Whitespace-/EOF-Fehler |
| `just test-agent` / `just test-audit-db` / `just test-finance-db` / `just test-saas-db` / `just build` | nicht ausgefuehrt | `just` ist in dieser Sandbox nicht installiert; agent-/pgTAP-Checks nicht Teil dieser Aenderung (kein Agent-/Migrations-Code beruehrt) |
| `just e2e` / `just seed-admin` | blockiert | Keine `.env.local`/Supabase-Credentials in dieser Sandbox — technisch unausfuehrbar, nicht nur ungenehmigt |

## Git-Status

- Dateien gestaged? nein
- Commit erstellt? nein
- Push ausgefuehrt? nein
- Wenn nein: Was fehlt fuer Commit/Push? Ausdrueckliche Nutzerfreigabe (AGENTS.md Git-Regeln).
- Vorgeschlagene Stage-Dateien:
  - `scripts/check-project-reality-freshness.sh`
  - `.github/workflows/project-reality-freshness.yml`
  - `scripts/verify.sh`
  - `AGENTS.md`
  - `TESTING.md`
  - `PROJECT_REALITY.md`
  - `apps/web/e2e/helpers/admin-api.ts`
  - `apps/web/e2e/saas-onboarding.spec.ts`
  - dieser Report
- Bewusst ausgeschlossene Dateien: keine.
- Vorgeschlagene Commit-Message: `feat(saas): add browser-walkthrough e2e spec and automate PROJECT_REALITY.md freshness checks`
- Push-Ziel: `origin/claude/next-logical-step-nrxu09`

## Security-Check

- Secrets gelesen oder ausgegeben? nein
- Produktive Daten beruehrt? nein
- Externe Dienste kontaktiert? nein
- Sensible Daten geloggt? nein

## Bewusst nicht geaendert

- Kein Billing-Adapter (weiterhin explizit „Do Not Build Yet" bzw. nachrangig).
- Keine Aenderung an bestehenden E2E-Specs (`demo.spec.ts`, `login.spec.ts`, etc.).
- Keine Aenderung an Migrationen, RLS-Policies oder Audit-/HMAC-Logik.
- `just e2e` wurde nicht erzwungen/simuliert — kein `.env.local` mit Platzhalter-Credentials angelegt, um einen falschen „lief durch"-Eindruck zu vermeiden.

## Risiken

| Risiko | Bedeutung | Naechster Schritt |
| --- | --- | --- |
| `saas-onboarding.spec.ts` ist ungetestet gegen echtes Cloud-Verhalten (RLS, RPC-Grants, Timing, Locator-Drift) | Das Spec kann beim ersten echten Lauf Anpassungen brauchen (z. B. Timing bei Server Actions, exakte Rollenauswahl) | Mit Freigabe in einer Umgebung mit `.env.local` ausfuehren und Fixes iterativ committen |
| Freshness-Check-Schwellenwerte (8 Commits / 10 Tage) sind eine Heuristik, keine harte Metrik | Bei sehr vielen kleinen Commits koennte er zu frueh/spaet warnen | Bei Bedarf ueber `PROJECT_REALITY_COMMIT_THRESHOLD`/`PROJECT_REALITY_DAY_THRESHOLD`-Env-Vars justierbar, ohne Skriptaenderung |
| E2E-Testdaten (`e2e-*@example.test`-Accounts, Test-WEGs) bleiben nach einem echten Lauf in der Cloud-DB liegen | Gleiches akzeptiertes Muster wie bei `demo.spec.ts` (siehe 2026-06-29-Report) | Kein Handlungsbedarf, konsistent mit bestehender Projektpraxis |

## Folgeaufgaben

| Prioritaet | Aufgabe | Begruendung |
| --- | --- | --- |
| `P1` | `saas-onboarding.spec.ts` mit echten Cloud-Credentials ausfuehren und PROJECT_REALITY.md mit dem Ergebnis aktualisieren | Schliesst die seit zwei Audits offene Luecke „Browser-verifizierter SaaS-Flow" endgueltig |
| `P3` | Billing-Adapter planen, sobald Schritt oben gruen ist | Naechste sinnvolle Breite laut PROJECT_REALITY.md „Do Not Build Yet" |

---

Es wurde nichts gepusht.
