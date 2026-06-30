# PROJECT_REALITY

Last audit: 2026-06-29
Recommendation: continue
Confidence: high

## Core Problem
- Problem: Profi-Hausverwalter brauchen eine sichere, schlanke WEG-Verwaltung fuer Versammlungen, Beschluesse, Protokolle, Eigentuemerdaten, Finanzen, Audit und Vorgaenge.
- Affected user: WEG-Verwalter mit mehreren Mandanten/WEGs; Eigentuemer, Beirat und Mitarbeitende sind Nebenrollen fuer Einsicht, Abstimmung, Vollmacht und Kommunikation.
- Painful current workflow: Rechtlich formale WEG-Prozesse laufen heute oft ueber viele Tools, Dokumente und manuelle Kontrollen; KI-Unterstuetzung waere gefaehrlich, wenn sie kritische Writes ausloesen oder Mandanten-Iso umgehen koennte.
- Desired real-world outcome: Ein lokal belegbarer MVP/Portfolio-Schnitt, der einen realistischen WEG-Kernworkflow sicher demonstriert: RLS-first, append-only Audit/Beschluss-Sammlung, Vote ueber `ownership_id`, KI nur als Vorschlag.
- Success criteria: Lokale Checks gruen, Cloud-Migrationen verifiziert, Cloud-E2E gegen Frankfurt gruen, Demo-Workflow mit synthetischen Daten laeuft, produktive Hosting-/RAG-/Compliance-Claims nur mit Beleg.

## Current State
- Implemented: Next.js-16-Web-App, FastAPI/LangGraph-Agent, Supabase-Migrationen `0001`-`0055`, WEG/Personen/Eigentuemerschaft, Versammlung/TOP/Beschluss/Vote/Protokoll, Beschluss-Sammlung, Audit-Konsole, Finance Lifecycle, Vorgangszentrale-Grundlage, Settings- und Advisor-Hardening.
- Partially implemented: RAG-Retrieval ist bewusst Scaffold und liefert `[]`; Agent-Write-Header, vollstaendige Frist-/HITL-/Eval-Pipeline, Langfuse/RAGAS-Gates, Audit-Cold-Storage-Export und produktive Betriebsautomation sind offen.
- Not verified: produktives Hosting fuer Web/Agent, GitHub-CI nach den E2E-Fixes, echte Verwalter-Nutzerakzeptanz, produktive Datenschutz-/AVV-/Subprocessor-Artefakte, produktive RAG-Datenpipeline.
- Last stopping point: Cloud-Validation-Gate am 2026-06-29 abgeschlossen: `supabase migration list --workdir infra` zeigte Local=Remote `0001`-`0055`; voller `just e2e` gegen Frankfurt lief gruen mit `63 passed / 11 skipped`.

## Reality Findings
- Local evidence: `README.md`, `PROJECT.md`, `PROJECT_CONTEXT.md`, `WORKFLOW.md`, `TESTING.md`, `SECURITY.md`, `TEST_INFRA.md`, `docs/01-06`, `apps/web`, `apps/agent`, `infra/supabase`.
- Local checks: `./scripts/verify.sh` gruen mit Node `v22.12.0`: ESLint/Ruff gruen, TypeScript/Mypy gruen, Web Vitest `153 passed`, Agent pytest `73 passed / 5 skipped`, Next build gruen, `git diff --check` gruen. Ein erster Verify-Versuch mit Node `18.12.1` scheiterte nur am Next-Node-Minimum.
- Cloud checks: Read-only Supabase-Migrationsabgleich ist driftfrei (`0001`-`0055` lokal und remote). Cloud-E2E gegen Frankfurt ist gruen: `just e2e` mit `63 passed / 11 skipped`; die Skips betreffen dokumentierte Sollstellung-/Korrektur-/History-Cases, nicht heimliche Failures.
- External sources: WEG §§ 23-25 bestaetigen virtuelle Versammlung, Textform-Umlaufbeschluss, Einladungs-/Niederschrifts-/Beschluss-Sammlungs- und Stimmrechtsanforderungen; Supabase-Doku bestaetigt RLS-Pflicht fuer exposed `public` schema; Next-Doku bestaetigt Node >=20.9.
- Best-practice implications: Die Projektinvarianten RLS, DB-Trigger, append-only Audit/Beschluss und KI-nur-Vorschlag passen zum Problem und sind jetzt auch cloudnah validiert. Der naechste Wert entsteht durch Demo-Freeze, CI/Hosting-Beleg und klares Claim-Management, nicht durch weitere Featurebreite.
- Key uncertainty: Ob ein echter Verwalter den demonstrierten Kernworkflow als ausreichend klar und wertvoll erkennt; produktive Betriebs- und Compliance-Artefakte sind weiterhin nicht belegt.

## Gaps And Risks
- Missing essentials: Demo-Daten/Scenario einfrieren, GitHub-CI/Hosting-Beleg schaffen oder Hosting-Claims weglassen, die 11 geskippten E2E-Cases bewusst priorisieren oder als Nicht-Scope dokumentieren, RAG aus MVP-Claims heraushalten.
- Luftschloss/drift warnings: Weitere KI-, RAG-, Automations- oder Cold-Storage-Destructive-Features waeren Drift, solange Demo, CI/Hosting und Nutzerfeedback nicht belegt sind.
- Risks: Remote-only DB macht weitere Validierung freigabepflichtig und erzeugt Testdaten im Cloud-E2E-Tenant; alte Audit-Legacy-Fenster bleiben forensisch eingeschraenkt; produktive Compliance-Claims brauchen AVV/TOM/Subprocessor/AI-Act-Artefakte.

## Next Logical Step
1. Step: Demo-/Portfolio-Schnitt einfrieren: genau einen belegten Kernworkflow dokumentieren und zeigen (`WEG -> Einheit/Person/Eigentuemerschaft -> Versammlung -> TOP -> Beschluss/Vote ueber ownership_id -> Feststellung -> Beschluss-Sammlung`).
   Why: Dieser Workflow ist jetzt cloudnah gruen und trifft das reale Kernproblem besser als weitere Breite.
   Validation: Demo-Run mit synthetischen Daten, Screenshot-/Screencast-Check, keine Claims zu Hosting/RAG/Produktionsbetrieb ohne Beleg.
   Stop/continue rule: Wenn der Demo-Run holpert oder Claims nicht belegbar sind, zuerst Demo/Claim korrigieren. Wenn er sauber ist, CI/Hosting-Beleg oder Nutzerfeedback als naechstes Gate.

## Do Not Build Yet
- Keine RAG-Produktivbehauptung vor Embedding-Pipeline, Eval-Dataset und RAGAS/Langfuse-Gate.
- Keine destruktive Audit-Cold-Storage-Funktion vor privilegiertem Export, Manifest und HMAC-Verify-Job.
- Keine weiteren Agent-Automationen, bevor der Kern-Demoablauf cloud-verifiziert ist.
- Keine produktiven Hosting- oder Compliance-Claims ohne Deployment-, AVV-, TOM-, Subprocessor- und Betriebscheck-Belege.

## Source Links
- WEG §23: https://www.gesetze-im-internet.de/woeigg/__23.html
- WEG §24: https://www.gesetze-im-internet.de/woeigg/__24.html
- WEG §25: https://www.gesetze-im-internet.de/woeigg/__25.html
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Next.js Installation: https://nextjs.org/docs/app/getting-started/installation
