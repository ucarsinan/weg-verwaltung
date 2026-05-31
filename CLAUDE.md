# WEG-Verwaltung — Projekt-CLAUDE.md

## Was ist das

Verwaltungssoftware für Wohnungseigentümergemeinschaften (WEG) — Multi-Tenant SaaS für Profi-Hausverwalter, KI-First, sicher von Anfang an. Portfolio-Piece in Profi-Qualität.

**Aktueller Stand:** Cloud-DB live (Supabase Frankfurt, project-ref `sgdlzafvhrfulwidqsno`), 21 Migrationen angewendet (0001–0021) inkl. Dokumente-Modul (`document`, `document_version`, Storage-Bucket `weg-docs`), `function_search_path` lockdown (0019), pgaudit-RPC-Revoke-Versuch (0020+0021, Cloud-seitig No-Op — siehe Backlog). API-Keys auf neues Format (`sb_publishable_…` / `sb_secret_…`); Legacy disabled. Custom Access Token Hook + `pgrst.db_pre_request` via Management API gesetzt. `just seed-admin` legt Tenant + tenant_admin via Admin-API an. Web + Agent: `just typecheck` + `just lint` + `just test` grün end-to-end. `next build` produziert 22 Routes sauber. `just e2e` (Playwright/Chromium) gegen Cloud: **12 Tests grün** — Landing + a11y + `/login`-Navigation + Invalid-Creds-Reject + Login-Flow + WEG-CRUD + Dashboard (Email + `tenant_id` + `role` aus Hook-injected JWT-Claims, gelesen via `supabase.auth.getClaims()` — *nicht* `getUser()`, weil `auth.users.raw_app_meta_data` die Hook-Claims nicht persistiert). Nächster Schritt = nächstes Domain-Modul (Versammlung) oder Audit-Event-Wiring.

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
- `extension_in_public` für `pg_net`, `pgaudit`, `vector` → in `extensions` Schema verschieben (Supabase-Konvention). **Strukturell nötig**, weil dies auch die zwei pgaudit-RPC-Advisors (`anon`/`authenticated_security_definer_function_executable` auf `pgaudit_ddl_command_end`, `pgaudit_sql_drop`) schließt: surgical `REVOKE EXECUTE` in 0020/0021 war Cloud-seitig No-Op (PG meldet `01006: no privileges could be revoked` — funktionen haben weder direkten Grant noch erbbaren PUBLIC-Grant, advisor flaggt rein API-schema-basiert). Move-Migration TBD (Risiko: `vector(384)`-Typen in `embedding`-Tabelle müssen mitziehen).
- `embedding`-Repartitionierung (siehe 0010 Header) — beim Skalieren über 1 Tenant hinaus
- `audit_event` Cold-Storage (0014_audit_cold_storage geplant): Partitions >24 Mo. detachen → Supabase Storage

## Referenzen

- System-Design: [docs/01-system-design.md](./docs/01-system-design.md)
- Architektur & Deployment: [docs/02-architecture-deployment.md](./docs/02-architecture-deployment.md)
- Sicherheitsmodell: [docs/03-security-model.md](./docs/03-security-model.md)
- KI-Architektur: [docs/04-ai-architecture.md](./docs/04-ai-architecture.md)
- UX-Leitprinzipien: [docs/05-ux-principles.md](./docs/05-ux-principles.md)
- Workflows + Risiken: [docs/06-workflows-and-risks.md](./docs/06-workflows-and-risks.md)
- Hub: `~/Development/personal-assistant/CLAUDE.md`
