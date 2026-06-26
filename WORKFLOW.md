# WORKFLOW.md

## Ziel

Dieses Repository soll auch bei kurzen oder ungenauen Aufgaben kontrolliert bearbeitet werden.
Der Agent soll Kontext, Sicherheitsgrenzen, Tests, Git-Status und Freigaben klaeren, bevor er handelt.

## Standardablauf

1. `AGENTS.md` lesen.
2. Pflichtdokumente aus `AGENTS.md` lesen.
3. `git status --short` pruefen und vorhandene Nutzerarbeit respektieren.
4. Ziel, Nicht-Ziele, betroffene Dateien und Risiken ableiten.
5. Passende Rolle waehlen:
   - Planner fuer Analyse, Risiko, Architektur und Umsetzungsplan.
   - Implementer fuer die freigegebene Umsetzung.
   - Reviewer fuer Architektur-, Security-, Test- und Edge-Case-Review.
6. Passenden Worker-Bereich aus `docs/agents/worker-map.md` bestimmen.
7. Aenderungen eng begrenzen.
8. `./scripts/verify.sh` ausfuehren.
9. Ergebnis als handfesten Fahrplan berichten.
10. Git-Abschluss nur nach `docs/agents/git-workflow.md` vorbereiten; Commit und Push brauchen ausdrueckliche Freigabe.

## Fahrplanpflicht

Agentenberichte muessen fuer Menschen entscheidungsfaehig sein.
Das Ergebnis darf nicht nur aus technischen Findings bestehen.

Jeder groessere Plan, Review oder Abschlussbericht muss enthalten:

- Kurzfazit: erledigt, teilweise erledigt oder blockiert.
- Was bedeutet das? Eine einfache Erklaerung ohne unnoetigen Fachjargon.
- Handfester Fahrplan: nummerierte Schritte in sinnvoller Reihenfolge.
- Pro Schritt: konkrete Aktion, Datei/Bereich, kurze Begruendung und ob Freigabe noetig ist.
- Entscheidung fuer den Nutzer: freigeben, nicht freigeben oder erst klaeren.
- Git-Status: gestaged, committed, gepusht und was fuer den naechsten Git-Schritt fehlt.

Wenn nicht gepusht wurde, muss der Bericht klar sagen:

```text
Es wurde nichts gepusht.
```

## Git-Abschluss

Der Git-Abschluss ist Teil des kontrollierten Agentenprozesses, aber kein Autopilot.
Massgeblich ist `docs/agents/git-workflow.md`.

Agenten duerfen:

- Status und Diffs pruefen
- eigene Aenderungen von fremden Aenderungen abgrenzen
- Commit-Scope und Commit-Message vorschlagen
- PR-Report vorbereiten

Agenten duerfen nur mit ausdruecklicher Freigabe:

- Dateien stagen
- Commits erstellen
- Branches pushen
- PRs erstellen oder aktualisieren

## Remote-/Cloud-Grenzen

Diese Aktionen laufen nur mit ausdruecklicher Freigabe:

- `just db-migrate`
- `supabase db push`
- `just seed-admin`
- `just e2e`
- jedes Kommando gegen das verlinkte Supabase-Frankfurt-Projekt

## Rollenprompts

Die wiederverwendbaren Rollenprompts liegen in `prompts/`.
Groessere Agentenarbeiten muessen einen Report nach `docs/agent-reports/report-template.md` schreiben.
