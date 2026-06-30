# PROJECT_CONTEXT.md

## Projekt

Name: WEG-Verwaltung

## Zweck

WEG-Verwaltung ist eine Multi-Tenant-SaaS fuer professionelle Hausverwalter von Wohnungseigentuemergemeinschaften.
Das Projekt ist ein Portfolio-Produkt mit starkem Sicherheitsfokus: Mandanten-Isolation, append-only Audit, Beschluss-Sammlung, KI als Vorschlagssystem und Remote-only Supabase Frankfurt.

## Wichtigste Grundsaetze

- Tenant-Isolation zuerst.
- RLS ist die harte Sicherheitsgrenze, nicht nur App-Code.
- KI darf kritische Fachobjekte nicht direkt schreiben.
- Audit und Beschluss-Sammlung bleiben append-only.
- Migrationen sind sicherheitskritisch und brauchen Tests.
- Remote-Supabase-Aktionen brauchen ausdrueckliche Freigabe.

## Systembereiche

| Bereich | Verantwortung |
| --- | --- |
| `apps/web` | Next.js 16 Web-App, UI, Server Actions, Supabase-Client |
| `apps/agent` | FastAPI/LangGraph-Agent, Guardrails, RAG-Scaffold |
| `apps/web/modules` | Fachmodule fuer Identity, WEG, Versammlung, Beschluss-Sammlung, Dokumente, Audit, Agent-Bridge, Finanzen |
| `infra/supabase/migrations` | Datenmodell, RLS, Trigger, Audit, HMAC, Finance, Meeting/Resolution-Hardening |
| `infra/supabase/tests` | pgTAP-/SQL-Regressions fuer Security und Datenbankverhalten |
| `packages/shared-types` | generierte OpenAPI-/Shared-Types |

## Kritische Grenzen

- Keine produktiven Daten in Tests, Fixtures, Reports oder Doku.
- Keine Cloud-Migration ohne Freigabe.
- Kein DB-Reset gegen Remote.
- Keine RLS-Lockerung ohne explizite Begruendung.
- Keine Agent-Write-Erweiterung auf kritische Tabellen ohne ADR und Tests.

## Aktueller Zustand

Lokal existieren Web-App, Agent-Service und Supabase-Migrationen bis `0056`.
Der Cloud-Migrationsstand ist nicht automatisch belegt und muss vor produktionsnahen Aussagen direkt verifiziert werden.
RAG-Retrieval ist Scaffold und liefert bewusst `[]`, bis Datenpipeline und Eval-Gates vorhanden sind.
