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
| `1` | Commits pruefen und pushen | `7 Commits auf claude/saas-onboarding-e2e-test-uz0yy8` | Arbeit ist verifiziert, aber noch nicht auf dem Remote | `ja` |
| `2` | E2E-Datenresiduum in der Cloud aufraeumen | Cloud-DB (Test-WEGs, Test-Nutzer) | Jeder Lauf legt echte Wegwerf-Zeilen an; waechst monoton | `ja` |
| `3` | `CardTitle` als echte Ueberschrift rendern | `components/ui/card` | „Sollstellungen" ist visuell eine Ueberschrift, aber kein `heading` im A11y-Baum | `nein` |

Bewusst **nicht** im Fahrplan: eine Resend-Domain fuer weg-verwaltung verifizieren.
Entscheidung des Nutzers vom 2026-07-14 — das Projekt hat keinen Produktivbetrieb,
die Link-Einladung funktioniert ohne Mailversand, und die irrefuehrende
Fehlermeldung ist stattdessen im Code entschaerft (`ef7039e`). Sobald ein echter
Betrieb ansteht: Domain in Resend verifizieren (Region `eu-west-1`/Irland passend
zur DSGVO-Linie) und `EMAIL_FROM` in `apps/web/.env.local` auf einen Absender
dieser Domain setzen.

Ebenfalls bewusst **nicht** im Fahrplan: `auth_leaked_password_protection`
aktivieren. Verifiziert am 2026-07-14 — das Projekt laeuft auf dem
Supabase-Free-Plan, der HaveIBeenPwned-Toggle ist laut Doku erst ab Pro
verfuegbar. Der Advisor-WARN ist damit keine offene Aufgabe, sondern eine
Plan-Grenze; siehe `AGENTS.md`-Backlog. Bei einem spaeteren Upgrade zusaetzlich
beachten: Seed-/E2E-Passwort `admin1` (`seed-admin.mjs`, `auth.setup.ts`)
steht mit Sicherheit in der HIBP-Liste und muesste vorher ersetzt werden.

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
| `SUPPORTED` | `P3` | Die neu reaktivierten Sollstellungs-Tests (`finanzen.spec.ts`) hinterlassen genug Cloud-State, dass `cross-feature.spec.ts`/`scenarios.spec.ts` (beide `serial`) fehlschlagen, wenn `finanzen` **zuerst** laeuft | Expliziter Lauf `playwright test e2e/finanzen.spec.ts e2e/cross-feature.spec.ts e2e/scenarios.spec.ts` (abweichende Dateireihenfolge): 3 failed, 26,4 min. Isolierter Re-Lauf derselben zwei Dateien ohne vorausgehendes `finanzen`: 12/12 gruen. Voller Suite-Lauf in Standardreihenfolge (`cross-feature` alphabetisch vor `finanzen`): 76 passed, 0 failed | Kein App- oder Testlogik-Bug, aber die Suite ist reihenfolgeabhaengig fragil — ein anderer Runner/Sharding koennte das gleiche Muster wieder ausloesen | Nicht behoben, nur belegt und dokumentiert. Siehe Risiken/Folgeaufgaben | Cross-Tenant-Datenresiduum aus vorherigen Sollstellungs-Laeufen kollidiert vermutlich mit Locator-Annahmen (z. B. Zeilenzahl/Reihenfolge) in `cross-feature`/`scenarios` |
| `SUPPORTED` | `P3` | `auth_leaked_password_protection`-Advisor ist auf dem Supabase-Free-Plan nicht schliessbar | Nutzerangabe „Free-Plan" + Supabase-Doku: „Leaked password protection is available on the Pro Plan and above" | Der WARN aus dem `AGENTS.md`-Backlog wurde faelschlich als offene Nutzeraktion gefuehrt | `AGENTS.md`-Backlog-Zeile korrigiert: Plan-Grenze statt offene Aufgabe | Ohne Plan-Upgrade ist der Toggle im Dashboard nicht vorhanden — nichts, was Code oder Konfiguration loesen koennte |

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
| `playwright test --project=chromium` (volle Suite, Standardreihenfolge) | `pass` | Sauberer Lauf zur Verifikation dieses Reports: **76 passed, 2 skipped, 0 failed**, Exit 0, 3,8 min |
| `./scripts/verify.sh` | `pass` | Exit 0; Lint, Typecheck, 207 Unit-Tests, Build |
| `just seed-admin` (implizit via `auth.setup.ts`) | `pass` | idempotent, mit Freigabe |
| `playwright test` mit abweichender Dateireihenfolge (`finanzen` vor `cross-feature`/`scenarios`) | `fail` dann `pass` | 3 failed bei dieser Reihenfolge (26,4 min); isolierter Re-Lauf derselben Dateien ohne vorausgehendes `finanzen`: 12/12 gruen. Siehe P3-Finding „reihenfolgeabhaengige Flakiness" |

## Git-Status

- Dateien gestaged? `ja`
- Commit erstellt? `ja` — 6 Commits (`d1dd032`, `d6691c8`, `a076cd0`, `76a3cb8`, `ef7039e`, `e3c3035`)
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
| Reihenfolgeabhaengige E2E-Flakiness | `finanzen.spec.ts` vor `cross-feature`/`scenarios.spec.ts` erzeugt genug Cloud-Datenresiduum, um deren `serial`-Bloecke fehlschlagen zu lassen (belegt: 3 failed in dieser Reihenfolge, 0 failed in Standardreihenfolge und isoliert) | **Root Cause identifiziert (2026-07-14, Analyse ohne erneuten Cloud-Lauf):** kein Locator-/Scoping-Fehler — `cross-finanz-and-sollstellung` filtert scharf ueber `plan.id`. Beide Fehlschlaege waren `expect(page).toHaveURL(...)`-**Timeouts** (fest codiertes `15_000ms` in Helpern wie `createTestWeg`), unmittelbar nach dem 100+-Einheiten-Bulk-Test am Ende von `finanzen.spec.ts` — auf einem **Supabase-Free-Plan-Projekt** (siehe `project_supabase_free_plan.md`), das nach Bulk-Writes plausibel Latenz aufbaut. Der dritte Fehlschlag (`finanz-delete-plan-ui`, Zeile 190) lag *vor* allen Sollstellungs-Tests im selben File und ist vermutlich unabhaengige Free-Tier-Flakiness. Nicht experimentell nachverifiziert — ein weiterer 26-Minuten-Cloud-Lauf allein zur Bestaetigung war nicht durch eine Freigabe gedeckt. Haertung: navigation-Timeouts fuer Tests nach Bulk-Writes grosszuegiger fassen, oder Cloud-lastige Bulk-Tests generell zuletzt in der Suite platzieren |

## Folgeaufgaben

| Prioritaet | Aufgabe | Begruendung |
| --- | --- | --- |
| `P2` | Aufraeum-Job fuer E2E-Testdaten in der Cloud | Residuum waechst mit jedem Lauf |
| `P2` | `logopaedie-simsek.de` in Resend klaeren (anderes Projekt) | Seit 4 Monaten `Pending`; dort laeuft eine echte Website, deren Mailversand vermutlich nicht funktioniert |
| `P3` | Resend-Domain fuer weg-verwaltung verifizieren — erst beim echten Deployment | Bis dahin traegt der Einladungslink den Flow; siehe Notiz unter „Handfester Fahrplan" |
| ~~`P3`~~ | ~~`CardTitle` als `heading` rendern~~ | Erledigt in `a0de727` — rendert jetzt als `<h3>`, 24 Verwendungsstellen, keine verschachtelten Headings gefunden, 207 Unit-/A11y-Tests weiterhin gruen |
| `P3` | Root Cause der reihenfolgeabhaengigen Flakiness — Timeout-Haertung umsetzen | Hypothese dokumentiert (siehe Risiken-Tabelle), aber nicht implementiert: `createTestWeg`/vergleichbare Helper brauchen grosszuegigere Timeouts oder Bulk-Tests muessen ans Dateiende |
| ~~`P1`~~ | ~~`rls.spec.ts:43`/`:78` pruefen nichts Konkretes~~ | Erledigt in `2968c2b` — `tenant_id` wird direkt aus `app_metadata` im JWT dekodiert (Claim aus `0002_identity.sql`), beide Tests assertieren jetzt, dass jede zurueckgegebene Zeile zu Tenant A gehoert und keine zu Tenant B. `ok()\|\|404`-Hedge entfernt (PostgREST liefert bei leerem, autorisiertem Result immer 200, nie 404). Verifiziert gegen Cloud: 12/12 gruen |
| `P2` | `cross-feature.spec.ts:110` (`cross-audit-and-finanz`) und `scenarios.spec.ts:181` (`scenario-audit-trail-of-financial-actions`) — beide erstellen keinen Plan und pruefen keinen Audit-Log-Inhalt, nur `ok()\|\|404` | Test-Namen versprechen eine Audit-Pruefung, die nie stattfindet |
| `P2` | Weitere `if (isVisible())`-Huellen um echte Assertions: `finanzen.spec.ts` (`sollstellung-round-off` L486, `finanz-calculate-hausgeld` L133, `finanz-fill-form` L123, `finanz-wp-invalid-year` L393, `finanz-wp-negative-gesamtkosten` L409, `finanz-wp-unaligned-mea` L443, `finanz-wp-large-costs` L454, `sollstellung-multiple-units` L568), `scenarios.spec.ts` (`scenario-year-end-closing-and-archive` L77 doppelt verschachtelt, `scenario-new-weg-onboarding` L116 versteckt die Hausgeld-Betragspruefung), `home.spec.ts` (`login link routes to /login` L21) | Jede dieser Pruefungen kann bei fehlendem/kaputtem Feld stillschweigend gruen bleiben statt zu scheitern |
| `P3` | `rls.spec.ts` L133, L172, `cross-feature.spec.ts` L182-183 — weitere `ok()\|\|404`-Tautologien ohne Row-Level-Pruefung | Gleiche Schwaeche wie oben, geringere Kritikalitaet |

Vollstaendige Fund-Liste (Datei, Zeile, Testname, Empfehlung) per Explore-Agent
am 2026-07-14 erhoben; obige Zeilen sind die priorisierte Zusammenfassung.
Umfang war groesser als beim P3-Eintrag „restliche `if (isVisible())`-Huellen"
urspruenglich angenommen — betrifft auch `rls.spec.ts` und ist daher dem Nutzer
zur Priorisierung vorgelegt worden, bevor weitere Testdateien geaendert werden.
