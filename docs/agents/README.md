# Agentic Workflow Einstieg

Diese Datei ist der kompakte Einstieg fuer Agenten, die in der WEG-Verwaltung
arbeiten. Die verbindliche Regelquelle bleibt immer `AGENTS.md`.

## Startreihenfolge

1. `AGENTS.md` lesen.
2. `WORKFLOW.md` fuer den operativen Ablauf lesen.
3. `TESTING.md` fuer Pflichtchecks und freigabepflichtige Checks lesen.
4. Passenden Worker-Bereich in `docs/agents/worker-map.md` bestimmen.
5. Falls ein Git-Abschluss gewuenscht ist, `docs/agents/git-workflow.md` nutzen.
6. Fuer wiederholbare Rollenarbeit den passenden Prompt aus `prompts/` verwenden.
7. Fuer groessere oder riskante Arbeit `docs/agent-reports/report-template.md` nutzen.

## Dateien in diesem Bereich

| Datei | Zweck |
| --- | --- |
| `worker-map.md` | Dauerhafte Worker-Zuordnung und Verantwortungsbereiche. |
| `git-workflow.md` | Regeln fuer Status, Diff, Staging, Commit, Push und PR-Vorbereitung. |

## Rollenprompts

Die Rollenprompts liegen ausserhalb dieses Ordners in `prompts/`:

| Rolle | Prompt | Aufgabe |
| --- | --- | --- |
| Planner | `prompts/planner-agent.md` | Ziel, Nicht-Ziele, Risiken, Scope und Checkstrategie klaeren. |
| Implementer | `prompts/implementer-agent.md` | Freigegebenen Slice eng umsetzen und Ergebnis berichten. |
| Reviewer | `prompts/reviewer-agent.md` | Aenderung gegen Architektur, Security, Tests und Edge Cases pruefen. |

Rollen beschreiben die Arbeitsweise. Worker beschreiben den fachlichen oder
technischen Verantwortungsbereich. Beides wird kombiniert.

## Worker Map

`worker-map.md` ist massgeblich fuer dauerhafte Worker-Bereiche:

- Worker A: RLS, Audit, HMAC, Migrationen.
- Worker B: Web-App und Fachmodule.
- Worker C: Agent-Service, Guardrails, RAG.
- Worker D: Meetings, Votes, Beschluss-Sammlung.
- Worker E: Finance und Hausgeld.
- Worker F: CI, Tooling, Projektstatus und Agentic-Dokumentation.

Wenn der Nutzer einen exklusiven Schreibbereich nennt, ist dieser enger als die
Worker Map und hat Vorrang.

## Handoff und Reports

Ein Handoff muss ohne Rueckfragen nutzbar sein:

- Ziel und Nicht-Ziele.
- Betroffener Worker-Bereich.
- Freigegebener Schreibbereich.
- Gelesener Kontext.
- Geaenderte Dateien oder geplante Aenderungen.
- Checks und ausgelassene Checks.
- Risiken, offene Fragen und benoetigte Freigaben.
- Git-Status und Push-Status.

Fuer mittlere, riskante oder laenger laufende Aufgaben wird
`docs/agent-reports/report-template.md` verwendet.

## Git- und Cloud-Grenzen

Ohne ausdrueckliche Freigabe:

- nichts stagen.
- keinen Commit erstellen.
- nichts pushen.
- keine PR erstellen oder aktualisieren.
- keine Supabase-, Remote-DB-, Cloud- oder E2E-Aktion ausfuehren.

Erlaubt sind lokale Lesekommandos wie Status, Diff und Dateiansicht, solange keine
Secrets, JWTs, Supabase-Credentials, echten personenbezogenen Daten, produktiven
Daten oder Cloud-Zustaende gelesen, geoeffnet, ausgegeben oder in Fixtures
uebernommen werden.
