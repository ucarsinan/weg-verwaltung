# PROJECT_REALITY

Last audit: 2026-07-13 (Finance-Positionen-Nachtrag)
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
- Implemented: Next.js-16-Web-App, FastAPI/LangGraph-Agent, Migrationen `0001`-`0060`, RLS-/Audit-/Agent-Guardrails, WEG/Einheiten/Personen/Eigentuemerschaft, Versammlung/TOP/Beschluss/Vote/Protokoll, Beschluss-Sammlung, Vorgangszentrale (inkl. Sidebar-Sub-Navigation), Audit-Konsole und Self-Managed-SaaS-Foundation: 30-Tage-Trial, `tenant_subscription`/`tenant_invitation`, Kaufseite `/preise`, Registrierung `/registrieren`, Onboarding-Wizard, Einladungs-Versand (`create_tenant_invitation` + Resend-E-Mail, best-effort) UND Einladungs-Annahme-Seite `/einladung/[token]` gegen `accept_tenant_invitation`. Settings sind in Unterseiten mit eigener Sub-Navigation aufgeteilt. `scripts/check-project-reality-freshness.sh` plus nicht-blockierender CI-Job halten diese Datei systematisch aktuell (siehe `AGENTS.md` § „PROJECT_REALITY.md aktuell halten"). `apps/web/e2e/saas-onboarding.spec.ts` kodiert den kompletten Kaufseite→Registrierung→Onboarding→Trial→Einladung→Annahme-Flow als wiederholbaren Playwright-Test. Neu in diesem Nachtrag: Finance-Allocation ist jetzt an den Sollstellung-Generator angebunden (`0060_wirtschaftsplan_position_allocation.sql`) — Wirtschaftsplan-Positionen mit Verteilungsschluessel (MEA/Einheit/Flaeche/Verbrauch/Manuell) werden bei Aktivierung statt der reinen MEA-Berechnung verwendet, inkl. UI unter `/wegs/[id]/finanzen/verteilungsschluessel` und `/wegs/[id]/finanzen/[planId]/positionen`.
- Partially implemented: Finanzbereich hat jetzt eine funktionierende, aber auf fuenf Schluessel-Typen begrenzte Positions-Verteilung; `typ = 'gemischt'` (z. B. Heizkosten 70/30) lehnt der Generator bewusst mit Fehler ab, weil das bestehende `parameter`-JSON-Schema aus `0056` keine eindeutige Zuordnung von Basiswerten zu einzelnen Teilen erlaubt (siehe `docs/08-finance-domain-model.md`). Keine belegte vollstaendige Jahresabrechnung, Ruecklagenverwaltung, Vermoegensbericht, Zahlungsabgleich oder Mahnwesen. SaaS-Slice hat Registrierung/Onboarding/Trial/Einladung Ende-zu-Ende im Code, aber keinen Billing-Adapter und den `saas-onboarding.spec.ts`-Flow noch nicht browser-verifiziert gegen die Cloud (siehe „Not verified"). RAG liefert bewusst `[]`; produktive Agent-Checkpoints, LLMOps-Gates und Betriebsautomation fehlen.
- Not verified: `apps/web/e2e/saas-onboarding.spec.ts` und der neue pgTAP-Vertrag `infra/supabase/tests/0060_wirtschaftsplan_position_allocation.sql` wurden **nie gegen eine echte Datenbank ausgefuehrt** — diese Sandbox hat weder `.env.local`/Supabase-Cloud-Credentials noch einen laufenden Docker-Daemon (`docker ps` schlaegt fehl, kein systemd, `supabase` CLI nicht installiert), sodass weder `just e2e`/`just seed-admin` (Cloud) noch `just test-finance-db` (lokale ephemere DB) hier lauffaehig sind. Migration 0060 wurde stattdessen durch sorgfaeltige manuelle SQL-Pruefung plus Vitest-Text-Pattern-Tests abgesichert; der pgTAP-Test lief aber real in GitHub Actions mit, sobald gepusht (siehe CI-Status im PR). Migrationsstand `0060` gegen Cloud, produktives Web-/Agent-Hosting, Backup/Restore und Incident-Runbook, AVV/TOM/Subprozessoren, Support/SLA, Onboarding/Datenimport, Pricing/Zahlungsbereitschaft und echte Nutzerakzeptanz bleiben offen.
- Last stopping point: Dieser Nachtrag fuegte Migration `0060` plus UI/Tests fuer die 0056-Verteilungsschluessel-Foundation hinzu (siehe `docs/08-finance-domain-model.md` § „Generator-Anbindung (0060)"). `./scripts/verify.sh`-Teilchecks liefen lokal gruen: Web-Typecheck, -Lint, 224 Vitest-Tests (16 neu), `next build` erfolgreich mit allen neuen Routen. `just test-finance-db`, Agent-Tests und `just e2e` liefen in diesem Audit nicht (siehe „Not verified").

## Reality Findings
- Local evidence: Das System ist ein technisch ernstzunehmendes Portfolio-Produkt mit starkem Sicherheitskern, aber noch kein kaufbares SaaS-Angebot. Im Repo wurden keine operativen Artefakte fuer Pricing/Billing, Pilot-Onboarding, Support, AVV/TOM, Subprozessoren, Backup/Restore oder produktives Deployment gefunden.
- External sources: § 28 WEG verlangt Wirtschaftsplan, Jahresabrechnung und Vermoegensbericht. Etablierte Produkte vermarkten zusaetzlich Ruecklagen, Buchhaltung/Zahlungsabgleich, Mahnwesen, Dokumente, Kommunikation/Portal, Vorgangsbearbeitung, Reporting und Onboarding/Support. Die BfDI stellt ein AVV-Muster mit TOM-Anhang bereit; der BSI-Cloud-Mindeststandard betont Informationssicherheit, Transparenz und Nachweise.
- Best-practice implications: Nicht als vollstaendige „WEG-Verwaltungssoftware“ launchen. Zuerst als klarer Pilot fuer den belegten Versammlungs-/Beschlussworkflow positionieren oder den Produktscope bewusst bis zur kaufbaren Full-Suite erweitern. Beide Wege gleichzeitig sind zu breit.
- Key uncertainty: Ob professionelle Verwalter den engen Workflow als dringlich und differenzierend genug bewerten, um Pilotzeit oder Budget zu geben.

## Gaps And Risks
- Missing essentials: Billing-Adapter fehlt weiterhin. Die Kaufseite/Registrierung/Onboarding/Trial/Einladungs-Versand/-Annahme-Kette ist jetzt vollstaendig im Code vorhanden, aber noch nie Browser-gefuehrt gegen die Cloud verifiziert — das vorbereitete `saas-onboarding.spec.ts` braucht dafuer eine Umgebung mit echten Frankfurt-Cloud-Credentials (`.env.local`), die in dieser Audit-Sandbox fehlen. Produktiver Betrieb mit Monitoring, Backup/Restore, Incident-Prozess und Support; AVV/TOM/Subprozessor-Register und belastbare Datenschutz-/Claim-Pruefung fehlen weiterhin.
- Luftschloss/drift warnings: Weitere RAG-, Agent-, Cold-Storage-, Bank- oder Full-Finance-Features vor dem einfachen Selbstverwaltungs-Onboarding waeren Drift. „KI-First“ ist kein tragfaehiger Kaufgrund, solange kein messbarer Zeit-/Fehlervorteil im Kernworkflow belegt ist.
- Risks: Ein Full-Suite-Claim erzeugt falsche Erwartungen. Remote-only Cloud-State und Legacy-Audit-Fenster begrenzen Produktionsclaims. Echter Zahlungsverkehr oder Rechtsberatung wuerden die Produkt- und Compliance-Grenzen wesentlich erweitern.

## Next Logical Step
1. Step: In einer Umgebung mit echten Frankfurt-Cloud-Credentials UND laufendem Docker zuerst `just test-finance-db` (Migration `0060`, lokal-ephemer, kein `--linked`) und danach `apps/web/e2e/saas-onboarding.spec.ts` (Kaufseite -> Registrierung -> Onboarding -> Trial -> Einladung -> Annahme) ausfuehren, bevor weitere Breite (Billing-Adapter, `gemischt`-Verteilungsschluessel, Forderungen/Zahlungen) angegangen wird.
   Why: Beide Kern-Artefakte dieses Nachtrags sind vollstaendig im Code vorhanden und lokal typecheck-/lint-/list-sauber, aber diese Sandbox hat weder Docker noch Cloud-Credentials, also nie real gegen eine Datenbank verifiziert worden. Migration 0060 aendert den Sollstellung-Generator, der eine Incident-Historie hat (0039-0048) — bevor darauf weitergebaut wird, muss der pgTAP-Vertrag real gruen sein, nicht nur von Hand geprueft.
   Validation: `just test-finance-db` und `just e2e` nur mit expliziter Freigabe, in einer Umgebung mit Docker bzw. `.env.local`. Der 0060-pgTAP-Test laeuft bereits automatisch im CI-Job `db-regression` (kein `--linked`, kein Freigabe-Bedarf) — dessen Ergebnis pruefen, bevor ein lokaler Lauf noetig ist.
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
