# WEG-Verwaltung Agent Report

Datum: `2026-07-19`
Agent/Rolle: `Claude (Fable 5)`
Task: `E2E-Spec-Setups auf das Fixture-Modul umstellen + just codegen-Drift-Check in CI`
Betroffener Worker-Bereich: `nicht relevant`

## Kurzfazit

Erledigt (statisch verifiziert). Alle Specs mit reinem UI-Klick-Setup bauen
ihre Vorbedingungen jetzt über den REST-Seam in
`apps/web/e2e/helpers/fixtures.ts` auf; das UI wird nur noch im eigentlichen
Testgegenstand bedient. Zusätzlich prüft ein neuer CI-Job `codegen-drift`,
dass `packages/shared-types` nicht hinter dem Agent-OpenAPI-Kontrakt
zurückfällt. `./scripts/verify.sh` läuft vollständig grün (Lint 0 Fehler,
tsc + mypy, 234 Web-Tests, 80 Agent-Tests, Build). Der einzige ungeprüfte
Pfad ist der Browser-Lauf gegen die Cloud — `just e2e` bleibt gated.

## Was bedeutet das?

Ein Label-Rename in einem Anlage-Formular bricht künftig nur noch den Test,
dessen Gegenstand dieses Formular ist — nicht mehr das Setup von einem
Dutzend fremder Specs. Zusätzlich sinkt die Laufzeit der Cloud-Suite spürbar,
weil Vorbedingungen (WEG → Einheit → Eigentümer → Versammlung → TOP →
Beschluss, Wirtschaftsplan → Aktivierung) als REST-Aufrufe statt als
Formular-Klickstrecken entstehen. Der neue CI-Job verhindert, dass generierte
Typen still veralten, wenn sich der FastAPI-Kontrakt ändert.

## Handfester Fahrplan

| Reihenfolge | Schritt | Datei/Bereich | Warum? | Freigabe noetig? |
| --- | --- | --- | --- | --- |
| 1 | Commit der Änderungen freigeben | 8 Dateien (siehe unten) | verify.sh grün, Arbeitsstand sichern | ja |
| 2 | Einen gated Cloud-E2E-Lauf (`just e2e`) freigeben | apps/web/e2e/ | Fixture-Migration ist nur statisch geprüft, nicht browser-geprüft | ja |
| 3 | PR nach `main` + CI beobachten (neuer `codegen-drift`-Job) | .github/workflows/ci.yml | erster Live-Lauf des Jobs beweist ihn | ja |
| 4 | Resend-Domain verifizieren (nur falls echter Mailversand gewünscht) | Resend-Dashboard + lokale Secrets | bewusste Nutzerentscheidung, siehe Findings | ja (extern) |

## Entscheidung fuer den Nutzer

- Empfohlene Entscheidung: freigeben (Commit), danach Schritt 2 (E2E-Lauf) separat freigeben.
- Begruendung: Netto −91 Zeilen bei identischer Testabdeckung; alle
  Pflichtchecks grün. Das Restrisiko (Browser-Verhalten der umgebauten
  Setups) deckt genau der gated E2E-Lauf ab.
- Naechste Nutzeraktion: Commit-Freigabe erteilen; entscheiden, ob direkt
  danach ein Cloud-E2E-Lauf erfolgen soll.

## Findings

| Status | Prioritaet | Problem | Evidenz | Auswirkung | Konkreter Schritt | Begruendung |
| --- | --- | --- | --- | --- | --- | --- |
| SUPPORTED | P2 | 6 Spec-Dateien bauten Vorbedingungen über UI-Klickstrecken auf (eigene `createTestWeg`/`createTestUnit`/`createWirtschaftsplan`-Kopien in finanzen/scenarios/cross-feature; Formular-Setup in versammlungen/personen/wegs) | alte Fassungen der Specs; Fixture-Modul-Header beschreibt das Ziel-Muster | Label-Renames brachen fremde Specs; lange, Cloud-lastige Läufe | erledigt: Setups auf `helpers/fixtures.ts` migriert; redundante REST-Lookups (Plan-/Unit-ID per Query) entfernt, IDs kommen jetzt direkt aus den Fixtures | ein Owner für Domänen-Setup statt 3 divergierender Helfer-Kopien |
| SUPPORTED | P2 | `just codegen` hatte kein CI-Gate — vergessener Codegen ⇒ stille Typ-Drift zwischen FastAPI-Kontrakt und `packages/shared-types` | Risiko-Tabelle im Report 2026-07-18 | veraltete generierte Typen kompilieren weiter, bis der Kontrakt real bricht | erledigt: CI-Job `codegen-drift` (uv + pnpm + just, dann `git status --porcelain packages/shared-types`) | serverloser Codegen macht den Check sekundenschnell und secret-frei |
| SUPPORTED | P3 | Resend-Versand läuft im Sandbox-Modus (`onboarding@resend.dev` stellt nur an den Kontoinhaber zu); echter Mailversand braucht eine verifizierte Domain | apps/web/src/modules/saas/email.ts (SANDBOX_SENDER_DOMAIN, DEV_FALLBACK_FROM) | Einladungs-Mails an Dritte werden als `disabled` degradiert; Link-Einladung trägt aktuell | Nutzerentscheidung: Domain im Resend-Dashboard verifizieren (Domains → Add Domain → DKIM/SPF-DNS-Records setzen), dann `EMAIL_FROM=<name>@<verifizierte-domain>` + `RESEND_API_KEY` in der lokalen Secret-Konfiguration setzen | Code ist fertig und degradiert sauber; der fehlende Schritt ist rein extern (DNS + Dashboard) |
| SUPPORTED | P3 | PROJECT_REALITY-Freshness: frisch | verify-Lauf: 1 Produktcode-Commit seit be129cb, Schwelle 8 | keine — nächster größerer Task startet ohne STALE-Warnung | keiner | bestätigt die Annahme aus dem Auftrag |

## Geaenderte Dateien

- `apps/web/e2e/helpers/fixtures.ts`: +3 Fixtures — `createWirtschaftsplanFixture`, `activateWirtschaftsplanFixture` (RPC-Seam, identisch zur Server Action), `createProtocolFixture` (zieht den Inline-REST-Insert aus versammlungen ein)
- `apps/web/e2e/versammlungen.spec.ts`: Tests 2–6 bauen Meeting/TOP/Einheit/Eigentümer/Beschluss/Protokoll über Fixtures auf; Happy-Path-Test (UI-Anlage-Kette) bewusst unverändert
- `apps/web/e2e/finanzen.spec.ts`: `createTestWeg`/`createTestUnit` delegieren an Fixtures; Setup-Pläne + Aktivierungen über Fixtures; UI-Pfad bleibt in `finanz-submit-plan` (Formular) und `sollstellung-generate-on-activate` (Aktivierung = Testgegenstand)
- `apps/web/e2e/scenarios.spec.ts`: UI-Helfer-Kopien entfernt; audit-trail + correction auf Fixtures; die zwei Onboarding-Szenarien bleiben volle UI-Flows (Testgegenstand)
- `apps/web/e2e/cross-feature.spec.ts`: Helfer delegieren an Fixtures; Plan-/Unit-ID-Lookups entfernt
- `apps/web/e2e/personen.spec.ts`: Einheiten-/Personen-Setup über Fixtures + Direktnavigation zur Eigentümerschafts-Seite; Personen-Formular-Tests unverändert
- `apps/web/e2e/wegs.spec.ts`: Lösch-Sperre-Test (Ownership) mit Fixture-Setup; CRUD-Kettentest unverändert
- `.github/workflows/ci.yml`: neuer Job `codegen-drift`

## Betroffene Systembereiche

- RLS/Audit/HMAC/Migrationen: nein (Fixtures laufen als authenticated Tenant-Admin durch bestehende RLS)
- Web-App/Fachmodule: nein (nur E2E-Testcode)
- Agent/Guardrails/RAG: nein
- Meetings/Votes/Beschluss-Sammlung: nur Test-Setup; Vote-Fixtures referenzieren weiterhin `ownership_id` (Invariante 5)
- Finance/Hausgeld: nur Test-Setup; Aktivierungs-Fixture nutzt dieselbe RPC wie die Server Action
- CI/Tooling/Dokumentation: neuer CI-Job `codegen-drift`; dieser Report

## Architektur- und Securitycheck

- RLS/Tenant-Isolation beruehrt? nein (Fixtures nutzen den User-JWT, keine Service-Keys)
- Audit/HMAC/Append-only beruehrt? nein
- Migrationen beruehrt? nein
- Agent-Write-Grenzen beruehrt? nein
- Remote-/Cloud-Systeme beruehrt? nein (kein Cloud-Lauf ausgeführt)
- ADR oder Decision-Eintrag erforderlich? nein

## Ausgefuehrte Checks

| Check | Ergebnis | Hinweis |
| --- | --- | --- |
| `./scripts/verify.sh` | pass | Lint 0 Fehler (4 Altbestand-Warnings in cleanup-e2e-residue.mjs), tsc + mypy --strict, 234 Web-Tests, 80 Agent-Tests (5 skipped), Build kompiliert |
| YAML-Syntax ci.yml | pass | python3 yaml.safe_load |
| PROJECT_REALITY-Freshness | pass | 1 Produktcode-Commit seit Refresh (Schwelle 8) |
| `just e2e` | skipped | Cloud-gated, keine Freigabe — deckt das Restrisiko der Migration ab |

## Git-Status

- Dateien gestaged? nein
- Commit erstellt? nein
- Push ausgefuehrt? nein — Es wurde nichts gepusht.
- Wenn nein: Was fehlt fuer Commit/Push? Nutzerfreigabe (Git-Regeln in AGENTS.md)
- Vorgeschlagene Stage-Dateien: die 8 geänderten Dateien + dieser Report
- Bewusst ausgeschlossene Dateien: keine
- Vorgeschlagene Commit-Message: `refactor(e2e): move spec preconditions onto the REST fixture seam; ci: add codegen drift gate`
- Push-Ziel: `origin claude/saas-onboarding-e2e-test-uz0yy8` (nach Freigabe)

## Security-Check

- Secrets gelesen oder ausgegeben? nein
- Produktive Daten beruehrt? nein
- Externe Dienste kontaktiert? nein
- Sensible Daten geloggt? nein

## Bewusst nicht geaendert

- `demo.spec.ts` — UI-Klickstrecke ist der Zweck (Screencast)
- `rls.spec.ts`, `audit-cold-storage.spec.ts` — bereits REST-only
- UI-Flows, die selbst Testgegenstand sind (WEG-/Einheiten-/Personen-/Plan-Formulare, Vote-/Feststellungs-UI, Aktivierungs-Button im generate-on-activate-Test)
- `helpers/finanzen.ts` (UI-Aktivierung) — bleibt als bewusster UI-Pfad für den Aktivierungs-Test
- Resend-Konfiguration — externe Nutzerentscheidung (siehe Findings)

## Risiken

| Risiko | Bedeutung | Naechster Schritt |
| --- | --- | --- |
| Fixture-Migration ist nur statisch geprüft | REST-Inserts könnten in Einzelfällen an DB-Constraints scheitern, die das UI-Formular implizit erfüllte (z. B. Feld-Defaults) | gated `just e2e`-Lauf freigeben |
| `codegen-drift`-Job noch nie in CI gelaufen | Action-Versionen (`extractions/setup-just@v2`) oder uv-Cache könnten im ersten Lauf haken | ersten PR-Lauf beobachten; Job ist isoliert und blockiert nichts anderes |
| Direkt-Navigation statt Link-Klick in migrierten Setups | tote UI-Links würden im Setup nicht mehr auffallen | akzeptiert — Link-Coverage gehört in die Tests, deren Gegenstand die jeweilige Seite ist |

## Folgeaufgaben

| Prioritaet | Aufgabe | Begruendung |
| --- | --- | --- |
| P1 | Gated Cloud-E2E-Lauf zur Validierung der Migration | einziger ungeprüfter Pfad |
| P2 | Resend-Domain verifizieren, falls echter Mailversand gebraucht wird | bewusste Nutzerentscheidung, Code ist fertig |
| P3 | 4 eslint-Warnings in `cleanup-e2e-residue.mjs` aufräumen | Altbestand, kosmetisch |
