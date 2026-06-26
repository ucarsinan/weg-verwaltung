# PROJECT_REALITY

Last audit: 2026-06-26
Recommendation: validate
Confidence: medium

## Core Problem
- Problem: Profi-Hausverwalter brauchen eine schlanke, sichere WEG-Verwaltung, die Versammlungen, Beschluesse, Protokolle, Eigentuemerdaten, Finanzen und Vorgaenge weniger fehleranfaellig abwickelt.
- Affected user: WEG-Verwalter mit mehreren Mandanten/WEGs; Wohnungseigentuemer sind Nebenakteure fuer Einsicht, Abstimmung, Vollmacht und Kommunikation.
- Painful current workflow: Rechtlich formale WEG-Prozesse werden ueber mehrere Tools, Dokumente und manuelle Kontrollen verteilt; KI-Unterstuetzung waere riskant, wenn sie nicht als Vorschlag mit harter Audit-/RLS-Grenze umgesetzt ist.
- Desired real-world outcome: Ein lokaler MVP/Portfolio-Schnitt, der einen realen WEG-Kernworkflow sicher demonstriert und gegen Cloud, E2E und Review-Daten belegbar ist.
- Success criteria: Cloud-Migrationen aktuell, E2E gegen Frankfurt gruen, RLS/Audit-Gates gruen, ein kompletter Demo-Workflow mit realistischen Daten laeuft, KI bleibt HITL/Vorschlag, keine produktiven Hosting-Claims ohne Deployment-Beleg.

## Current State
- Implemented: Next.js-16-Web-App, FastAPI/LangGraph-Agent, Supabase-Migrationen 0001-0055, WEG/Personen/Eigentuemerschaft, Versammlung/Beschluss/Protokoll, Audit-Konsole, Finance Lifecycle, Vorgangszentrale-Grundlage, lokale Unit-/Agent-Tests und Web-Build.
- Partially implemented: RAG ist Scaffold und liefert bewusst leere Treffer; Agent-HITL/Side-Effect-Safety, Frist-Graph, Langfuse/RAGAS-Gates, Audit-Cold-Storage-Export, produktive Betriebsautomation und E2E-Cloud-Absicherung sind offen.
- Not verified: aktueller Supabase-Cloud-Migrationsstand, `just e2e` gegen Frankfurt, GitHub-CI-Lauf, produktives Hosting fuer Web/Agent, echte Verwalter-Nutzerakzeptanz.
- Last stopping point: Lokaler Review-Schnitt nach 0055 Advisor-Grant-/RLS-InitPlan-Hardening; Worktree ist dirty mit Doku-/CI-/justfile-Aenderungen und neuen 0055 SQL-Artefakten.

## Reality Findings
- Local evidence: `README.md`, `PROJECT.md`, `TEST_INFRA.md`, `AGENTS.md`, `apps/web`, `apps/agent`, `infra/supabase`; lokale Checks am 2026-06-26: Web Vitest 148 passed, Agent pytest 73 passed/5 skipped, ESLint gruen, TypeScript gruen, Ruff gruen, Mypy gruen, Next build gruen mit Node 22.
- External sources: WEG §§ 23-25 bestaetigen virtuelle Versammlung, Umlaufbeschluss, Einladungs-/Niederschrifts-/Beschluss-Sammlungspflichten und Stimmrechtsmodell; Supabase-Doku bestaetigt RLS als Pflicht fuer exposed `public` schema; Next-Doku verlangt Node >=20.9.
- Best-practice implications: Die Projektinvarianten RLS-first, DB-Constraints, append-only Audit/Beschluss und KI-nur-Vorschlag passen zum Problembereich. Der naechste Wert entsteht nicht durch weitere Features, sondern durch echte Cloud/E2E/Demo-Validierung.
- Key uncertainty: Ob der lokal solide Stand in der verlinkten Frankfurt-Cloud und in einem realistischen Verwalter-Demoablauf genauso funktioniert.

## Gaps And Risks
- Missing essentials: Cloud-Migration verifizieren, E2E ausfuehren, Demo-Daten/Scenario einfrieren, Hosting-Beleg schaffen oder Hosting-Claims entfernen, RAG-Datenpipeline bewusst weiterhin aus MVP-Claims heraushalten.
- Luftschloss/drift warnings: Mehr KI/RAG/Automationsfeatures waeren Drift, solange die Basis-Workflows nicht cloud-verifiziert und fuer einen realen Verwalter nachvollziehbar demonstrierbar sind.
- Risks: Remote-only DB erhoeht Validierungsrisiko; E2E-Specs enthalten teilweise schwache Assertions; Audit-Legacy-Fenster bleibt forensisch eingeschraenkt; produktive Compliance-/AVV-/AI-Act-Annahmen sind nicht als Betriebsartefakte belegt.

## Next Logical Step
1. Step: Cloud-/E2E-Validierung als Review-Gate ausfuehren: Migration-Status read-only pruefen, dann `just e2e` gegen Frankfurt nur mit expliziter Freigabe, danach CI-Status abgleichen.
   Why: Das groesste Realitaetsrisiko ist nicht lokale Codequalitaet, sondern die Luecke zwischen lokalem Stand und echter Cloud-Laufzeit.
   Validation: E2E-Report, Supabase-Migrationsabgleich, CI-Link/Run-ID und dokumentierte Abweichungen.
   Stop/continue rule: Wenn Cloud/E2E rot ist, keine neuen Features; zuerst kleinste reproduzierbare Failure-Slices fixen. Wenn gruen, Demo-Workflow und Portfolio-Schnitt einfrieren.

## Do Not Build Yet
- Keine RAG-Produktivbehauptung vor Embedding-Pipeline, Eval-Dataset und RAGAS/Langfuse-Gate.
- Keine destruktive Audit-Cold-Storage-Funktion vor privilegiertem Export, Manifest und HMAC-Verify-Job.
- Keine weiteren Vorgangszentrale-/Agent-Automationen, bevor der Kern-Demoablauf cloud-verifiziert ist.
- Keine produktiven Hosting- oder Compliance-Claims ohne belegte Deployments, AVV/Subprocessor-Liste und Betriebschecks.

## Source Links
- WEG §23: https://www.gesetze-im-internet.de/woeigg/__23.html
- WEG §24: https://www.gesetze-im-internet.de/woeigg/__24.html
- WEG §25: https://www.gesetze-im-internet.de/woeigg/__25.html
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Next.js Installation: https://nextjs.org/docs/app/getting-started/installation
- GDPR Article 28: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679
- EU AI Act Article 4: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689
