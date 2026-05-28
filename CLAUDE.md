# WEG-Verwaltung — Projekt-CLAUDE.md

## Was ist das

Verwaltungssoftware für Wohnungseigentümergemeinschaften (WEG) — Multi-Tenant SaaS für Profi-Hausverwalter, KI-First, sicher von Anfang an. Portfolio-Piece in Profi-Qualität.

**Aktueller Stand:** **Design-Phase abgeschlossen — alle 6 Sections fertig.** Nächster Commit ist Code, nicht Spec.

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

1. Mandanten-Iso via RLS (`tenant_id = auth.jwt() ->> 'tenant_id'`).
2. KI = nur Vorschläge — DB-Trigger blockiert `actor_type=agent` auf `Vote`, `BeschlussSammlungEntry`, `Protocol.unterzeichnet`, `Resolution`.
3. `BeschlussSammlungEntry` ist append-only (Trigger lehnt UPDATE/DELETE ab).
4. `AuditEvent` ist unlöschbar — auch für Tenant-Admin.
5. Stimmen referenzieren `ownership_id`, niemals `person_id` oder `user_id` (historische Korrektheit bei Eigentumswechsel).

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

## Referenzen

- System-Design: [docs/01-system-design.md](./docs/01-system-design.md)
- Architektur & Deployment: [docs/02-architecture-deployment.md](./docs/02-architecture-deployment.md)
- Sicherheitsmodell: [docs/03-security-model.md](./docs/03-security-model.md)
- KI-Architektur: [docs/04-ai-architecture.md](./docs/04-ai-architecture.md)
- UX-Leitprinzipien: [docs/05-ux-principles.md](./docs/05-ux-principles.md)
- Workflows + Risiken: [docs/06-workflows-and-risks.md](./docs/06-workflows-and-risks.md)
- Hub: `~/Development/personal-assistant/CLAUDE.md`
