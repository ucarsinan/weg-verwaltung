[![CI](https://github.com/<owner>/weg-verwaltung/actions/workflows/ci.yml/badge.svg)](https://github.com/<owner>/weg-verwaltung/actions/workflows/ci.yml)
[![License: Proprietary](https://img.shields.io/badge/license-proprietary-red)](./LICENSE)
[![Spec: 6/6 Sections](https://img.shields.io/badge/spec-6%2F6%20sections-brightgreen)](./docs/)

# WEG-Verwaltung

> **Status:** Lauffähiger lokaler Code vorhanden · Remote-only Supabase-Projekt · Worktree in Review-Vorbereitung (Stand: Juni 2026)

Schlanke, KI-gestützte Verwaltungssoftware für Wohnungseigentümergemeinschaften (WEG) — gebaut wie ein Profi-Produkt, betrieben als Portfolio. Multi-Tenant SaaS für Profi-Hausverwalter. Sicher von Anfang an: Mandanten-Isolation auf DB-Ebene, KI-Schreibsperre als Datenbank-Constraint, append-only Audit und Beschluss-Sammlung.

## Warum

Bestehende Verwalter-Software (Haufen Powerhaus, immoware24, Karthago, Domus) ist groß, kompliziert und UI/UX-technisch oft schwach — KI höchstens als Aufsatz. Lücke: schlankes, modernes Tool mit **KI-First-Design** und kompromissloser Sicherheit, gebaut auf modernem Stack.

## Was im MVP

Versammlungsmanagement für **alle vier Modi** (Präsenz · Hybrid · Virtuell · Umlaufbeschluss):

- Einladung mit gesetzlicher Frist-Prüfung (§24 Abs. 4 WEG)
- Tagesordnung & Beschlussvorlagen — KI-gestützt: Vorschläge aus Vorjahres-Protokoll, Bestimmtheits-Check
- Abstimmung abstrahiert über alle vier Modi (Kopf-, Wert- oder Objektprinzip pro Beschluss, §25 WEG)
- Beschluss-Sammlung append-only (§24 Abs. 7 WEG)
- Protokoll-Entwurf durch KI-Agent, Verwalter unterzeichnet
- Vollmachten

## Architektur (Kurzfassung)

```text
┌────────────────────────┐     ┌─────────────────────────┐
│  apps/web              │     │  apps/agent             │
│  Next.js 16            │     │  FastAPI + LangGraph    │
│  Server Actions ──┐    │     │  Tool-Calls ──┐         │
└───────────────────┼────┘     └────────────────┼────────┘
                    │                            │
                    ▼          Both use          ▼
                  ┌──────────  User-JWT  ──────────┐
                  │  Supabase (Frankfurt)          │
                  │  Postgres + Auth + Storage     │
                  │  RLS = Mandanten-Iso           │
                  └────────────────────────────────┘
```

Modularer Monolith, zwei Deployments. Detailsektionen (Architektur, Security, KI, UX, Workflow) liegen unter [docs/](./docs/). Der lokale Code-Stand geht über die ursprüngliche Design-Spec hinaus.

## Stack

- **Frontend:** Next.js 16 (App Router, Server Components)
- **Agent:** FastAPI + LangGraph (State-Machine, deterministisch)
- **Daten:** Supabase Frankfurt — Postgres + Auth + Storage + RLS (EU-Datenresidenz)
- **LLMOps:** Langfuse (Observability) + RAGAS (RAG-Eval)
- **Mail:** Resend
- **Sprachen:** TypeScript + Python

## Sicherheits-Prinzipien

1. **Mandanten-Isolation auf DB-Ebene** via RLS — kein App-Code-Pfad kann das umgehen.
2. **KI = nur Vorschläge** — DB-Trigger lehnt `actor_type=agent` auf kritischen Tabellen ab.
3. **Append-only Beschluss-Sammlung** — Trigger blockt `UPDATE`/`DELETE` (§24 Abs. 7 WEG).
4. **Append-only Audit-Log** — auch Tenant-Admin kann eigene Spuren nicht löschen.
5. **Externe Adapter** — eIDAS / SEPA / Streaming sind saubere Adapter-Slots, keine Vollintegrationen.

## Roadmap

| Phase | Inhalt | Status |
| --- | --- | --- |
| 0 | Brainstorming & System-Design | abgeschlossen |
| 1 | WEG-, Personen-, Eigentümerschafts- und Versammlungsflows | teilweise implementiert |
| 2 | Dokumente, Protokoll-PDF und RAG-Suche | Dokument-/PDF-Grundlagen vorhanden; RAG nur Scaffold |
| 3 | Wirtschaftsplan, Hausgeld und Sollstellung | lokal implementiert; Review offen |
| 4 | Mängel-/Ticket-/Vorgangsworkflow | Grundlage lokal implementiert; Review offen |

## Status

Aktuell existieren eine Next.js-16-Web-App unter [apps/web](./apps/web), ein FastAPI/LangGraph-Agent unter [apps/agent](./apps/agent) und Supabase-Migrationen unter [infra/supabase/migrations](./infra/supabase/migrations).

Belegt lokal:

- Web-App mit Supabase-Auth, Dashboard, WEG-Stammdaten, Personen/Eigentümerschaft, Versammlungen, Beschluss-Sammlung, Audit-Ansicht, Protokoll-PDF, Finanzseiten und Vorgangszentrale.
- Agent-Service mit FastAPI-Routern, JWT-Prüfung, LangGraph-orientierten Graphen für Agenda/Beschluss/Protokoll/Vorgang und RAG-Scaffold.
- Lokale Migrationen `0001` bis `0055`: bis `0049` Dokumente/Personen/Eigentümerschaft, Audit-/Finance-/Meeting-Hardening; `0050` Audit-Console-Read-API; `0051` Actor-Guard-DELETE-Fix; `0052` Vorgangszentrale-Foundation; `0053` Settings-Audit-Trigger; `0054` Agent-Suggestion-Vorgangsanker; `0055` Advisor-Grant- und RLS-InitPlan-Hardening.
- RAG-Retrieval ist bewusst nicht produktiv: `apps/agent/app/rag/retrieve.py` liefert bis zur Datenpipeline `[]`.

Nicht in diesem Audit verifiziert:

- Cloud-Migrationsstand des Supabase-Projekts.
- Aktueller E2E-Lauf gegen die Cloud.
- Produktives Hosting für Web-App und Agent.

## Lizenz

**Proprietär · All Rights Reserved.** Dieses Repository ist öffentlich einsehbar für Portfolio-Zwecke. Nutzung, Kopie, Modifikation oder Weiterverbreitung — auch von Teilen — ist ohne vorherige schriftliche Genehmigung nicht gestattet. Details in [LICENSE](./LICENSE).

## Kontakt

GitHub: [@ucarsinan](https://github.com/ucarsinan)
