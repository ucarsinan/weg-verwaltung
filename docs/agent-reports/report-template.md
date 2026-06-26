# WEG-Verwaltung Agent Report

Datum: `<YYYY-MM-DD>`
Agent/Rolle: `<Codex/Claude/Gemini/...>`
Task: `<Kurzbeschreibung>`
Betroffener Worker-Bereich: `<laut docs/agents/worker-map.md oder nicht relevant>`

## Kurzfazit

`<1-3 Saetze: Was ist der Stand? Ist es erledigt, teilweise erledigt oder blockiert?>`

## Was bedeutet das?

`<Einfache Erklaerung fuer Menschen: Warum ist das wichtig und was heisst es praktisch?>`

## Handfester Fahrplan

| Reihenfolge | Schritt | Datei/Bereich | Warum? | Freigabe noetig? |
| --- | --- | --- | --- | --- |
| `1` | `<konkrete Aktion>` | `<Datei oder Bereich>` | `<kurze Begruendung>` | `<ja/nein>` |

## Entscheidung fuer den Nutzer

- Empfohlene Entscheidung: `<freigeben/nicht freigeben/erst klaeren>`
- Begruendung: `<kurz, konkret, ohne Fachjargon>`
- Naechste Nutzeraktion: `<z. B. Commit freigeben, Push freigeben, Rueckfrage beantworten>`

## Findings

| Status | Prioritaet | Problem | Evidenz | Auswirkung | Konkreter Schritt |
| --- | --- | --- | --- | --- | --- |
| `<SUPPORTED/PARTIALLY_SUPPORTED/INSUFFICIENT_EVIDENCE>` | `<P1/P2/P3>` | `<Was ist falsch/unklar?>` | `<Datei/Zeile oder Check>` | `<Warum relevant?>` | `<Was genau tun?>` |

## Geaenderte Dateien

- `<Datei>`: `<Aenderung>`

## Betroffene Systembereiche

- RLS/Audit/HMAC/Migrationen:
- Web-App/Fachmodule:
- Agent/Guardrails/RAG:
- Meetings/Votes/Beschluss-Sammlung:
- Finance/Hausgeld:
- CI/Tooling/Dokumentation:

## Architektur- und Securitycheck

- RLS/Tenant-Isolation beruehrt? `<ja/nein>`
- Audit/HMAC/Append-only beruehrt? `<ja/nein>`
- Migrationen beruehrt? `<ja/nein>`
- Agent-Write-Grenzen beruehrt? `<ja/nein>`
- Remote-/Cloud-Systeme beruehrt? `<ja/nein>`
- ADR oder Decision-Eintrag erforderlich? `<ja/nein>`

## Ausgefuehrte Checks

| Check | Ergebnis | Hinweis |
| --- | --- | --- |
| `<Befehl>` | `<pass/fail/skipped>` | `<Hinweis>` |

## Git-Status

- Dateien gestaged? `<ja/nein>`
- Commit erstellt? `<ja/nein>`
- Push ausgefuehrt? `<ja/nein>`
- Wenn nein: Was fehlt fuer Commit/Push? `<Freigabe/Checks/Branch/Remote/...>`
- Vorgeschlagene Stage-Dateien:
- Bewusst ausgeschlossene Dateien:
- Vorgeschlagene Commit-Message:
- Push-Ziel: `<remote/branch/nicht relevant>`

## Security-Check

- Secrets gelesen oder ausgegeben? `<ja/nein>`
- Produktive Daten beruehrt? `<ja/nein>`
- Externe Dienste kontaktiert? `<ja/nein>`
- Sensible Daten geloggt? `<ja/nein>`

## Bewusst nicht geaendert

- `<Nicht-Ziel oder abgegrenzter Bereich>`

## Risiken

| Risiko | Bedeutung | Naechster Schritt |
| --- | --- | --- |
| `<Risiko>` | `<Warum relevant?>` | `<Konkrete Aktion>` |

## Folgeaufgaben

| Prioritaet | Aufgabe | Begruendung |
| --- | --- | --- |
| `<P1/P2/P3>` | `<konkrete Aufgabe>` | `<kurz und eindeutig>` |
