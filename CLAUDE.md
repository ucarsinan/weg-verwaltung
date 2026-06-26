# WEG-Verwaltung — Projekt-CLAUDE.md

## Was ist das

Verwaltungssoftware für Wohnungseigentümergemeinschaften (WEG) — Multi-Tenant SaaS für Profi-Hausverwalter, KI-First, sicher von Anfang an. Portfolio-Piece in Profi-Qualität.

**Aktueller Stand (lokal belegt, Juni 2026):** Cloud-DB-Ziel ist das lokal verlinkte Supabase-Frankfurt-Projekt, aber der Cloud-Migrationsstand wurde in diesem Audit nicht aktiv verifiziert. Lokal liegen Migrationen `0001–0049`: Dokumente/Personen/Eigentümerschaft bis `0033`, Audit-Hotfix/Forward-Repair und Least-Privilege-Hardening bis `0046`, Finance Lifecycle bis `0048`, Meeting/Resolution-Hardening in `0049`. Next.js-16-Web-App und FastAPI/LangGraph-Agent sind vorhanden. RAG-Retrieval ist Scaffold und liefert bewusst `[]`, bis Embedding-Datenpipeline und Eval-Gates stehen. E2E-Specs existieren, wurden in diesem Audit aber nicht gegen die Cloud ausgeführt. Produktives Hosting für Web-App und Agent ist aus dem Repo nicht belegt. Vote referenziert `ownership_id`, niemals `person_id` oder `user_id`; Co-Eigentümer zählen als eine Stimme pro Ownership.

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
just e2e           # Playwright/Chromium — Login-Flow gegen Cloud; nicht ohne explizite Freigabe im Audit laufen lassen
just seed-admin    # Tenant + tenant_admin via Supabase Admin-API (idempotent)
just codegen       # OpenAPI → packages/shared-types (agent muss laufen)
just db-migrate    # supabase db push --workdir infra (gegen Cloud!)
```

Kein `supabase start` / `db-reset` mehr — Projekt ist **remote-only** gegen Frankfurt. Cloud-Credentials liegen ausschließlich in lokaler Secret-Konfiguration.

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
- `auth_leaked_password_protection` — zuletzt dokumentierter Supabase-Advisor-WARN; in diesem Audit nicht erneut geprüft. HaveIBeenPwned-Toggle in Supabase Studio (Auth → Settings), keine Migration nötig.
- `rls_enabled_no_policy` (17× INFO) — alle `audit_event_*`-Partitions + `embedding_p0`: 0014-Pattern „RLS enabled, keine partition-spezifischen Policies" (zugriff geht über Parent-Tabelle, deren Policies via Partition-Routing greifen — siehe 0014-Header). Linter sieht das nicht, daher INFO-Rauschen.

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
