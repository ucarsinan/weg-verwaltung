[![CI](https://github.com/<owner>/weg-verwaltung/actions/workflows/ci.yml/badge.svg)](https://github.com/<owner>/weg-verwaltung/actions/workflows/ci.yml)
[![License: Proprietary](https://img.shields.io/badge/license-proprietary-red)](./LICENSE)
[![Spec: 6/6 Sections](https://img.shields.io/badge/spec-6%2F6%20sections-brightgreen)](./docs/)

# WEG-Verwaltung

> **Status:** Design-Phase · Portfolio-Piece · kein lauffähiger Code (Stand: Mai 2026)

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

Modularer Monolith, zwei Deployments. Detailsektionen (Architektur, Security, KI, UX, Workflow) folgen als sichtbare Commits unter [docs/](./docs/).

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
| 0 | Brainstorming & System-Design | in Arbeit |
| 1 | MVP: Versammlungsmanagement | geplant |
| 2 | Dokumente + RAG-Suche | offen |
| 3 | Hausgeld & Abrechnung | offen |
| 4 | Mängel-/Ticket-Workflow | offen |

## Status

Aktuell **Design-First-Phase**. Code-Implementation hat noch nicht begonnen. Iterationen sind als Commits unter [docs/](./docs/) sichtbar. Der vollständige System-Design-Spec liegt in [docs/01-system-design.md](./docs/01-system-design.md).

## Lizenz

**Proprietär · All Rights Reserved.** Dieses Repository ist öffentlich einsehbar für Portfolio-Zwecke. Nutzung, Kopie, Modifikation oder Weiterverbreitung — auch von Teilen — ist ohne vorherige schriftliche Genehmigung nicht gestattet. Details in [LICENSE](./LICENSE).

## Kontakt

GitHub: [@ucarsinan](https://github.com/ucarsinan)
