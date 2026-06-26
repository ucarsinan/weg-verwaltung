# WEG-Verwaltung Agentenprompts

Diese Prompts sind wiederverwendbare Rollen fuer kontrollierte Agentenarbeit.
Sie ersetzen `AGENTS.md` nicht. Jeder Agent muss zuerst `AGENTS.md` lesen; die dortige Pflichtdokumentliste ist verbindlich.

## Rollen

| Rolle | Datei | Aufgabe |
| --- | --- | --- |
| Planner | `planner-agent.md` | Ziel, Nicht-Ziele, Risiken, betroffene Bereiche und Pruefstrategie klaeren |
| Implementer | `implementer-agent.md` | freigegebene, kleine Aenderungen umsetzen und Checks ausfuehren |
| Reviewer | `reviewer-agent.md` | Aenderungen gegen Architektur, Security, Tests und Edge Cases pruefen |

## Worker-Zuordnung

Die Rollen koennen auf jeden Worker-Bereich angewendet werden.
Massgebliche Quelle ist `docs/agents/worker-map.md`.

## Git-Abschluss

Commit, Push und PR-Vorbereitung folgen `docs/agents/git-workflow.md`.
Agenten duerfen Git-Aktionen vorbereiten, aber nicht ohne ausdrueckliche Freigabe committen oder pushen.

## Report

Bei mittleren oder riskanten Aufgaben muss ein Bericht nach `docs/agent-reports/report-template.md` erstellt werden.
