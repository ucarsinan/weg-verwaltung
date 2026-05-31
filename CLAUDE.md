# WEG-Verwaltung — Projekt-CLAUDE.md

## Was ist das

Verwaltungssoftware für Wohnungseigentümergemeinschaften (WEG) — Multi-Tenant SaaS für Profi-Hausverwalter, KI-First, sicher von Anfang an. Portfolio-Piece in Profi-Qualität.

**Aktueller Stand:** Cloud-DB live (Supabase Frankfurt, project-ref `sgdlzafvhrfulwidqsno`), 25 Migrationen angewendet (0001–0025) inkl. Dokumente-Modul (`document`, `document_version`, Storage-Bucket `weg-docs`), `function_search_path` lockdown (0019), `extension_in_public` strukturell geschlossen (0022 pg_net, 0023 pgaudit, 0024 vector → `extensions` Schema, 0025 RLS-Backfill auf embedding_p0). pgaudit-Move (0023) schließt zusätzlich die 4 `*_security_definer_function_executable`-Advisors; Migrationen 0020+0021 sind dadurch strukturell moot, bleiben als historischer Record. API-Keys auf neues Format (`sb_publishable_…` / `sb_secret_…`); Legacy disabled. Custom Access Token Hook + `pgrst.db_pre_request` via Management API gesetzt. `just seed-admin` legt Tenant + tenant_admin via Admin-API an. Web + Agent: `just typecheck` + `just lint` + `just test` grün end-to-end. `next build` produziert 22 Routes sauber. `just e2e` (Playwright/Chromium, versammlungen.spec.ts in `serial`-mode wegen Next 16 on-demand-compile-Hänger bei paralleler Route-Discovery): **15 Tests grün** — Landing + a11y + `/login`-Navigation + Invalid-Creds-Reject + Login-Flow + WEG-CRUD + Dashboard (Email + `tenant_id` + `role` aus Hook-injected JWT-Claims, gelesen via `supabase.auth.getClaims()` — *nicht* `getUser()`, weil `auth.users.raw_app_meta_data` die Hook-Claims nicht persistiert) + Versammlungs-Pfad: (a) WEG → Versammlung → TOP-Anlage/-Edit/-Delete, (b) Status-Übergang `entwurf → eingeladen` mit § 24 Abs. 4 WEG Einladungsfrist-Check (21 Tage, gespiegelt zur DB-Generated-Column `frist_einladung_ok`), (c) Beschlussvorlage anlegen + Feststellungs-Gate auf Abstimmungs-Seite. Code-vollständig aber ohne e2e: Vote → `feststellenResolution` → automatischer BeschlussSammlungEntry-Append (§ 24 Abs. 7 WEG). Bekannter Workaround in den Tests: `<Button asChild><Link>`-Pattern (Shadcn + Radix Slot) wird auf Next 16 nicht zuverlässig per `click()` navigiert — Tests greifen den `href` ab und nutzen `page.goto`. Nächster Schritt = Audit-Event-Wiring (DB-Trigger pro Business-Table) oder Abstimmungs-e2e mit voller Einheit + Eigentümerschaft-Fixture.

## Stack

- Next.js 16 (App Router, Server Components) — `apps/web/`
- FastAPI + LangGraph — `apps/agent/`
- Supabase Frankfurt (Postgres + Auth + Storage + RLS)
- Langfuse (LLM-Observability) + RAGAS (RAG-Eval)
- Resend (Mail)

## Architektur

Modularer Monolith mit getrenntem Agent-Service (ein Repo, zwei Deployments). Domain-Module mit harten Interfaces innerhalb `apps/web/modules/`:

- `identity/` · `weg/` · `versammlung/` · `beschluss-sammlung/` · `dokumente/` · `audit/` · `agent-bridge/`

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
just e2e           # Playwright/Chromium — Login-Flow gegen Cloud
just seed-admin    # Tenant + tenant_admin via Supabase Admin-API (idempotent)
just codegen       # OpenAPI → packages/shared-types (agent muss laufen)
just db-migrate    # supabase db push --workdir infra (gegen Cloud!)
```

Kein `supabase start` / `db-reset` mehr — Projekt ist **remote-only** gegen Frankfurt. `.env.local` enthält die Cloud-Credentials.

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
- ~~`extension_in_public` für `pg_net`, `pgaudit`, `vector`~~ — erledigt in 0022/0023/0024 (DROP+CREATE WITH SCHEMA `extensions`; `ALTER EXTENSION … SET SCHEMA` schlug Cloud-seitig mit SQLSTATE 42501 fehl, weil `supabase_admin` Owner ist). Schließt zusätzlich die 4 pgaudit-RPC-Advisors strukturell. Vorbedingung war `public.embedding` leer — bei zukünftigen Daten via Snapshot/Restore oder Supabase-Support neu lösen.
- ~~`rls_disabled_in_public` auf `embedding_p0`~~ — temporäre Regression durch 0024-Rebuild, gefixt in 0025
- `embedding`-Repartitionierung (siehe 0010 Header) — beim Skalieren über 1 Tenant hinaus
- `audit_event` Cold-Storage (0014_audit_cold_storage geplant): Partitions >24 Mo. detachen → Supabase Storage
- `auth_leaked_password_protection` (1× WARN) — HaveIBeenPwned-Toggle in Supabase Studio (Auth → Settings), keine Migration nötig
- `rls_enabled_no_policy` (17× INFO) — alle `audit_event_*`-Partitions + `embedding_p0`: 0014-Pattern „RLS enabled, keine partition-spezifischen Policies" (zugriff geht über Parent-Tabelle, deren Policies via Partition-Routing greifen — siehe 0014-Header). Linter sieht das nicht, daher INFO-Rauschen.

## Referenzen

- System-Design: [docs/01-system-design.md](./docs/01-system-design.md)
- Architektur & Deployment: [docs/02-architecture-deployment.md](./docs/02-architecture-deployment.md)
- Sicherheitsmodell: [docs/03-security-model.md](./docs/03-security-model.md)
- KI-Architektur: [docs/04-ai-architecture.md](./docs/04-ai-architecture.md)
- UX-Leitprinzipien: [docs/05-ux-principles.md](./docs/05-ux-principles.md)
- Workflows + Risiken: [docs/06-workflows-and-risks.md](./docs/06-workflows-and-risks.md)
- Hub: `~/Development/personal-assistant/CLAUDE.md`
