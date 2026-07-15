# WEG-Verwaltung — Projekt-AGENTS.md

## Was ist das

Verwaltungssoftware für Wohnungseigentümergemeinschaften (WEG) — Multi-Tenant SaaS für Profi-Hausverwalter, KI-First, sicher von Anfang an. Portfolio-Piece in Profi-Qualität.

**Aktueller Stand (lokal belegt, Juli 2026):** Cloud-DB-Ziel ist das lokal verlinkte Supabase-Frankfurt-Projekt. Der Cloud-Migrationsstand wurde am 2026-07-13 per read-only Supabase-MCP-Check (`list_migrations` gegen Projekt `sgdlzafvhrfulwidqsno`) aktiv verifiziert und deckt sich exakt mit dem lokalen Stand. Lokal liegen Migrationen `0001–0059`: Dokumente/Personen/Eigentümerschaft bis `0033`, Audit-Hotfix/Forward-Repair und Least-Privilege-Hardening bis `0046`, Finance Lifecycle bis `0048`, Meeting/Resolution-Hardening in `0049`, Audit-Console-Read-API in `0050`, Actor-Guard-DELETE-Fix in `0051`, Vorgangszentrale-Foundation in `0052`, Settings-Audit-Trigger in `0053`, Agent-Suggestion-Vorgangsanker in `0054`, Advisor-Grant-/RLS-InitPlan-Hardening in `0055`, Finance-Allocation-Foundation in `0056`, Self-Managed-SaaS-Foundation in `0057`, Audit-Writer-Vault-Decrypt-Grant in `0058` und Tenant-Audit-Emitter-Repair in `0059`. Next.js-16-Web-App und FastAPI/LangGraph-Agent sind vorhanden. RAG-Retrieval ist Scaffold und liefert bewusst `[]`, bis Embedding-Datenpipeline und Eval-Gates stehen. E2E-Specs existieren, wurden aber weiterhin nicht browser-gefuehrt gegen die Cloud ausgeführt (siehe Backlog). Produktives Hosting für Web-App und Agent ist aus dem Repo nicht belegt. Vote referenziert `ownership_id`, niemals `person_id` oder `user_id`; Co-Eigentümer zählen als eine Stimme pro Ownership.

## Stack

- Next.js 16 (App Router, Server Components) — `apps/web/`
- FastAPI + LangGraph — `apps/agent/`
- Supabase Frankfurt (Postgres + Auth + Storage + RLS)
- Langfuse (LLM-Observability) + RAGAS (RAG-Eval), derzeit noch nicht als produktives Gate belegt
- Resend (Mail)

## Architektur

Modularer Monolith mit getrenntem Agent-Service (ein Repo, zwei Deployments). Domain-Module mit harten Interfaces innerhalb `apps/web/modules/`:

- `identity/` · `weg/` · `versammlung/` · `beschluss-sammlung/` · `dokumente/` · `audit/` · `agent-bridge/` · `finanzen/`

## Sicherheits-Invarianten (immer einhalten)

1. Mandanten-Iso via RLS (`tenant_id = (select public.tenant_id())`). Helper `public.tenant_id()` extrahiert aus JWT — siehe 0001. Builtins `auth.jwt()`/`auth.uid()` bleiben in `auth` Schema; user-defined Helpers liegen in `public` (hosted-Supabase blockt CREATE auf `auth`).
2. KI = nur Vorschläge — DB-Trigger blockiert `actor_type=agent` auf `Vote`, `BeschlussSammlungEntry`, `Protocol.unterzeichnet`, `Resolution`.
3. `BeschlussSammlungEntry` ist append-only (Trigger lehnt UPDATE/DELETE ab).
4. `AuditEvent` ist unlöschbar — auch für Tenant-Admin.
5. Stimmen referenzieren `ownership_id`, niemals `person_id` oder `user_id` (historische Korrektheit bei Eigentumswechsel).

## Commands

```bash
just dev-web       # Next.js dev (Port 3000) — gegen Cloud-DB (Frankfurt)
just dev-agent     # FastAPI dev (Port 8000, uv-managed venv)
just test          # alle Tests (web + agent)
just test-web      # Vitest unit + jest-axe
just typecheck     # tsc + mypy --strict
just lint          # eslint + ruff
just test-finance-db # lokaler pgTAP-Vertrag fuer Finance 0056, nicht Cloud
just e2e           # Playwright/Chromium — Login-Flow gegen Cloud; nicht ohne explizite Freigabe im Audit laufen lassen
just seed-admin    # Tenant + tenant_admin via Supabase Admin-API (idempotent)
just codegen       # OpenAPI → packages/shared-types (agent muss laufen)
just db-migrate    # supabase db push --workdir infra (gegen Cloud!)
```

Kein manuelles `supabase start` / Remote-`db-reset` mehr — das Projekt ist im Entwicklungsbetrieb **remote-only** gegen Frankfurt. Ausnahme sind explizite lokale pgTAP-Rezepte wie `just test-audit-db` und `just test-finance-db`; sie nutzen eine ephemere lokale Supabase-Testdatenbank ohne `--linked`. Cloud-Credentials liegen ausschließlich in lokaler Secret-Konfiguration.

## Konventionen

- Commits: Conventional Commits, Englisch
- Sprache: Deutsch für Docs/Diskussion, Englisch für Code
- Server-first: Server Components als Default, `use client` nur wenn nötig
- Typsicher, modular, keine Secrets im Code

## Offene Aufgaben (Brainstorming)

- [x] Section 2 — Architektur & Deployment ([docs/02-architecture-deployment.md](./docs/02-architecture-deployment.md))
- [x] Section 3 — Sicherheitsmodell ([docs/03-security-model.md](./docs/03-security-model.md))
- [x] Section 4 — KI-Architektur ([docs/04-ai-architecture.md](./docs/04-ai-architecture.md))
- [x] Section 5 — UX-Leitprinzipien ([docs/05-ux-principles.md](./docs/05-ux-principles.md))
- [x] Section 6 — End-to-End-Workflow + Risiken ([docs/06-workflows-and-risks.md](./docs/06-workflows-and-risks.md))

## Backlog (Security-Hygiene, nicht blocking)

- ~~`function_search_path_mutable`~~ — erledigt in 0019
- ~~`extension_in_public` für `pg_net`, `pgaudit`, `vector`~~ — lokal durch 0022/0023/0024 abgebildet (DROP+CREATE WITH SCHEMA `extensions`; `ALTER EXTENSION … SET SCHEMA` schlug laut früheren Cloud-Notizen mit SQLSTATE 42501 fehl, weil `supabase_admin` Owner ist). Frühere Cloud-Advisor-Schließung ist dokumentiert, aber in diesem Audit nicht erneut geprüft. Schließt zusätzlich die 4 pgaudit-RPC-Advisors strukturell. Vorbedingung war `public.embedding` leer — bei zukünftigen Daten via Snapshot/Restore oder Supabase-Support neu lösen.
- Audit Forward-Repair `0045`/`0046` lokal vorhanden; frühere Cloud-/Runtime-Validation ist dokumentiert, aber in diesem Audit nicht erneut geprüft.
- ~~`rls_disabled_in_public` auf `embedding_p0`~~ — temporäre Regression durch 0024-Rebuild, gefixt in 0025
- `embedding`-Repartitionierung (siehe 0010 Header) — beim Skalieren über 1 Tenant hinaus
- `audit_event` Cold-Storage: Tenant-UI bleibt nicht-destruktiv; detach/drop erst nach privilegiertem Export + Manifest + HMAC-Verify-Job.
- Agent-Write-Header TODO: nicht in diesem Sprint implementieren; nur als Risiko dokumentieren.
- Next-16 Deprecations/Workarounds: nicht in diesem Sprint migrieren; nach sauberem Build/Test separat triagieren.
- `auth_leaked_password_protection` — Supabase-Advisor-WARN, verifiziert 2026-07-14: Projekt läuft auf dem Free-Plan, der HaveIBeenPwned-Toggle (Auth → Settings) ist laut Supabase-Doku erst ab Pro-Plan verfügbar. Aktuell nicht schließbar ohne Plan-Upgrade — keine offene Aufgabe, sondern eine Plan-Grenze. Bei Upgrade: Toggle aktivieren und danach `just seed-admin` + `just e2e` laufen lassen, da Seed-/E2E-Passwort `admin1` (`seed-admin.mjs`, `auth.setup.ts`) mit Sicherheit in der HIBP-Liste steht.
- `rls_enabled_no_policy` (17× INFO) — alle `audit_event_*`-Partitions + `embedding_p0`: 0014-Pattern „RLS enabled, keine partition-spezifischen Policies" (zugriff geht über Parent-Tabelle, deren Policies via Partition-Routing greifen — siehe 0014-Header). Linter sieht das nicht, daher INFO-Rauschen.
- `auth_rls_initplan` (7× WARN, Supabase-Advisor, verifiziert 2026-07-13 per read-only MCP-Check gegen Cloud) — RLS-Policies auf `audit_event` (`audit_event_chain_read_for_audit_writer`), `embedding` (`embedding_select_own_tenant`, `_insert_own_tenant`, `_update_own_tenant`, `_delete_own_tenant`), `sollstellung` (`sollstellung_insert_generated`) und `audit_integrity_check` (`audit_integrity_check_insert_internal`) werten `auth.*()`/`current_setting()` pro Zeile statt einmal pro Query aus. Durch die 0055-Hardening nicht vollständig abgedeckt. Reine Performance-Optimierung (Policy-Ausdrücke in `(select ...)` wrappen), nicht sicherheitskritisch; noch keine Migration dafür.
- `duplicate_index` (1× WARN, Supabase-Advisor, verifiziert 2026-07-13) — `public.tenant` hat zwei identische Indizes (`tenant_pkey`, `tenant_tenant_id_id_uk`); einer kann per Migration entfernt werden.
- `authenticated_security_definer_function_executable` (11× WARN, Supabase-Advisor, verifiziert 2026-07-13) — u. a. `create_self_managed_weg_trial`, `create_tenant_invitation`, `accept_tenant_invitation`, `activate_wirtschaftsplan`, `archive_wirtschaftsplan`, `create_nachtragsplan`, `audit_integrity_status`, `audit_verify_chain`, `check_partition_archivable`, `get_archivable_partitions`, `is_partition_detached` sind als `SECURITY DEFINER`-RPCs für `authenticated` aufrufbar. Das ist die vorgesehene App-API-Oberfläche und vermutlich beabsichtigt, war aber bisher nicht als „geprüft und beabsichtigt" dokumentiert — vor einer echten Sicherheitsfreigabe einmal pro Funktion gegenprüfen, ob der jeweilige Business-Guard (Tenant-Check, Rollen-Check) tatsächlich im Funktionskörper sitzt.

## Referenzen

- System-Design: [docs/01-system-design.md](./docs/01-system-design.md)
- Architektur & Deployment: [docs/02-architecture-deployment.md](./docs/02-architecture-deployment.md)
- Sicherheitsmodell: [docs/03-security-model.md](./docs/03-security-model.md)
- KI-Architektur: [docs/04-ai-architecture.md](./docs/04-ai-architecture.md)
- UX-Leitprinzipien: [docs/05-ux-principles.md](./docs/05-ux-principles.md)
- Workflows + Risiken: [docs/06-workflows-and-risks.md](./docs/06-workflows-and-risks.md)
- Projektstatus: [PROJECT.md](./PROJECT.md)
- Test-Infrastruktur: [TEST_INFRA.md](./TEST_INFRA.md)
- Finance Lifecycle: [docs/07-finance-lifecycle.md](./docs/07-finance-lifecycle.md)

## Agentic-Arbeitsregel

Auch wenn der Nutzer eine Aufgabe kurz, unvollstaendig oder unstrukturiert formuliert, arbeitest du immer nach diesem Repository-Prozess:

1. Kontext lesen.
2. Ziel und Nicht-Ziele ableiten.
3. Architektur-, Datenschutz- und Sicherheitsrisiken pruefen.
4. Betroffene Dateien, Migrationen, RLS-Policies und Tests identifizieren.
5. Einen kleinen, nachvollziehbaren Plan erstellen.
6. Nur notwendige Aenderungen umsetzen.
7. Pflicht-Checks ausfuehren.
8. Ergebnis als handfesten Fahrplan berichten.

Wenn etwas riskant oder fachlich unklar ist, triff keine gefaehrliche Annahme. Frage gezielt nach oder waehle die sicherste kleine Umsetzung.

## Vor fachlichen, architektonischen oder sicherheitsrelevanten Aenderungen lesen

- `PROJECT_CONTEXT.md`
- `WORKFLOW.md`
- `TESTING.md`
- `SECURITY.md`
- `docs/01-system-design.md`
- `docs/02-architecture-deployment.md`
- `docs/03-security-model.md`
- `docs/04-ai-architecture.md`
- `docs/06-workflows-and-risks.md`
- `TEST_INFRA.md`
- `PROJECT.md`

## WEG-Verwaltung Safety Rules

- Keine Aenderung an RLS-Policies ohne expliziten Auftrag und Risikoanalyse.
- Keine Aenderung an Audit-Chain, HMAC, Audit-Partitionen oder Append-only-Logik ohne klare Begruendung.
- Keine Migration ohne Zweck, Risiko, betroffene Tabellen, RLS-Auswirkung, Teststrategie und Rollback-/Forward-Fix-Hinweis.
- Keine Supabase-Remote-Aktion ohne ausdrueckliche Freigabe.
- Kein `just db-migrate`, `supabase db push`, `seed-admin` oder Cloud-E2E ohne ausdrueckliche Freigabe.
- Tenant-Isolation ist nicht verhandelbar.
- KI-Agenten bleiben suggestion-only; kritische Writes duerfen nicht durch Agenten ermoeglicht werden.
- Vote-Logik referenziert `ownership_id`, niemals `person_id` oder `user_id`.
- Echte personenbezogene Daten, Cloud-Secrets, JWTs und Supabase-Credentials duerfen nicht gelesen, ausgegeben oder in Fixtures uebernommen werden.

## Pflicht-Checks

Der bevorzugte Abschlussbefehl ist:

```bash
./scripts/verify.sh
```

Wenn der volle Check nicht laufen kann, dokumentiere warum und fuehre eine kleinere passende Ersatzpruefung aus.

Remote-/Cloud-nahe Checks wie `just e2e`, `just db-migrate`, `just seed-admin` und Supabase-Linked-Kommandos laufen nur mit ausdruecklicher Freigabe.

## PROJECT_REALITY.md aktuell halten

`PROJECT_REALITY.md` ist das massgebliche Audit-Dokument fuer den realen
Projektstand und darf nicht hinter dem tatsaechlichen Code zurueckfallen.
`scripts/check-project-reality-freshness.sh` prueft deterministisch (git-only,
keine Secrets, keine Cloud-Aufrufe), wie viele Produktcode-Commits seit dem
letzten Refresh-Commit gelandet sind, und listet sie auf. Der Check laeuft:

- informativ als Teil von `./scripts/verify.sh` (blockiert nie),
- als eigener, nicht-blockierender CI-Job `PROJECT_REALITY Freshness`
  (`.github/workflows/project-reality-freshness.yml`) auf PRs, die
  `apps/`, `infra/supabase/migrations/` oder `packages/` aendern.

Der Check schreibt PROJECT_REALITY.md nicht automatisch neu — die inhaltliche
Bewertung (Implemented / Partially implemented / Not verified / Next Logical
Step) bleibt bewusst Menschen-/Agentenurteil und damit an die normalen
Git-Freigaberegeln gebunden. Wenn der Check „STALE" meldet, ist das
Aktualisieren von `PROJECT_REALITY.md` nach derselben Methode Teil der
naechsten groesseren oder riskanten Aufgabe, bevor neue Breite angegangen
wird.

## Git-Regeln

Git-Aktionen sind Teil des kontrollierten Agentenprozesses, aber nicht autonom.

- Keine Commits ohne ausdrueckliche Freigabe des Nutzers.
- Kein Push ohne ausdrueckliche Freigabe des Nutzers.
- Vor jedem Commit oder Push immer `git status` und relevante `git diff`-Ansichten pruefen.
- Nur Dateien stagen, die eindeutig zur freigegebenen Aufgabe gehoeren.
- Fremde, alte oder unklare Worktree-Aenderungen nicht stagen und nicht bereinigen.
- Keine destruktiven Git-Befehle wie `git reset`, `git checkout --`, `git clean` oder Rebase ohne ausdrueckliche Freigabe.
- Vor Commit muss `./scripts/verify.sh` erfolgreich laufen oder das verbleibende Risiko transparent berichtet werden.
- Commit-Message muss Zweck und Scope der Aenderung beschreiben.
- Vor Push muss klar sein, welcher Branch und welches Remote-Ziel verwendet werden.
- Wenn ein PR vorbereitet wird, muss der Agent Zusammenfassung, Tests, Risiken und bewusst nicht enthaltene Aenderungen dokumentieren.

## Verstaendliche Abschlussberichte

Berichte muessen fuer Menschen entscheidungsfaehig sein. Ein technisches Finding allein reicht nicht.

Jeder Abschlussbericht muss enthalten:

- Kurzfazit: erledigt, teilweise erledigt oder blockiert.
- Was bedeutet das? Eine einfache Erklaerung in 1-3 Saetzen.
- Einen handfesten Fahrplan mit konkreten naechsten Schritten in Reihenfolge.
- Pro Schritt: Datei/Bereich, Aktion, kurze Begruendung und ob Freigabe noetig ist.
- Eine empfohlene Entscheidung fuer den Nutzer: freigeben, nicht freigeben oder erst klaeren.
- Git-Status: gestaged, committed, gepusht, naechste Freigabe.
- Wenn nicht gepusht wurde, klar sagen: `Es wurde nichts gepusht.`

Findings muessen dieses Format haben:

- Status: `SUPPORTED`, `PARTIALLY_SUPPORTED`, `INSUFFICIENT_EVIDENCE`, `CONFLICTING` oder `NOT_FOUND`.
- Prioritaet: `P1`, `P2` oder `P3`.
- Problem: Was ist konkret falsch oder unklar?
- Auswirkung: Warum ist das wichtig?
- Naechster Schritt: Was soll konkret getan werden?
- Begruendung: Warum ist dieser Schritt sinnvoll?
