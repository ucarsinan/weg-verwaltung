# WEG-Verwaltung — Projekt-CLAUDE.md

## Was ist das

Verwaltungssoftware für Wohnungseigentümergemeinschaften (WEG) — Multi-Tenant SaaS für Profi-Hausverwalter, KI-First, sicher von Anfang an. Portfolio-Piece in Profi-Qualität.

**Aktueller Stand:** Design-Phase. Section 1 (Domain-Modell) fertig. Sections 2–6 folgen als sichtbare Commits unter `docs/`.

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

- [ ] Section 2 — Architektur & Deployment
- [ ] Section 3 — Sicherheitsmodell (Authn/Authz, DSGVO, Threat-Model)
- [ ] Section 4 — KI-Architektur (LangGraph-Graph, Tools, Guardrails, LLMOps)
- [ ] Section 5 — UX-Leitprinzipien (sichere Defaults, Undo, A11y, Tastatur-First)
- [ ] Section 6 — End-to-End-Workflow + Out-of-Scope + Risiken

## Referenzen

- System-Design: [docs/01-system-design.md](./docs/01-system-design.md)
- Hub: `~/Development/personal-assistant/CLAUDE.md`
