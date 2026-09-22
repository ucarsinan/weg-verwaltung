# PROJECT_REALITY

Last audit: 2026-09-22 (zweiter Durchgang: Betriebsmodell)
Recommendation: continue
Confidence: medium — der lokale Codestand ist belegt (`0001`-`0067`, 15 gruene
pgTAP-Vertraege im CI-Gate, `./scripts/verify.sh` gruen am 2026-09-20). Gesunken
gegenueber dem letzten Audit ist die Sicherheit ueber die **Cloud**: `0061`-`0067`
wurden am 2026-09-20 ausgerollt, aber `supabase migration list --linked` lief
seither nicht. Der Cloud-Stand ist damit plausibel, nicht belegt.

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
- Implemented: Next.js-16-Web-App, FastAPI/LangGraph-Agent, Migrationen `0001`-`0067`
  lokal, RLS-/Audit-/Agent-Guardrails, WEG/Einheiten/Personen/Eigentuemerschaft,
  Versammlung/TOP/Beschluss/Vote/Protokoll, Beschluss-Sammlung, Vorgangszentrale,
  Audit-Konsole und die Self-Managed-SaaS-Foundation (30-Tage-Trial, Registrierung,
  Onboarding-Wizard, Einladung per Link inkl. Annahmeseite).
  **Die Pflichtkette aus § 28 WEG ist seit dem 2026-09-20 im Datenmodell vollstaendig:**
  Wirtschaftsplan mit positionsgenauer Verteilung (`0060`), Zahlungseingaenge und
  offene Posten (`0061`), Ausgaben und Erhaltungsruecklage (`0062`), Jahresabrechnung
  mit Abrechnungsspitze nach § 28 Abs. 2 WEG (`0063`), Vermoegensbericht zum 31.12.
  nach § 28 Abs. 4 WEG (`0065`) und gemischte Verteilungsschluessel mit erzwungenem
  HeizkostenV-Korridor (`0067`). `0064` schliesst eine NULL-Falle in zwei
  Writer-Guards, `0066` macht einen Abrechnungsentwurf wieder loeschbar (die
  Kaskaden-Falle aus `0063`). Jede dieser Migrationen hat einen eigenen
  pgTAP-Vertrag im CI-Gate; die Finance-Liste umfasst neun Vertraege. Sieben
  E2E-Specs decken den Finanzbereich browser-gefuehrt ab (`finanzen`, `-positionen`,
  `-zahlungen`, `-ausgaben`, `-abrechnung`, `-vermoegensbericht`,
  `-gemischter-schluessel`). Seit 2026-09-20 existiert ausserdem eine TOM-Liste nach
  Art. 32 DSGVO mit Nachweis je Massnahme (`docs/09-tom-art32.md`), und die
  Landing-/Preisseite behauptet nur noch, was das Produkt kann (PR #20).
  **Seit 2026-09-22 ist die Mandantentrennung katalogweit zugesichert:**
  `infra/supabase/tests/0000_rls_katalog.sql` prueft fixture-frei ueber `pg_class`
  und `pg_policy`, dass jede Tabelle in `public` RLS und FORCE RLS traegt, dass jede
  Nicht-Partition mindestens eine Policy hat und dass im Schema `private` keine
  Tabelle liegt. Gemessen: 63 von 63 Tabellen (inkl. der beiden partitionierten
  Elterntabellen, die der urspruengliche Vorschlag uebersehen haette). Der Vertrag
  wurde gegen einen echten Verstoss geprueft — eine Probetabelle ohne RLS laesst drei
  der fuenf Zusicherungen fallen. Das CI-Gate umfasst damit 16 Vertraege mit 324
  Zusicherungen.
- Partially implemented: Der Finanzbereich rechnet, aber er bucht nicht — kein
  Bankabgleich, kein Mahnwesen, keine Dokumentenablage. Das ist bewusst und steht
  so auf der Landingpage. `0001_rls_negative.sql` sieht wie ein RLS-Test aus, ist aber
  vollstaendig auskommentiert und in keinem Rezept verdrahtet; ebenso
  `0039_sollstellung_option_b.sql`. Der SaaS-Slice hat
  weiterhin keinen Billing-Adapter; der Mailversand laeuft im Resend-Sandbox-Modus.
  RAG liefert bewusst `[]`; produktive Agent-Checkpoints und LLMOps-Gates fehlen.
- Not verified: **Der Cloud-Migrationsstand.** `0061`-`0067` wurden am 2026-09-20 per
  `just db-migrate` ausgerollt; seither lief kein `supabase migration list --linked`.
  Der Abgleich ist freigabepflichtig und sollte vor der naechsten produktionsnahen
  Aussage laufen. Ebenfalls nicht belegt: die Zahlen des letzten vollstaendigen
  E2E-Laufs (einzelne Specs liefen gezielt, ein dokumentierter Gesamtlauf fehlt seit
  dem 2026-09-19), produktives Web-/Agent-Hosting, Backup/Restore und
  Incident-Runbook, AVV und Art.-30-Verzeichnis, Support/SLA, Pricing-Akzeptanz.
  Advisors zeigen unveraendert 7x `auth_rls_initplan`-WARN und 1x `duplicate_index`-WARN
  (im `AGENTS.md`-Backlog). In der Frankfurt-Cloud liegen seit dem 2026-09-21 bewusst
  stehengelassene Demo-Daten.
- Betriebsmodell: Am 2026-09-22 wurde entschieden, den Betrieb vor dem ersten
  Kundenvertrag auf EU-Anbieter umzustellen — der in `02-architecture-deployment.md`
  vorgesehene Ausloeser („ab erstem Vertrag") wurde vorgezogen. Entschieden:
  zwei Supabase-Projekte (Demo + Entwicklung), Free-Tarif bleibt **unter der
  Bedingung, dass keine echten Eigentuemerdaten hineinkommen**, KI-Dienst wird
  vorerst nicht ausgeliefert, Massstab ist „Daten in der EU". Empfohlen und
  offen: Web-App auf Scaleway (Paris), Datenbank bei Elestio (Irland) auf
  EU-Infrastruktur. Zwoelf Anbieter geprueft, drei Fragen an Elestio offen.
  Vollstaendig: `docs/11-betriebsmodell.md`.
- Last stopping point: Elf Produktcode-Commits zwischen dem 2026-09-19 und dem
  2026-09-20 (PRs #9 bis #21) haben die Finanzkette fertiggestellt, ohne dass diese
  Datei nachgezogen wurde — die Frische-Pruefung meldete am 2026-09-22 folgerichtig
  `STALE` mit 11 undokumentierten Commits bei Schwelle 8. Gleichzeitig nannte
  `AGENTS.md` weiterhin Stand `0060`. Dieser Refresh schliesst den Rueckstand und ist
  der Anlass fuer die neue globale Dokumentationspflicht: betroffene `.md`-Dateien
  gehoeren in denselben Commit wie die Aenderung. Zuletzt gemerged: PR #22
  (TOM-Liste, Squash `68b227c`). `./scripts/verify.sh` lief am 2026-09-20 komplett
  gruen (452 Vitest-Tests in 58 Dateien, 0 Lint-Fehler, Build sauber).

## Reality Findings
- Local evidence: Das System ist ein technisch ernstzunehmendes Portfolio-Produkt mit starkem Sicherheitskern, aber noch kein kaufbares SaaS-Angebot. Im Repo wurden keine operativen Artefakte fuer Pricing/Billing, Pilot-Onboarding, Support, AVV/TOM, Subprozessoren, Backup/Restore oder produktives Deployment gefunden.
- External sources: § 28 WEG verlangt Wirtschaftsplan, Jahresabrechnung und Vermoegensbericht. Etablierte Produkte vermarkten zusaetzlich Ruecklagen, Buchhaltung/Zahlungsabgleich, Mahnwesen, Dokumente, Kommunikation/Portal, Vorgangsbearbeitung, Reporting und Onboarding/Support. Die BfDI stellt ein AVV-Muster mit TOM-Anhang bereit; der BSI-Cloud-Mindeststandard betont Informationssicherheit, Transparenz und Nachweise.
- Best-practice implications: Nicht als vollstaendige „WEG-Verwaltungssoftware“ launchen. Zuerst als klarer Pilot fuer den belegten Versammlungs-/Beschlussworkflow positionieren oder den Produktscope bewusst bis zur kaufbaren Full-Suite erweitern. Beide Wege gleichzeitig sind zu breit.
- Key uncertainty: Ob professionelle Verwalter den engen Workflow als dringlich und differenzierend genug bewerten, um Pilotzeit oder Budget zu geben.

## Gaps And Risks
- Missing essentials: **Verfuegbarkeit und Wiederherstellbarkeit.** Gemessen am
  2026-09-22: das Projekt laeuft auf dem Supabase-Free-Plan, und der enthaelt laut
  Supabase-Doku **keine** automatischen Backups — weder taeglich noch PITR. Fiele
  die Datenbank heute aus, waere der Bestand weg. Konzept, Exportskript
  (`scripts/db-dump.sh`) und ein lokaler Wiederherstellungs-Drill liegen seit dem
  2026-09-22 in `docs/10-backup-und-wiederherstellung.md`; offen sind die
  Plan-Entscheidung, RPO/RTO, ein Export gegen die Cloud und ein Drill dagegen.
  **Befund aus dem Drill:** ein logischer Restore holt die Daten zurueck, aber
  nicht die Verifizierbarkeit der Audit-Kette — `audit_verify_chain()` meldete
  danach `row_hash_mismatch`, weil der `audit_hmac_key` je Umgebung neu erzeugt
  wird (dokumentiert im Kopf von `0017`). Art. 32 Abs. 1 lit. b und c sind damit
  weiterhin nicht erfuellt; das ist die groesste einzelne Luecke vor dem ersten
  zahlenden Kunden. Weiter offen: AVV und Art.-30-Verzeichnis (die TOM-Anlage
  existiert jetzt), Billing-Adapter, verifizierter Mailabsender, Monitoring und
  Alarmierung, Meldeprozess nach Art. 33, Loeschkonzept. Die katalogweite
  RLS-Zusicherung ist seit 2026-09-22 geschlossen.
- Luftschloss/drift warnings: Die Heizkosten-Luecke ist mit `0067` geschlossen, damit
  entfaellt der bisher groesste fachliche Vorwand fuer neue Breite. Der naechste
  Drift waere, weitere Fachfunktionen zu bauen, bevor das Backup-Regime steht. „KI-First" bleibt kein tragfaehiger Kaufgrund, solange kein messbarer
  Zeit-/Fehlervorteil im Kernworkflow belegt ist.
- Risks: Ein nicht verifizierter Cloud-Stand ist ein stiller Risikoposten — die
  Anwendung laeuft gegen Frankfurt, und die Annahme „Cloud = lokal" ist genau die
  Annahme, die `0045`/`0058`/`0059` schon einmal widerlegt haben (siehe Memory
  „Cloud Schema Drift"). Ein Full-Suite-Claim erzeugt falsche Erwartungen. Echter
  Zahlungsverkehr oder Rechtsberatung wuerden Produkt- und Compliance-Grenzen
  wesentlich erweitern.

## Next Logical Step

Erledigt am 2026-09-22: Die Portabilitaet ist hergestellt und belegt —
`apps/web/Dockerfile` (gebaut, gestartet, HTTP 200), `output: "standalone"` mit
`outputFileTracingRoot` und der JWT-Hook in `infra/supabase/config.toml`.
Entscheidung 6 (Datenbank-Betreiber) ist bewusst **vertagt**, mit vier
definierten Ausloesern: `docs/11-betriebsmodell.md` § 11.3.

1. Step: Zweites Supabase-Projekt fuer Entwicklung anlegen und `dev-web` sowie
   die Browsertests darauf umstellen.
   Why: Heute laeuft Entwicklung gegen dieselbe Datenbank, die spaeter
   Kundendaten tragen soll. Das ist unabhaengig von jeder Anbieterfrage zu
   beheben, kostet nichts (zwei Free-Projekte sind erlaubt) und nimmt das
   groesste vermeidbare Risiko aus dem Alltag.
   Validation: `just e2e` laeuft gegen das Dev-Projekt, die Demo-Datenbank
   bleibt unberuehrt.
2. Step: Backup-Frage entscheiden, sobald echte Daten anstehen — Ausloeser A in
   `docs/11-betriebsmodell.md` § 11.3.2. Bis dahin gilt die Regel in `AGENTS.md`:
   keine echten Eigentuemerdaten in die Cloud-Datenbank.
   Why: Der Free-Tarif hat kein Backup. Das ist vertretbar, solange nur
   Demo-Daten drin sind, und nur dann.
3. Step: Cloud-Migrationsstand per `supabase migration list --linked` abgleichen
   (freigabepflichtig) und einen vollstaendigen `just e2e`-Lauf dokumentieren.
   Der letzte belegte Gesamtlauf stammt vom 2026-09-19.
4. Step: Das leere Forward-Fenster von `audit_verify_chain()` untersuchen, bevor
   eine naechtliche Kettenpruefung eingerichtet wird — offen aus dem
   Backup-Drill (`docs/10-...` § 10.6).
5. Bei Ausloeser A–D: die drei Fragen an Elestio (§ 11.5), dann Umzug.
   `scripts/db-migrate-guard.sh` ist dabei auf `--db-url` umzustellen.
6. Danach organisatorisch: AVV, Art.-30-Verzeichnis (dafuer die
   Unterauftragsverarbeiter-Liste von Supabase besorgen), Meldeprozess nach
   Art. 33, Loeschkonzept.

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
