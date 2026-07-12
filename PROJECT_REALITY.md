# PROJECT_REALITY

Last audit: 2026-07-11
Recommendation: continue
Confidence: high

## Core Problem
- Problem: Selbstverwaltete WEGs brauchen einen sicheren, einfachen Online-Ort fuer Eigentuemer, Dokumente, Vorgaenge, Versammlungen, Beschluesse und Abstimmungen, ohne Installation oder Expertenwissen.
- Affected user: Selbstverwaltete deutsche WEGs mit 3 bis 20 Einheiten; spaeter auch Wohnungsgesellschaften und professionelle Verwalter, aber nicht im ersten Angebot.
- Painful current workflow: Verteilte Dokumente, manuelle Abstimmung und unklare Verantwortlichkeiten erzeugen Aufwand und Konflikte; die vorhandenen Profi-Systeme sind fuer kleine WEGs oft zu komplex.
- Desired real-world outcome: Eine reine Online-SaaS mit Eigentuemerkonten, mehreren Admins, gefuehrtem Onboarding und 30-taegiger Testphase.
- Success criteria: Ein Nutzer kann ohne Hilfe eine WEG anlegen, Eigentuemer einladen und den ersten gemeinsamen Workflow abschliessen; die WEG bleibt tenant-isoliert und die Produktgrenzen bleiben ehrlich.

## Current State
- Implemented: Next.js-16-Web-App, FastAPI/LangGraph-Agent, Migrationen `0001`-`0056`, RLS-/Audit-/Agent-Guardrails, WEG/Einheiten/Personen/Eigentuemerschaft, Versammlung/TOP/Beschluss/Vote/Protokoll, Beschluss-Sammlung, Vorgangszentrale, Audit-Konsole und Finance-Allocation-Foundation.
- Partially implemented: Finanzbereich deckt Wirtschaftsplan/Sollstellung/Verteilung als Foundation ab, aber keine belegte vollstaendige Jahresabrechnung, Ruecklagenverwaltung, Vermoegensbericht, Zahlungsabgleich oder Mahnwesen. RAG liefert bewusst `[]`; produktive Agent-Checkpoints, LLMOps-Gates und Betriebsautomation fehlen.
- Not verified: Aktueller Cloud-Migrationsstand nach `0056`, vollstaendig aktualisierter Cloud-E2E-Lauf, produktives Web-/Agent-Hosting, Backup/Restore und Incident-Runbook, AVV/TOM/Subprozessoren, Support/SLA, Onboarding/Datenimport, Pricing/Zahlungsbereitschaft und echte Nutzerakzeptanz.
- Last stopping point: `main` enthaelt `0056` und E2E-Haertung. `./scripts/verify.sh` war am 2026-07-11 lokal gruen: Web `163 passed`, Agent `73 passed / 5 skipped`, Lint, Typecheck und Next-Production-Build erfolgreich. Remote-Checks liefen nicht.

## Reality Findings
- Local evidence: Das System ist ein technisch ernstzunehmendes Portfolio-Produkt mit starkem Sicherheitskern, aber noch kein kaufbares SaaS-Angebot. Im Repo wurden keine operativen Artefakte fuer Pricing/Billing, Pilot-Onboarding, Support, AVV/TOM, Subprozessoren, Backup/Restore oder produktives Deployment gefunden.
- External sources: § 28 WEG verlangt Wirtschaftsplan, Jahresabrechnung und Vermoegensbericht. Etablierte Produkte vermarkten zusaetzlich Ruecklagen, Buchhaltung/Zahlungsabgleich, Mahnwesen, Dokumente, Kommunikation/Portal, Vorgangsbearbeitung, Reporting und Onboarding/Support. Die BfDI stellt ein AVV-Muster mit TOM-Anhang bereit; der BSI-Cloud-Mindeststandard betont Informationssicherheit, Transparenz und Nachweise.
- Best-practice implications: Nicht als vollstaendige „WEG-Verwaltungssoftware“ launchen. Zuerst als klarer Pilot fuer den belegten Versammlungs-/Beschlussworkflow positionieren oder den Produktscope bewusst bis zur kaufbaren Full-Suite erweitern. Beide Wege gleichzeitig sind zu breit.
- Key uncertainty: Ob professionelle Verwalter den engen Workflow als dringlich und differenzierend genug bewerten, um Pilotzeit oder Budget zu geben.

## Gaps And Risks
- Missing essentials: Oeffentliche Kaufseite, Selbstservice-Registrierung, WEG-Onboarding, Einladungen, Rollenverwaltung, Trial-/Abo-Zustand und Billing-Adapter; produktiver Betrieb mit Monitoring, Backup/Restore, Incident-Prozess und Support; AVV/TOM/Subprozessor-Register und belastbare Datenschutz-/Claim-Pruefung.
- Luftschloss/drift warnings: Weitere RAG-, Agent-, Cold-Storage-, Bank- oder Full-Finance-Features vor dem einfachen Selbstverwaltungs-Onboarding waeren Drift. „KI-First“ ist kein tragfaehiger Kaufgrund, solange kein messbarer Zeit-/Fehlervorteil im Kernworkflow belegt ist.
- Risks: Ein Full-Suite-Claim erzeugt falsche Erwartungen. Remote-only Cloud-State und Legacy-Audit-Fenster begrenzen Produktionsclaims. Echter Zahlungsverkehr oder Rechtsberatung wuerden die Produkt- und Compliance-Grenzen wesentlich erweitern.

## Next Logical Step
1. Step: Das freigegebene Selbstverwalter-SaaS-Slice umsetzen: Kaufseite, Registrierung, WEG-Wizard, Einladungen, mehrere Admins sowie Trial-/Abo-Guard.
   Why: Die Produktentscheidung ist konkret und nutzt die vorhandenen Tenant-, Rollen-, Audit- und Versammlungsfundamente.
   Validation: Lokale Sicherheits-, Unit- und UI-Checks; Cloud-E2E erst mit expliziter Freigabe.
   Stop/continue rule: Bei jeder RLS-, Audit- oder Rolleninkonsistenz zuerst den Sicherheitsvertrag reparieren. Echte Abrechnung, Bank und Live-Billing bleiben ausserhalb dieses Slices.

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
