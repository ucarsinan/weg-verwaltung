# WORKFLOW.md

## Zweck

Diese Datei ist die operative Startseite fuer Agentenarbeit in diesem Repository.
Sie beschreibt den Ablauf. Sie ersetzt keine Sicherheits-, Test- oder Git-Regel.

Auch bei kurzen Aufgaben gilt: erst Kontext und Grenzen klaeren, dann eng
umsetzen, dann nachvollziehbar berichten.

## Quellenhierarchie

Wenn Quellen sich ueberschneiden, gilt diese Reihenfolge:

1. `AGENTS.md` - verbindliche Projektregeln, Sicherheits-Invarianten, Git- und Cloud-Grenzen.
2. `WORKFLOW.md` - operativer Ablauf fuer einzelne Agenten und Multi-Agent-Arbeit.
3. `TESTING.md` - lokale Pflichtchecks, Ersatzchecks und freigabepflichtige Cloud-nahe Checks.
4. `docs/agents/` - Worker Map, Git Workflow und Einstieg fuer Agentenrollen.
5. `prompts/` - wiederverwendbare Rollenprompts fuer Planner, Implementer und Reviewer.
6. `docs/agent-reports/` - Report Template fuer entscheidungsfaehige Abschlussberichte.

Wichtig: `AGENTS.md` ist immer die oberste lokale Projektquelle. Rollenprompts,
Reports und Worker-Zuordnungen duerfen sie nicht abschwaechen.

## Standardablauf fuer jede Aufgabe

1. `AGENTS.md` lesen.
2. Die in `AGENTS.md` genannten Pflichtdokumente lesen, wenn die Aufgabe fachlich,
   architektonisch, sicherheitsrelevant oder riskant ist.
3. `git status --short` pruefen und vorhandene fremde Arbeit respektieren.
4. Ziel und Nicht-Ziele ableiten.
5. Betroffene Dateien, Worker-Bereiche, Migrationen, RLS-Policies, Audit-Grenzen,
   Agent-Grenzen und Tests identifizieren.
6. Passende Rolle waehlen: Planner, Implementer oder Reviewer.
7. Passenden Worker-Bereich aus `docs/agents/worker-map.md` bestimmen.
8. Einen kleinen, nachvollziehbaren Plan erstellen.
9. Nur notwendige Aenderungen im freigegebenen Bereich umsetzen.
10. Checks nach `TESTING.md` ausfuehren oder begruendet auslassen.
11. Ergebnis als handfesten Fahrplan berichten.
12. Git-Abschluss nur nach `docs/agents/git-workflow.md` vorbereiten.

## Multi-Agent-Ablauf

Groessere Aufgaben werden in Rollen getrennt. Eine Person oder ein Agent kann
mehrere Rollen uebernehmen, aber die Ergebnisse muessen getrennt bleiben.

### Planner

Der Planner klaert Ziel, Nicht-Ziele, Risiken, Worker-Bereich, betroffene Dateien,
Teststrategie und Freigaben. Er implementiert nicht.

Erwarteter Handoff:

- Ziel und Nicht-Ziele.
- Betroffener Worker-Bereich nach `docs/agents/worker-map.md`.
- Freigegebener Schreibbereich.
- Sicherheits- und Datenschutzrisiken.
- Betroffene RLS-, Migration-, Audit-, Agent- oder Fachgrenzen.
- Konkreter Umsetzungsplan mit Checkstrategie.
- Offene Fragen und benoetigte Freigaben.

### Implementer

Der Implementer setzt nur den freigegebenen Slice um. Er erweitert den Scope nicht,
revertiert keine fremde Arbeit und fuehrt keine autonomen Git- oder Cloud-Aktionen aus.

Erwarteter Handoff:

- Geaenderte Dateien.
- Was wurde umgesetzt und was bewusst nicht.
- Welche Checks liefen, welche nicht und warum.
- Verbleibende Risiken.
- Naechste konkrete Schritte.
- Git-Status: staged, committed, pushed.

### Reviewer

Der Reviewer prueft Aenderungen gegen Architektur, Security, Tests, Edge Cases,
Worker-Scope und Git-/Cloud-Grenzen. Er priorisiert konkrete Findings vor
Zusammenfassung.

Erwarteter Handoff:

- Findings mit Status, Prioritaet, Problem, Auswirkung, naechstem Schritt und Begruendung.
- Entscheidungsempfehlung: freigeben, nicht freigeben oder erst klaeren.
- Pruef- und Testluecken.
- Git-Status und Push-Status.

## Worker Map

Die dauerhafte Worker-Zuordnung steht in `docs/agents/worker-map.md`.

Worker definieren Schreib- und Verantwortungsbereiche, nicht Rollen. Ein Planner,
Implementer oder Reviewer kann fuer jeden Worker-Bereich arbeiten. Wenn der Nutzer
einen exklusiven Schreibbereich nennt, ist dieser enger als die Worker Map und hat
Vorrang.

Bei paralleler Agentenarbeit gilt:

- Fremde Aenderungen nicht zuruecksetzen, nicht ueberschreiben und nicht bereinigen.
- Nur im eigenen freigegebenen Schreibbereich editieren.
- Vor Edits den relevanten lokalen Kontext lesen.
- Bei Konflikten mit fremden Aenderungen anpassen oder gezielt nachfragen.
- Abschlussberichte muessen klar sagen, welche Dateien beruehrt wurden.

## Handoff-Regeln

Jeder Handoff muss fuer den naechsten Agenten ohne Raten nutzbar sein.

Minimum:

- Aufgabe und Zielzustand.
- Nicht-Ziele und ausdrueckliche Grenzen.
- Betroffene Dateien und Worker-Bereich.
- Bereits gelesene Kontextquellen.
- Durchgefuehrte Aenderungen oder geplante Aenderungen.
- Checks, Ergebnisse und ausgelassene Checks.
- Risiken, offene Fragen und benoetigte Freigaben.
- Git-Status und ob etwas gepusht wurde.

Bei mittleren oder riskanten Aufgaben wird `docs/agent-reports/report-template.md`
verwendet.

## Git-Grenzen

Git-Aktionen sind kontrolliert, aber nicht autonom. Massgeblich ist
`docs/agents/git-workflow.md`.

Agenten duerfen ohne ausdrueckliche Freigabe:

- `git status --short` lesen.
- Relevante Diffs lesen.
- Eigene Aenderungen von fremden Aenderungen abgrenzen.
- Commit-Scope und Commit-Message vorschlagen.

Agenten duerfen nur mit ausdruecklicher Freigabe:

- Dateien stagen.
- Commits erstellen.
- Branches erstellen oder wechseln, wenn nicht separat beauftragt.
- Branches pushen.
- PRs erstellen oder aktualisieren.

Wenn nicht gepusht wurde, muss der Abschlussbericht klar sagen:

```text
Es wurde nichts gepusht.
```

## Remote- und Cloud-Grenzen

Remote- und Cloud-nahe Aktionen laufen nur mit ausdruecklicher Freigabe.

Dazu gehoeren insbesondere:

- `just db-migrate`
- `supabase db push`
- `just seed-admin`
- `just e2e`
- Supabase-Linked-Kommandos
- Cloud-Advisor- oder Remote-Migrationspruefungen
- externe Daten-, API- oder Hosting-Aktionen

Lokale Lesekommandos sind fuer Analyse und Doku-Arbeit erlaubt, solange sie keine
Secrets, JWTs, Supabase-Credentials, echten personenbezogenen Daten, produktiven
Daten oder Cloud-Zustand lesen, oeffnen, ausgeben oder in Fixtures uebernehmen.

## Checks

Der bevorzugte Abschlusscheck ist `./scripts/verify.sh`.
Details und Ersatzregeln stehen in `TESTING.md`.

Wenn der volle Check wegen Scope, Freigabe oder Parallelbetrieb nicht laeuft, muss
der Abschlussbericht sagen:

- welcher Check nicht lief.
- warum er nicht lief.
- welche kleinere Pruefung stattdessen erfolgte.
- welches Risiko bleibt.

Cloud-nahe Checks laufen nie als Ersatz ohne Freigabe.

## Rollenprompts und Reports

Wiederverwendbare Rollenprompts liegen in `prompts/`:

- `prompts/planner-agent.md`
- `prompts/implementer-agent.md`
- `prompts/reviewer-agent.md`

Die Prompts standardisieren Rollenoutputs. Sie ersetzen nicht das Lesen von
`AGENTS.md`, `WORKFLOW.md`, `TESTING.md` und der relevanten Fachdokumente.

Reports fuer groessere, riskante oder uebergaberelevante Arbeiten folgen
`docs/agent-reports/report-template.md`.

## Abschlussbericht

Jeder Abschlussbericht muss entscheidungsfaehig sein:

- Kurzfazit: erledigt, teilweise erledigt oder blockiert.
- Was bedeutet das? 1-3 einfache Saetze.
- Geaenderte Dateien.
- Handfester Fahrplan mit Datei/Bereich, Aktion, Begruendung und Freigabe-Hinweis.
- Empfohlene Entscheidung fuer den Nutzer.
- Checks und ausgelassene Checks.
- Git-Status: staged, committed, pushed, naechste Freigabe.
- Expliziter Push-Hinweis: `Es wurde nichts gepusht.`
