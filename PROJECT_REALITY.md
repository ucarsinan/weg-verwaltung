# PROJECT_REALITY

Last audit: 2026-07-13
Recommendation: continue
Confidence: high

Freshness ist maschinell pruefbar: `./scripts/check-project-reality-freshness.sh`
(git-only, keine Secrets) zaehlt Produktcode-Commits seit dem letzten Refresh
dieser Datei. Details: `AGENTS.md` § „PROJECT_REALITY.md aktuell halten".

## Core Problem
- Problem: Selbstverwaltete WEGs brauchen einen sicheren, einfachen Online-Ort fuer Eigentuemer, Dokumente, Vorgaenge, Versammlungen, Beschluesse und Abstimmungen, ohne Installation oder Expertenwissen.
- Affected user: Selbstverwaltete deutsche WEGs mit 3 bis 20 Einheiten; spaeter auch Wohnungsgesellschaften und professionelle Verwalter, aber nicht im ersten Angebot.
- Painful current workflow: Verteilte Dokumente, manuelle Abstimmung und unklare Verantwortlichkeiten erzeugen Aufwand und Konflikte; die vorhandenen Profi-Systeme sind fuer kleine WEGs oft zu komplex.
- Desired real-world outcome: Eine reine Online-SaaS mit Eigentuemerkonten, mehreren Admins, gefuehrtem Onboarding und 30-taegiger Testphase.
- Success criteria: Ein Nutzer kann ohne Hilfe eine WEG anlegen, Eigentuemer einladen und den ersten gemeinsamen Workflow abschliessen; die WEG bleibt tenant-isoliert und die Produktgrenzen bleiben ehrlich.

## Current State
- Implemented: Next.js-16-Web-App, FastAPI/LangGraph-Agent, Migrationen `0001`-`0059`, RLS-/Audit-/Agent-Guardrails, WEG/Einheiten/Personen/Eigentuemerschaft, Versammlung/TOP/Beschluss/Vote/Protokoll, Beschluss-Sammlung, Vorgangszentrale (inkl. Sidebar-Sub-Navigation), Audit-Konsole, Finance-Allocation-Foundation und Self-Managed-SaaS-Foundation: 30-Tage-Trial, `tenant_subscription`/`tenant_invitation`, Kaufseite `/preise`, Registrierung `/registrieren`, Onboarding-Wizard, Einladungs-Versand (`create_tenant_invitation` + Resend-E-Mail, best-effort) UND Einladungs-Annahme-Seite `/einladung/[token]` gegen `accept_tenant_invitation`. Settings sind in Unterseiten mit eigener Sub-Navigation aufgeteilt. Neu in diesem Audit: `scripts/check-project-reality-freshness.sh` plus nicht-blockierender CI-Job halten diese Datei systematisch aktuell (siehe `AGENTS.md` § „PROJECT_REALITY.md aktuell halten"), und `apps/web/e2e/saas-onboarding.spec.ts` kodiert den kompletten Kaufseite→Registrierung→Onboarding→Trial→Einladung→Annahme-Flow als wiederholbaren Playwright-Test.
- Partially implemented: Finanzbereich deckt Wirtschaftsplan/Sollstellung/Verteilung als Foundation ab, aber keine belegte vollstaendige Jahresabrechnung, Ruecklagenverwaltung, Vermoegensbericht, Zahlungsabgleich oder Mahnwesen. SaaS-Slice hat jetzt Registrierung/Onboarding/Trial/Einladung Ende-zu-Ende im Code, aber keinen Billing-Adapter und den neuen `saas-onboarding.spec.ts`-Flow noch nicht browser-verifiziert gegen die Cloud (siehe „Not verified"). RAG liefert bewusst `[]`; produktive Agent-Checkpoints, LLMOps-Gates und Betriebsautomation fehlen.
- Not verified: `apps/web/e2e/saas-onboarding.spec.ts` wurde geschrieben, gelistet (`playwright test --list`) und typecheck-/lint-sauber, aber **nie gegen die Frankfurt-Cloud-DB ausgefuehrt** — dieser Audit lief weiterhin in einer Remote-Sandbox ohne `.env.local`. Ein zeitweise verfuegbarer Supabase-MCP-Zugriff auf das reale, aktive Cloud-Projekt (`sgdlzafvhrfulwidqsno`, `ACTIVE_HEALTHY`, Frankfurt) lieferte nur Projekt-URL und Publishable-Key, nie den `SUPABASE_SERVICE_ROLE_KEY`, den `createConfirmedTestUser()` (`e2e/helpers/admin-api.ts`) fuer den Test zwingend braucht — eine strukturelle Grenze des MCP-Servers (Secret-Keys werden bewusst nicht herausgegeben), nicht nur die Freigabe-Regel. `just e2e` und `just seed-admin` bleiben daher technisch blockiert. Neu in diesem Audit per read-only Supabase-MCP-Check verifiziert: Cloud-Migrationsstand ist `0001`-`0059` und deckt sich exakt mit dem lokalen Repo (vorher unverifiziert, siehe `AGENTS.md`); Security-/Performance-Advisors zeigen keine ERROR, aber 7x `auth_rls_initplan`-WARN (RLS-Policy-Performance auf `audit_event`, `embedding`, `sollstellung`, `audit_integrity_check`, nicht vollstaendig durch 0055 abgedeckt) und 1x `duplicate_index`-WARN auf `public.tenant` — beides neu im `AGENTS.md`-Backlog dokumentiert. Produktives Web-/Agent-Hosting, Backup/Restore und Incident-Runbook, AVV/TOM/Subprozessoren, Support/SLA, Onboarding/Datenimport, Pricing/Zahlungsbereitschaft und echte Nutzerakzeptanz bleiben ebenfalls offen.
- Last stopping point: `main` enthaelt `0059`. Seit dem vorigen Audit (`0057`/`0058`, 2026-07-12) kamen dazu: Einladungs-Versand + -Annahme-UI (Migrationen `0057`/`0058` unveraendert, reiner App-Code), ein Fix fuer einen drifted Tenant-Audit-Emitter (`f34294d`), ein Fix fuer `document_version.sha256`-Speicherung (`ce023f3`), ein providerneutrales E-Mail-Modul auf Resend-Basis samt Einladungs-Mailversand (`97a97ca`/`479dad7`), sowie Settings- und Vorgaenge-Sub-Navigation im App-Shell (`059b67a`/`5c72022`/`52ac734`). Diese Datei war seit `0057`/`0058` nicht mehr aktualisiert — genau die Luecke, die die neue Freshness-Automation kuenftig sichtbar macht. `./scripts/verify.sh`-Teilchecks liefen in diesem Audit lokal gruen (Web-Typecheck, -Lint, 200 Vitest-Tests); Agent-/pgTAP-/Build-Checks und `just e2e` liefen in diesem Audit nicht.

## Reality Findings
- Local evidence: Das System ist ein technisch ernstzunehmendes Portfolio-Produkt mit starkem Sicherheitskern, aber noch kein kaufbares SaaS-Angebot. Im Repo wurden keine operativen Artefakte fuer Pricing/Billing, Pilot-Onboarding, Support, AVV/TOM, Subprozessoren, Backup/Restore oder produktives Deployment gefunden.
- External sources: § 28 WEG verlangt Wirtschaftsplan, Jahresabrechnung und Vermoegensbericht. Etablierte Produkte vermarkten zusaetzlich Ruecklagen, Buchhaltung/Zahlungsabgleich, Mahnwesen, Dokumente, Kommunikation/Portal, Vorgangsbearbeitung, Reporting und Onboarding/Support. Die BfDI stellt ein AVV-Muster mit TOM-Anhang bereit; der BSI-Cloud-Mindeststandard betont Informationssicherheit, Transparenz und Nachweise.
- Best-practice implications: Nicht als vollstaendige „WEG-Verwaltungssoftware“ launchen. Zuerst als klarer Pilot fuer den belegten Versammlungs-/Beschlussworkflow positionieren oder den Produktscope bewusst bis zur kaufbaren Full-Suite erweitern. Beide Wege gleichzeitig sind zu breit.
- Key uncertainty: Ob professionelle Verwalter den engen Workflow als dringlich und differenzierend genug bewerten, um Pilotzeit oder Budget zu geben.

## Gaps And Risks
- Missing essentials: Billing-Adapter fehlt weiterhin. Die Kaufseite/Registrierung/Onboarding/Trial/Einladungs-Versand/-Annahme-Kette ist jetzt vollstaendig im Code vorhanden, aber noch nie Browser-gefuehrt gegen die Cloud verifiziert — das vorbereitete `saas-onboarding.spec.ts` braucht dafuer eine Umgebung mit `.env.local`, insbesondere den `SUPABASE_SERVICE_ROLE_KEY`; ein read-only Supabase-MCP-Zugriff (verfuegbar in diesem Audit) liefert nur Projekt-URL und Publishable-Key, nie den Secret-Key. Produktiver Betrieb mit Monitoring, Backup/Restore, Incident-Prozess und Support; AVV/TOM/Subprozessor-Register und belastbare Datenschutz-/Claim-Pruefung fehlen weiterhin.
- Luftschloss/drift warnings: Weitere RAG-, Agent-, Cold-Storage-, Bank- oder Full-Finance-Features vor dem einfachen Selbstverwaltungs-Onboarding waeren Drift. „KI-First“ ist kein tragfaehiger Kaufgrund, solange kein messbarer Zeit-/Fehlervorteil im Kernworkflow belegt ist.
- Risks: Ein Full-Suite-Claim erzeugt falsche Erwartungen. Remote-only Cloud-State und Legacy-Audit-Fenster begrenzen Produktionsclaims. Echter Zahlungsverkehr oder Rechtsberatung wuerden die Produkt- und Compliance-Grenzen wesentlich erweitern.

## Next Logical Step
1. Step: `apps/web/e2e/saas-onboarding.spec.ts` (Kaufseite -> Registrierung -> Onboarding-Wizard -> Trial -> Einladung senden -> Einladung annehmen) in einer Umgebung mit echten Frankfurt-Cloud-Credentials ausfuehren (`just e2e` oder gezielt diese Spec), bevor weitere Breite (Billing-Adapter, mehrere Admins im UI) angegangen wird.
   Why: Der Flow ist jetzt vollstaendig im Code vorhanden und lokal typecheck-/lint-/list-sauber, aber noch nie gegen echtes Cloud-Verhalten (RLS, RPC-Grants, Middleware-Redirects, Resend-Versand) gelaufen; Unit-Gruen und ein syntaktisch gueltiges Playwright-Spec sind kein Beleg fuer einen funktionierenden UI-Flow.
   Validation: `just e2e` (oder `pnpm --filter @weg-verwaltung/web exec playwright test saas-onboarding`) nur mit expliziter Freigabe und in einer Umgebung mit vollstaendiger `.env.local` (inkl. `SUPABASE_SERVICE_ROLE_KEY` — ein Supabase-MCP-Zugriff allein reicht nicht, siehe „Gaps And Risks"); danach Ergebnis (inkl. evtl. Locator-/Timing-Fixes) in diese Datei zurueckschreiben.
   Stop/continue rule: Bei jeder RLS-, Audit- oder Rolleninkonsistenz zuerst den Sicherheitsvertrag reparieren. Echte Abrechnung, Bank und Live-Billing bleiben weiterhin ausserhalb dieses Slices.

## Do Not Build Yet
- Keine produktive RAG-Pipeline oder weitere Agent-Automation vor dem einfachen Selbstverwaltungs-Onboarding.
- Keine komplette Buchhaltungs-Suite auf Verdacht; zuerst den Selbstverwaltungs-Slice verifizieren.
- Keine destruktive Audit-Cold-Storage-Funktion vor Export-, Manifest- und HMAC-Verify-Prozess.
- Keine „produktionsreif“, „DSGVO-konform“, „rechtssicher“ oder Full-WEG-Suite-Claims ohne juristische und operative Belege.

## Source Links
- WEG § 28: https://www.gesetze-im-internet.de/woeigg/__28.html
- Immoware24 WEG-Funktionsumfang: https://www.immoware24.de/funktionen/weg-verwaltung/
- etg24 fuer Verwaltungen: https://etg24.de/fuer-verwaltungen/
- BfDI AVV-Muster: https://www.bfdi.bund.de/SharedDocs/Downloads/DE/Muster/Muster_zur_Auftragsverarbeitung.pdf?__blob=publicationFile&v=2
- BSI Mindeststandard externe Cloud-Dienste: https://www.bsi.bund.de/DE/Themen/Oeffentliche-Verwaltung/Mindeststandards/Externe_Cloud-Dienste/Externe_Cloud-Dienste.html
