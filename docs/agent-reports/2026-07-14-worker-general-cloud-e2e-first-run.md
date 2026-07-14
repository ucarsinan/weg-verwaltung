# WEG-Verwaltung Agent Report

Datum: `2026-07-14`
Agent/Rolle: `Claude`
Task: `Erster browser-gefuehrter E2E-Lauf gegen Cloud Frankfurt; Triage und Behebung der Funde`
Betroffener Worker-Bereich: `general`

## Kurzfazit

Erledigt. Die E2E-Suite lief zum ersten Mal vollstaendig browser-gefuehrt gegen
das Cloud-Frankfurt-Projekt (Freigabe lag vor). Sie hat sofort einen P1-Fehler
gefunden: der Onboarding-Wizard verlor beim Absenden alle Eingaben, wodurch der
komplette Self-Service-Pfad unbenutzbar war. Der Fehler ist behoben und im
Browser verifiziert. Zusaetzlich wurde die Sollstellungs-Abdeckung
wiederhergestellt, die faktisch nicht existierte, obwohl die Suite gruen meldete.

Endstand: **76 passed, 2 skipped, 0 failed** (vorher: 67 passed, 11 skipped) und
207 Unit-Tests. `./scripts/verify.sh` laeuft mit Exit 0.

## Was bedeutet das?

Zwei Dinge, die vorher niemand sehen konnte, sind jetzt sichtbar und behoben:

1. **Der Wizard war tot.** Kein Nutzer haette ueber die Einrichtung je eine WEG
   anlegen koennen — das Formular schickte am Ende ein leeres Paket ab, und die
   App antwortete mit „Bitte pruefen Sie die markierten Angaben", als haette der
   Nutzer etwas falsch gemacht. Unit-Tests konnten das prinzipiell nicht finden,
   weil sie die Server Action direkt mit fertigen Daten aufrufen; nur ein echter
   Browser serialisiert das Formular.
2. **Die Sollstellung war ungedeckt.** Das Herz des Finanzmoduls hatte elf
   abgeschaltete Tests und drei, die zwar liefen, aber nichts pruefen konnten.
   Die Suite meldete gruen, ohne dass je eine Sollstellungs-Zeile geprueft wurde.

## Handfester Fahrplan

| Reihenfolge | Schritt | Datei/Bereich | Warum? | Freigabe noetig? |
| --- | --- | --- | --- | --- |
| `1` | Commits pruefen und pushen | `5 Commits auf claude/saas-onboarding-e2e-test-uz0yy8` | Arbeit ist verifiziert, aber noch nicht auf dem Remote | `ja` |
| `2` | `auth_leaked_password_protection` aktivieren | Supabase Studio, Auth → Settings | Offener Advisor-WARN aus dem Backlog, kein Code noetig | `ja (Nutzeraktion)` |
| `3` | E2E-Datenresiduum in der Cloud aufraeumen | Cloud-DB (Test-WEGs, Test-Nutzer) | Jeder Lauf legt echte Wegwerf-Zeilen an; waechst monoton | `ja` |
| `4` | `CardTitle` als echte Ueberschrift rendern | `components/ui/card` | „Sollstellungen" ist visuell eine Ueberschrift, aber kein `heading` im A11y-Baum | `nein` |

Bewusst **nicht** im Fahrplan: eine Resend-Domain fuer weg-verwaltung verifizieren.
Entscheidung des Nutzers vom 2026-07-14 — das Projekt hat keinen Produktivbetrieb,
die Link-Einladung funktioniert ohne Mailversand, und die irrefuehrende
Fehlermeldung ist stattdessen im Code entschaerft (`ef7039e`). Sobald ein echter
Betrieb ansteht: Domain in Resend verifizieren (Region `eu-west-1`/Irland passend
zur DSGVO-Linie) und `EMAIL_FROM` in `apps/web/.env.local` auf einen Absender
dieser Domain setzen.

## Entscheidung fuer den Nutzer

- Empfohlene Entscheidung: `freigeben`
- Begruendung: Der P1-Fix ist klein, belegt und behebt einen Totalausfall des
  Onboardings. Die Test-Aenderungen fassen keinen Produktivcode an, sondern
  bringen die Tests auf das tatsaechliche Domaenenmodell. Alles ist gegen die
  echte Cloud verifiziert.
- Naechste Nutzeraktion: Push freigeben. Die Resend-Domain ist bewusst vertagt
  (siehe Notiz im Fahrplan); offen bleiben nur Nutzeraktionen im Supabase-Studio.

## Findings

| Status | Prioritaet | Problem | Evidenz | Auswirkung | Konkreter Schritt | Begruendung |
| --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED` | `P1` | Onboarding-Wizard rendert Schritte konditional; React unmountet die Inputs, auf Schritt 4 ist die FormData leer | `onboarding-wizard.tsx:33-39`; Browser-Snapshot in `test-results/` | Kein Nutzer konnte eine WEG anlegen — Self-Service-Onboarding komplett unbenutzbar | Behoben: Schritte bleiben gemountet, inaktive per `hidden` | Ein `hidden`-Feld wird weiterhin serialisiert, ein unmountetes nicht |
| `SUPPORTED` | `P2` | Elf Finanz-Tests abgeschaltet mit abgelaufener Begruendung „Requires migrations 0039/0040" | `finanzen/cross-feature/scenarios.spec.ts`; `AGENTS.md` belegt 0001-0059 auf Cloud | Sollstellungs-Logik war ungeprueft | Behoben: reaktiviert und auf `activate_wirtschaftsplan` gehoben | Migrationen liegen laengst in der Cloud; die Tests kodierten das Modell vor 0048 |
| `SUPPORTED` | `P2` | Drei „gruene" Sollstellungs-Tests pruefen nichts (`expect(res.ok() \|\| res.status() === 404).toBe(true)`, `if (isVisible())`-Huellen) | `finanzen.spec.ts` (vor dieser Aenderung) | Falsche Sicherheit: Suite meldete gruen ohne jede Abdeckung | Behoben: echte Zeilen, Betraege und Jahres-Trennung werden assertiert | Ein Test, der nicht fehlschlagen kann, ist kein Test |
| `SUPPORTED` | `P2` | Resend laeuft im Sandbox-Modus: kein `EMAIL_FROM` gesetzt, also Absender `onboarding@resend.dev`, der nur an die Kontoadresse zustellt | Lauf-Log: `resend send failed: 403 validation_error`; Resend-Dashboard: einzige Domain `logopaedie-simsek.de`, seit 4 Monaten `Pending` | Der direkte Mail-Invite scheiterte und wurde dem Admin als **Stoerung** gemeldet, obwohl nur nichts konfiguriert ist | Entschaerft in `ef7039e`: Sandbox-Fehlschlag ergibt `disabled` statt `error`, mit eigener Meldung und Verweis auf den Einladungslink. DNS bewusst **nicht** angefasst (Nutzerentscheid) | Fuer ein Portfolio-Piece ohne Produktivbetrieb ist DNS-Aufwand unnoetig; die Link-Einladung funktioniert vollstaendig (per E2E belegt). Eine falsche Fehlermeldung ist aber auch in der Demo schaedlich |
| `SUPPORTED` | `P3` | Die Domain `logopaedie-simsek.de` steht seit 4 Monaten auf `Pending` — DNS-Records nie fertig gesetzt | Resend-Dashboard (Screenshot des Nutzers) | Betrifft ein **anderes** Projekt: dort geht vermutlich kein Mailversand raus (z. B. Kontaktformular) | Getrennt pruefen, ob `logopaedie-simsek` Mailversand braucht | Hoeherer Realitaetsbezug als der Portfolio-Mailversand — dort laeuft eine echte Website |
| `SUPPORTED` | `P3` | `registerAction` verwarf den Supabase-Fehler vollstaendig | `registrieren/actions.ts:53` (vorher) | Ursache eines fehlgeschlagenen Sign-ups war von aussen unsichtbar | Behoben: `code`/`status` werden geloggt, `message` bewusst nicht (enthaelt die Adresse) | Entspricht der Hauskonvention der anderen Server Actions |
| `SUPPORTED` | `P3` | Supabase Auth lehnt `.test`-Domains beim oeffentlichen `signUp` ab (`400 email_address_invalid`), die Admin-API akzeptiert sie | Direkte Probe gegen Cloud | Registrierungs-Erfolgsfall ist im Browser nicht sinnvoll fahrbar | Behoben: Erfolgsfall als Vitest mit gemocktem Client, Browser prueft den Validierungszweig | Jeder echte Erfolg wuerde eine Bestaetigungsmail an eine fremde Domain schicken; Auth-Mailversand ist rate-limitiert |

## Geaenderte Dateien

- `apps/web/src/app/onboarding/onboarding-wizard.tsx`: Schritte bleiben gemountet, inaktive per `hidden` (P1-Fix)
- `apps/web/src/app/registrieren/actions.ts`: Supabase-Fehler wird PII-frei geloggt
- `apps/web/src/app/registrieren/__tests__/actions.test.ts`: neu — 5 Tests fuer den Sign-up-Pfad
- `apps/web/e2e/saas-onboarding.spec.ts`: Registrierungs-Test auf den Validierungszweig umgestellt
- `apps/web/e2e/helpers/finanzen.ts`: neu — Aktivierungs-Helper fuer Wirtschaftsplaene
- `apps/web/e2e/finanzen.spec.ts`: 6 Tests reaktiviert, 3 Schein-Tests mit echten Assertions versehen
- `apps/web/e2e/cross-feature.spec.ts`: 2 Tests reaktiviert und aktiviert
- `apps/web/e2e/scenarios.spec.ts`: 1 Test reaktiviert und aktiviert
- `apps/web/src/modules/saas/email.ts`: Fehlschlag mit Sandbox-Absender ergibt `disabled` statt `error`
- `apps/web/src/modules/settings/admin/invitation-actions.ts`: eigener, nicht-alarmierender Text fuer den `disabled`-Fall
- `apps/web/src/modules/saas/__tests__/email.test.ts` + `.../admin/__tests__/invitation-actions.test.ts`: Abdeckung fuer die neue Unterscheidung

## Betroffene Systembereiche

- RLS/Audit/HMAC/Migrationen: nicht veraendert (nur gelesen)
- Web-App/Fachmodule: Onboarding-Wizard, Registrierung
- Agent/Guardrails/RAG: nicht beruehrt
- Meetings/Votes/Beschluss-Sammlung: nicht beruehrt
- Finance/Hausgeld: nur Testabdeckung, kein Produktivcode
- CI/Tooling/Dokumentation: dieser Report

## Architektur- und Securitycheck

- RLS/Tenant-Isolation beruehrt? `nein`
- Audit/HMAC/Append-only beruehrt? `nein`
- Migrationen beruehrt? `nein`
- Agent-Write-Grenzen beruehrt? `nein`
- Remote-/Cloud-Systeme beruehrt? `ja` (E2E gegen Cloud Frankfurt, mit Freigabe; erzeugt Testdaten)
- ADR oder Decision-Eintrag erforderlich? `nein`

## Ausgefuehrte Checks

| Check | Ergebnis | Hinweis |
| --- | --- | --- |
| `playwright test --project=chromium` (volle Suite) | `pass` | 76 passed, 2 skipped, 0 failed |
| `./scripts/verify.sh` | `pass` | Exit 0; Lint, Typecheck, 205 Unit-Tests, Build |
| `just seed-admin` (implizit via `auth.setup.ts`) | `pass` | idempotent, mit Freigabe |

## Git-Status

- Dateien gestaged? `ja`
- Commit erstellt? `ja` — 3 Commits
- Push ausgefuehrt? `nein`
- Wenn nein: Was fehlt fuer Commit/Push? `Freigabe des Nutzers`
- Vorgeschlagene Stage-Dateien: siehe „Geaenderte Dateien"
- Bewusst ausgeschlossene Dateien: `test-results/`, `playwright/.auth/` (Artefakte, gitignored)
- Vorgeschlagene Commit-Message: bereits vergeben — `d1dd032`, `d6691c8`, `a076cd0`
- Push-Ziel: `origin/claude/saas-onboarding-e2e-test-uz0yy8`

## Security-Check

- Secrets gelesen oder ausgegeben? `nein` — `.env.local` wurde nie gelesen; Skripte laden sie selbst, ausgegeben wurden nur Fehlercodes
- Produktive Daten beruehrt? `nein` — nur Testdaten im Cloud-Projekt
- Externe Dienste kontaktiert? `ja` — Supabase Frankfurt (mit Freigabe); Resend-Versand schlug erwartungsgemaess fehl
- Sensible Daten geloggt? `nein` — im neuen Log bewusst nur `code`/`status`, nie `error.message`

## Bewusst nicht geaendert

- Keine Migration, keine RLS-Policy, keine Audit-Logik angefasst. Die Analyse der
  Finance-Migrationen (0047) diente nur der Frage, ob ein Fehler in der App oder
  im Test liegt — sie lag im Test.
- Die beiden verbliebenen `test.skip` bleiben aus einem strukturellen Grund
  bestehen: Einheiten mit MEA 0 sind ueber die UI nicht anlegbar.
- Resend-Konfiguration nicht angefasst (Dashboard-Arbeit des Nutzers).

## Risiken

| Risiko | Bedeutung | Naechster Schritt |
| --- | --- | --- |
| E2E-Datenresiduum in der Cloud | Jeder Lauf legt echte WEGs, Plaene, Sollstellungen und Auth-Nutzer an; das waechst monoton | Aufraeum-Strategie festlegen (dokumentiertes Risiko, siehe `demo.spec.ts`) |
| Einladungsmails gehen nicht raus | Resend ohne verifizierte Domain; im E2E folgenlos, in echt nicht | Domain verifizieren |
| Wall-Clock-Artefakt bei langen Laeufen | Ein Test „dauerte" 25,4 min, weil der Rechner mitten im Lauf schlief — kein Hang | Bei langen Laeufen Schlafmodus deaktivieren |

## Folgeaufgaben

| Prioritaet | Aufgabe | Begruendung |
| --- | --- | --- |
| `P2` | Aufraeum-Job fuer E2E-Testdaten in der Cloud | Residuum waechst mit jedem Lauf |
| `P2` | `logopaedie-simsek.de` in Resend klaeren (anderes Projekt) | Seit 4 Monaten `Pending`; dort laeuft eine echte Website, deren Mailversand vermutlich nicht funktioniert |
| `P3` | Resend-Domain fuer weg-verwaltung verifizieren — erst beim echten Deployment | Bis dahin traegt der Einladungslink den Flow; siehe Notiz unter „Handfester Fahrplan" |
| `P3` | `CardTitle` als `heading` rendern | „Sollstellungen" ist visuell Ueberschrift, aber nicht im A11y-Baum — faellt jest-axe nicht auf, weil kein Verstoss, aber Screenreader-Navigation leidet |
| `P3` | Restliche `if (isVisible())`-Huellen in `finanzen.spec.ts` pruefen | Auch `finanz-fill-form`, `finanz-calculate-hausgeld` u. a. koennen still durchrutschen |
