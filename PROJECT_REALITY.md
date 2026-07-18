# PROJECT_REALITY

Last audit: 2026-07-18
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
- Implemented: Next.js-16-Web-App, FastAPI/LangGraph-Agent, Migrationen `0001`-`0059`, RLS-/Audit-/Agent-Guardrails, WEG/Einheiten/Personen/Eigentuemerschaft, Versammlung/TOP/Beschluss/Vote/Protokoll, Beschluss-Sammlung, Vorgangszentrale (inkl. Sidebar-Sub-Navigation), Audit-Konsole, Finance-Allocation-Foundation und Self-Managed-SaaS-Foundation: 30-Tage-Trial, `tenant_subscription`/`tenant_invitation`, Kaufseite `/preise`, Registrierung `/registrieren`, Onboarding-Wizard, Einladungs-Versand (`create_tenant_invitation` + Resend-E-Mail, best-effort) UND Einladungs-Annahme-Seite `/einladung/[token]` gegen `accept_tenant_invitation`. Settings sind in Unterseiten mit eigener Sub-Navigation aufgeteilt. Seit 2026-07-14 ist die E2E-Suite **erstmals vollstaendig browser-gefuehrt gegen die Frankfurt-Cloud gelaufen**: 76 passed / 2 skipped / 0 failed (inkl. `saas-onboarding.spec.ts` Ende-zu-Ende); dabei gefundene Fixes sind committed (Onboarding-Wizard submittete nur den letzten Schritt `d1dd032`; Resend-Sandbox wird als „nicht konfiguriert" statt als Stoerung gemeldet `ef7039e`; `registerAction` loggt Fehler statt sie zu verschlucken `d6691c8`). Die frueher als Schein-Tests markierten RLS-/Audit-Specs pruefen jetzt echte Tenant-Scopes statt `ok()||404`-Tautologien (`2968c2b`/`7fde366`/`166a962`).
- Partially implemented: Finanzbereich deckt Wirtschaftsplan/Sollstellung/Verteilung als Foundation ab, aber keine belegte vollstaendige Jahresabrechnung, Ruecklagenverwaltung, Vermoegensbericht, Zahlungsabgleich oder Mahnwesen. SaaS-Slice ist jetzt Ende-zu-Ende browser-verifiziert, hat aber weiterhin keinen Billing-Adapter; der E-Mail-Versand laeuft im Resend-Sandbox-Modus (kein verifizierter Absender — Link-Einladung funktioniert und ist E2E-belegt, direkter Mailversand nicht). RAG liefert bewusst `[]`; produktive Agent-Checkpoints, LLMOps-Gates und Betriebsautomation fehlen. Die E2E-Suite ist reihenfolgeabhaengig fragil (belegt: `finanzen` vor `cross-feature`/`scenarios` laesst 3 Tests fehlschlagen; Standardreihenfolge ist gruen — dokumentiert in `docs/agent-reports/2026-07-14-worker-general-cloud-e2e-first-run.md`).
- Not verified: Die am 2026-07-16/18 im Worktree vorbereitete Architektur-Deepening-Arbeit (Domain-Module `identity`/`versammlung`/`agent-bridge`/`action-kernel`, Agent-Runtime-Seam inkl. Fix des nie greifenden `persist_node`-JWT-Pfads, generierte `shared-types`, E2E-Fixture-Modul; siehe `docs/agent-reports/2026-07-18-worker-general-architecture-deepening.md`) ist unit-/typecheck-/build-gruen, aber **noch nicht committed und noch nicht browser-gefuehrt gegen die Cloud regressionsgeprueft**. Cloud-Migrationsstand `0001`-`0059` wurde am 2026-07-13 per read-only MCP-Check verifiziert; Advisors zeigen weiterhin 7x `auth_rls_initplan`-WARN und 1x `duplicate_index`-WARN (im `AGENTS.md`-Backlog). Produktives Web-/Agent-Hosting, Backup/Restore und Incident-Runbook, AVV/TOM/Subprozessoren, Support/SLA, Onboarding/Datenimport, Pricing/Zahlungsbereitschaft und echte Nutzerakzeptanz bleiben offen.
- Last stopping point: Branch `claude/saas-onboarding-e2e-test-uz0yy8` steht auf `f096733` (E2E-Residue-Cleanup) — `main` haengt dahinter (letzter Merge `abb2a3b`); der PR-Merge dieser E2E-Haertungsserie ist offen. Im Worktree liegt uncommitted die Architektur-Deepening-Arbeit (56 Dateien; Kurzfassung siehe „Not verified"). `./scripts/verify.sh` lief in diesem Audit lokal komplett gruen: Build, 234 Vitest-Tests, 80 Agent-Tests (mypy --strict, ruff), eslint, tsc; `just e2e` lief in diesem Audit nicht (letzter Cloud-Lauf 2026-07-14: 76/2/0).

## Reality Findings
- Local evidence: Das System ist ein technisch ernstzunehmendes Portfolio-Produkt mit starkem Sicherheitskern, aber noch kein kaufbares SaaS-Angebot. Im Repo wurden keine operativen Artefakte fuer Pricing/Billing, Pilot-Onboarding, Support, AVV/TOM, Subprozessoren, Backup/Restore oder produktives Deployment gefunden.
- External sources: § 28 WEG verlangt Wirtschaftsplan, Jahresabrechnung und Vermoegensbericht. Etablierte Produkte vermarkten zusaetzlich Ruecklagen, Buchhaltung/Zahlungsabgleich, Mahnwesen, Dokumente, Kommunikation/Portal, Vorgangsbearbeitung, Reporting und Onboarding/Support. Die BfDI stellt ein AVV-Muster mit TOM-Anhang bereit; der BSI-Cloud-Mindeststandard betont Informationssicherheit, Transparenz und Nachweise.
- Best-practice implications: Nicht als vollstaendige „WEG-Verwaltungssoftware“ launchen. Zuerst als klarer Pilot fuer den belegten Versammlungs-/Beschlussworkflow positionieren oder den Produktscope bewusst bis zur kaufbaren Full-Suite erweitern. Beide Wege gleichzeitig sind zu breit.
- Key uncertainty: Ob professionelle Verwalter den engen Workflow als dringlich und differenzierend genug bewerten, um Pilotzeit oder Budget zu geben.

## Gaps And Risks
- Missing essentials: Billing-Adapter fehlt weiterhin. E-Mail-Versand hat keinen verifizierten Absender (Resend-Sandbox) — bewusste Nutzerentscheidung, Link-Einladung traegt den Flow. Produktiver Betrieb mit Monitoring, Backup/Restore, Incident-Prozess und Support; AVV/TOM/Subprozessor-Register und belastbare Datenschutz-/Claim-Pruefung fehlen weiterhin.
- Luftschloss/drift warnings: Weitere RAG-, Agent-, Cold-Storage-, Bank- oder Full-Finance-Features vor dem einfachen Selbstverwaltungs-Onboarding waeren Drift. „KI-First“ ist kein tragfaehiger Kaufgrund, solange kein messbarer Zeit-/Fehlervorteil im Kernworkflow belegt ist.
- Risks: Ein Full-Suite-Claim erzeugt falsche Erwartungen. Remote-only Cloud-State und Legacy-Audit-Fenster begrenzen Produktionsclaims. Echter Zahlungsverkehr oder Rechtsberatung wuerden die Produkt- und Compliance-Grenzen wesentlich erweitern.

## Next Logical Step
1. Step: Die Architektur-Deepening-Arbeit committen (Freigabe erteilt/offen beim Nutzer), den E2E-Haertungs-Branch per PR nach `main` mergen und danach einen gated Cloud-E2E-Regressionslauf (`just e2e`) fahren, bevor neue Breite (Billing-Adapter, Rollen-UI) angegangen wird.
   Why: Der Worktree traegt 56 uncommittete Dateien inkl. eines Fixes am Protokoll-Statusuebergang (`persist_node` schrieb `ki_entwurf` mutmasslich nie — Unterzeichnung war blockiert); solange das weder committed noch browser-verifiziert ist, ist der Protokoll-Claim dieser Datei nur unit-belegt. `main` haengt zusaetzlich hinter dem E2E-Branch.
   Validation: `./scripts/verify.sh` (lief gruen am 2026-07-18) + nach Commit/Merge ein voller `just e2e`-Lauf in Standardreihenfolge; Ergebnis (insb. Protokoll-Sign-Flow und die umgebauten Fixture-Specs) in diese Datei zurueckschreiben.
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
