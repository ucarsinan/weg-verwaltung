# Agent Reports

Diese Ablage sammelt entscheidungsfaehige Arbeitsberichte fuer groessere oder
riskante Agentenarbeiten. Massgeblich bleiben `AGENTS.md`, `WORKFLOW.md` und
`docs/agents/git-workflow.md`; diese Datei konkretisiert nur, wann und wie
Reports hier abgelegt werden.

## Wann ist ein Report Pflicht?

Ein Report ist Pflicht, wenn eine Aufgabe mindestens eine dieser Bedingungen
erfuellt:

- Sie ist groesser als eine eng begrenzte Einzeldatei-Aenderung.
- Sie betrifft Architektur, Security, Datenschutz, RLS, Audit, HMAC, Migrationen,
  CI, Deployments oder Git-Abschluss.
- Sie koordiniert mehrere Worker oder muss fremde Worktree-Aenderungen klar abgrenzen.
- Sie endet teilweise erledigt, blockiert oder mit relevanten Restrisiken.
- Der Nutzer, ein Planner oder ein Reviewer fordert ausdruecklich einen Report.

Bei sehr kleinen, rein lokalen Dokumentationskorrekturen reicht der
Abschlussbericht im Chat, solange keine der obigen Bedingungen zutrifft.

## Ablageort und Namensschema

Reports liegen unter:

```text
docs/agent-reports/
```

Das Standard-Namensschema ist:

```text
YYYY-MM-DD-worker-<worker>-<kurzer-scope>.md
```

Beispiele:

- `2026-06-29-worker-f-agentic-workflow-docs.md`
- `2026-06-29-worker-a-rls-policy-review.md`

Regeln:

- Datum ist das lokale Arbeitsdatum.
- Worker ist `a` bis `f` nach `docs/agents/worker-map.md`; bei nicht passendem
  Bereich `general` verwenden.
- Scope ist kurz, kleingeschrieben und mit Bindestrichen getrennt.
- Fuer laengere Aufgaben denselben Report fortschreiben, statt mehrere
  konkurrierende Reports anzulegen.

## Mindestinhalt

Neue Reports verwenden `docs/agent-reports/report-template.md` als Vorlage.
Mindestens enthalten sein muessen:

- Kurzfazit: erledigt, teilweise erledigt oder blockiert.
- Was bedeutet das? Eine einfache Erklaerung in 1-3 Saetzen.
- Handfester Fahrplan mit konkreten naechsten Schritten, Datei/Bereich,
  Begruendung und Freigabestatus.
- Entscheidung fuer den Nutzer: freigeben, nicht freigeben oder erst klaeren.
- Findings nur mit Status, Prioritaet, Problem, Auswirkung, naechstem Schritt
  und Begruendung.
- Erlaubte Finding-Statuswerte: `SUPPORTED`, `PARTIALLY_SUPPORTED`,
  `INSUFFICIENT_EVIDENCE`, `CONFLICTING`, `NOT_FOUND`.
- Geaenderte Dateien und bewusst nicht geaenderte Bereiche.
- Architektur- und Securitycheck, auch wenn alles mit `nein` beantwortet wird.
- Ausgefuehrte Checks oder begruendete Skips.
- Git-Status und naechste Git-Freigabe.

## Git- und Check-Angaben

Jeder Report muss Git und Checks so beschreiben, dass ein Mensch den naechsten
Schritt entscheiden kann:

- Wurde etwas gestaged? `ja/nein`
- Wurde ein Commit erstellt? `ja/nein`
- Wurde etwas gepusht? `ja/nein`
- Welche Dateien waeren fuer Staging geeignet?
- Welche Dateien wurden bewusst ausgeschlossen?
- Welche Checks wurden ausgefuehrt?
- Welche Pflichtchecks wurden nicht ausgefuehrt und warum?

Wenn nichts gepusht wurde, muss der Report wortwoertlich enthalten:

```text
Es wurde nichts gepusht.
```

Remote-/Cloud-nahe Checks wie `just e2e`, `just db-migrate`, `just seed-admin`
oder Supabase-Kommandos duerfen nur mit ausdruecklicher Freigabe laufen und
muessen dann mit Zweck, Ergebnis und Risiko dokumentiert werden.
