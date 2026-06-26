# TESTING.md

## Zentraler Check

Der verbindliche Abschlussbefehl fuer Agenten ist:

```bash
./scripts/verify.sh
```

## Standardchecks

`./scripts/verify.sh` fuehrt lokal sichere Checks aus:

- `just lint`
- `just typecheck`
- `just test`
- `just build`
- `git diff --check`
- Whitespace-/EOF-Check fuer relevante untracked Dateien

## Freigabepflichtige Checks

Diese Checks beruehren Cloud, Remote-DB oder externe Zustandsaenderung und laufen nur mit ausdruecklicher Freigabe:

- `just e2e`
- `just db-migrate`
- `just seed-admin`
- Supabase-Linked-Kommandos
- Cloud-Advisor- oder Remote-Migrationspruefungen

## Kritische Testmatrix

| Bereich | Erwartete Pruefung |
| --- | --- |
| RLS/Tenant-Isolation | negative Tests, kein Cross-Tenant-Zugriff |
| Audit/HMAC | Chain-Integritaet, Append-only, keine Delete-Pfade |
| Beschluss-Sammlung | append-only, keine Agent-Writes |
| Agent-Guardrails | JWT-Pflicht, suggestion-only, keine kritischen Writes |
| Migrationen | Zweck, RLS-Auswirkung, Rollback-/Forward-Fix-Hinweis, SQL-/pgTAP-Test |
| Finance | Lifecycle-Guards, Sollstellung, keine unkontrollierten Recalculations |
| Meetings/Votes | `ownership_id` statt `person_id`/`user_id` |
| E2E | nur nach Freigabe gegen Cloud |

## Wenn Checks nicht laufen

Der Abschlussbericht muss enthalten:

- welcher Check nicht lief
- warum er nicht lief
- welche kleinere Ersatzpruefung erfolgt ist
- welches Risiko bleibt
