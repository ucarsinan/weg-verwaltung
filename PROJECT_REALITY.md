# PROJECT_REALITY

Last audit: 2026-07-12
Recommendation: continue
Confidence: high

## Core Problem
- Problem: Selbstverwaltete WEGs brauchen einen sicheren, einfachen Online-Ort fuer Eigentuemer, Dokumente, Vorgaenge, Versammlungen, Beschluesse und Abstimmungen, ohne Installation oder Expertenwissen.
- Affected user: Selbstverwaltete deutsche WEGs mit 3 bis 20 Einheiten; spaeter auch Wohnungsgesellschaften und professionelle Verwalter, aber nicht im ersten Angebot.
- Painful current workflow: Verteilte Dokumente, manuelle Abstimmung und unklare Verantwortlichkeiten erzeugen Aufwand und Konflikte; die vorhandenen Profi-Systeme sind fuer kleine WEGs oft zu komplex.
- Desired real-world outcome: Eine reine Online-SaaS mit Eigentuemerkonten, mehreren Admins, gefuehrtem Onboarding und 30-taegiger Testphase.
- Success criteria: Ein Nutzer kann ohne Hilfe eine WEG anlegen, Eigentuemer einladen und den ersten gemeinsamen Workflow abschliessen; die WEG bleibt tenant-isoliert und die Produktgrenzen bleiben ehrlich.

## Current State
- Implemented: Next.js-16-Web-App, FastAPI/LangGraph-Agent, Migrationen `0001`-`0058`, RLS-/Audit-/Agent-Guardrails, WEG/Einheiten/Personen/Eigentuemerschaft, Versammlung/TOP/Beschluss/Vote/Protokoll, Beschluss-Sammlung, Vorgangszentrale, Audit-Konsole, Finance-Allocation-Foundation und Self-Managed-SaaS-Foundation (30-Tage-Trial, `tenant_subscription`/`tenant_invitation`, Kaufseite `/preise`, Registrierung `/registrieren`, Onboarding-Wizard).
- Partially implemented: Finanzbereich deckt Wirtschaftsplan/Sollstellung/Verteilung als Foundation ab, aber keine belegte vollstaendige Jahresabrechnung, Ruecklagenverwaltung, Vermoegensbericht, Zahlungsabgleich oder Mahnwesen. SaaS-Slice hat Registrierung/Onboarding/Trial-RPCs, aber keine Einladungs-Annahme-UI (Middleware kennt `/einladung/*` als oeffentliche Route, die Seite existiert noch nicht) und kein Billing-Adapter. RAG liefert bewusst `[]`; produktive Agent-Checkpoints, LLMOps-Gates und Betriebsautomation fehlen.
- Not verified: Browser-gefuehrter End-to-End-Walkthrough des neuen Registrierungs-/Onboarding-Flows, vollstaendig aktualisierter Cloud-E2E-Lauf (`just e2e`), produktives Web-/Agent-Hosting, Backup/Restore und Incident-Runbook, AVV/TOM/Subprozessoren, Support/SLA, Onboarding/Datenimport, Pricing/Zahlungsbereitschaft und echte Nutzerakzeptanz.
- Last stopping point: `main` enthaelt `0057`+`0058`. Migration 0057 (Self-Managed-SaaS-Foundation) deckte beim lokalen pgTAP-Test einen vorbestehenden, nicht 0057-spezifischen Bug auf: `audit_writer` konnte `vault.decrypted_secrets` nicht entschluesseln (fehlender `EXECUTE`-Grant auf `vault._crypto_aead_det_decrypt`), wodurch jeder audit-getrackte `tenant`-Write lokal fehlschlug. 0058 behebt das mit einem gezielten, exception-gewrappten Grant. Beide Migrationen sind inzwischen auf der Frankfurt-Cloud-DB angewendet und ueber `supabase migration list` (lokal=remote bis `0058`) sowie `get_advisors` (keine neue WARN/ERROR) verifiziert. `./scripts/verify.sh` war am 2026-07-12 lokal gruen: Web `170 passed`, Agent `73 passed / 5 skipped`, Lint, Typecheck und Next-Production-Build erfolgreich; pgTAP-Suiten `test-audit-db` (105), `test-saas-db` (18) und `test-finance-db` (32) ebenfalls gruen. `just e2e` gegen die neuen Routen lief in diesem Audit nicht.

## Reality Findings
- Local evidence: Das System ist ein technisch ernstzunehmendes Portfolio-Produkt mit starkem Sicherheitskern, aber noch kein kaufbares SaaS-Angebot. Im Repo wurden keine operativen Artefakte fuer Pricing/Billing, Pilot-Onboarding, Support, AVV/TOM, Subprozessoren, Backup/Restore oder produktives Deployment gefunden.
- External sources: § 28 WEG verlangt Wirtschaftsplan, Jahresabrechnung und Vermoegensbericht. Etablierte Produkte vermarkten zusaetzlich Ruecklagen, Buchhaltung/Zahlungsabgleich, Mahnwesen, Dokumente, Kommunikation/Portal, Vorgangsbearbeitung, Reporting und Onboarding/Support. Die BfDI stellt ein AVV-Muster mit TOM-Anhang bereit; der BSI-Cloud-Mindeststandard betont Informationssicherheit, Transparenz und Nachweise.
- Best-practice implications: Nicht als vollstaendige „WEG-Verwaltungssoftware“ launchen. Zuerst als klarer Pilot fuer den belegten Versammlungs-/Beschlussworkflow positionieren oder den Produktscope bewusst bis zur kaufbaren Full-Suite erweitern. Beide Wege gleichzeitig sind zu breit.
- Key uncertainty: Ob professionelle Verwalter den engen Workflow als dringlich und differenzierend genug bewerten, um Pilotzeit oder Budget zu geben.

## Gaps And Risks
- Missing essentials: Einladungs-Annahme-UI (`/einladung/*`, RPC `accept_tenant_invitation` existiert, Seite fehlt) und Billing-Adapter; die Kaufseite/Registrierung/Onboarding/Trial-Grundlage ist implementiert und pgTAP-/Cloud-verifiziert, aber noch nicht Browser-durchgeklickt. Produktiver Betrieb mit Monitoring, Backup/Restore, Incident-Prozess und Support; AVV/TOM/Subprozessor-Register und belastbare Datenschutz-/Claim-Pruefung fehlen weiterhin.
- Luftschloss/drift warnings: Weitere RAG-, Agent-, Cold-Storage-, Bank- oder Full-Finance-Features vor dem einfachen Selbstverwaltungs-Onboarding waeren Drift. „KI-First“ ist kein tragfaehiger Kaufgrund, solange kein messbarer Zeit-/Fehlervorteil im Kernworkflow belegt ist.
- Risks: Ein Full-Suite-Claim erzeugt falsche Erwartungen. Remote-only Cloud-State und Legacy-Audit-Fenster begrenzen Produktionsclaims. Echter Zahlungsverkehr oder Rechtsberatung wuerden die Produkt- und Compliance-Grenzen wesentlich erweitern.

## Next Logical Step
1. Step: Die Einladungs-Annahme-Seite (`/einladung/[token]` gegen `accept_tenant_invitation`) bauen und den kompletten Flow Kaufseite -> Registrierung -> Onboarding-Wizard -> Trial -> Einladung -> Annahme einmal Browser-gefuehrt durchklicken, bevor weitere Breite (Billing-Adapter, mehrere Admins im UI) angegangen wird.
   Why: DB-/RPC-Fundament und pgTAP-Vertraege stehen und sind Cloud-verifiziert; ohne Annahme-UI ist der Kern-Erfolgskriterium "Eigentuemer einladen" nicht abschliessbar, und Unit-/pgTAP-Gruen ist kein Beleg fuer einen funktionierenden UI-Flow.
   Validation: Browser-Walkthrough gegen die jetzt aktive Frankfurt-Cloud-DB; danach `just e2e` nur mit expliziter Freigabe.
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
