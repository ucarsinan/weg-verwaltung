# WEG-Verwaltung Worker Map

Diese Datei ist die dauerhafte Quelle fuer die Worker-Zuordnung in Agentenaufgaben.
Die Rollen `Planner`, `Implementer` und `Reviewer` beschreiben die Arbeitsweise.
Die Worker beschreiben den fachlichen Verantwortungsbereich.

## Worker A: RLS, Audit, HMAC, Migrationen

Verantwortung:

- `infra/supabase/migrations/*`
- `infra/supabase/tests/*`
- `infra/supabase/ci/*`
- `docs/03-security-model.md`
- `SECURITY.md`

Erwartetes Ergebnis:

- Tenant-Isolation bleibt hart.
- Audit und Beschluss-Sammlung bleiben append-only.
- HMAC-/Audit-Chain-Logik bleibt nachvollziehbar.
- Migrationen haben Zweck, Risiko, RLS-Auswirkung und Teststrategie.

## Worker B: Web-App und Fachmodule

Verantwortung:

- `apps/web/src/*`
- `apps/web/modules/*`
- Web-Tests, UI-Flows und Server Actions

Erwartetes Ergebnis:

- Server-first Next.js bleibt erhalten.
- Fachlogik bleibt in Modulen und nicht verstreut in UI-Komponenten.
- Keine sensiblen Daten in UI, Logs oder Fehlermeldungen.

## Worker C: Agent-Service, Guardrails, RAG

Verantwortung:

- `apps/agent/app/*`
- `apps/agent/tests/*`
- `docs/04-ai-architecture.md`
- Agent-Bridge im Web, falls betroffen

Erwartetes Ergebnis:

- Agent bleibt suggestion-only.
- Agent nutzt User-JWT und keine Service-Role-Credentials.
- RAG bleibt Scaffold, solange Pipeline und Eval-Gates fehlen.
- Tool-/Write-Pfade haben Guardrails und Tests.

## Worker D: Meetings, Votes, Beschluss-Sammlung

Verantwortung:

- Versammlungs-, Beschluss- und Voting-Module
- Meeting-/Resolution-Migrationen und Tests
- PDF-/Protokoll-/Beschluss-Sammlung-Flows

Erwartetes Ergebnis:

- Vote referenziert `ownership_id`, niemals `person_id` oder `user_id`.
- Beschluss-Sammlung bleibt append-only.
- Gesetzliche WEG-Anforderungen werden nicht verwässert.

## Worker E: Finance und Hausgeld

Verantwortung:

- Finance-/Wirtschaftsplan-/Hausgeld-Module
- Migrationen `0036` bis `0048` und Folgeaenderungen
- `docs/07-finance-lifecycle.md`

Erwartetes Ergebnis:

- Lifecycle-Guards bleiben wirksam.
- Sollstellungen und Recalculations bleiben kontrolliert.
- Keine unklare Mutation an zahlungsnahen Daten.

## Worker F: CI, Tooling, Projektstatus

Verantwortung:

- `.github/workflows/*`
- `justfile`
- `package.json`, `pnpm-workspace.yaml`
- `README.md`, `PROJECT.md`, `PROJECT_REALITY.md`, `TEST_INFRA.md`
- Agentic-Dokumentation unter `docs/agents`, `prompts`, `docs/agent-reports`

Erwartetes Ergebnis:

- Lokale und CI-Checks sind reproduzierbar.
- Keine dauerhaften Prozesse bleiben nach Agentenarbeit laufen.
- Reports sind entscheidungsfaehig und Git-Status ist klar.

## Pflege-Regel

Wenn neue dauerhafte Worker-Bereiche entstehen, wird diese Datei aktualisiert.
Spezifikationen duerfen zusaetzliche zeitlich begrenzte Worker definieren, muessen dann aber auf diese Map oder eine explizite Abweichung verweisen.
