# PROJECT_REALITY

Last audit: 2026-09-22 (zweiter Durchgang: Betriebsmodell)
Recommendation: continue
Confidence: medium — der lokale Codestand ist belegt (`0001`-`0072`, 19 gruene
pgTAP-Vertraege im CI-Gate mit 371 Zusicherungen, `./scripts/verify.sh` gruen am
2026-09-23). Die Cloud-Unsicherheit, die den 2026-09-22-Audit gegenueber seinem
Vorgaenger herabstufte, ist seit dem 2026-09-25 aufgeloest: `0068`-`0072`
wurden an diesem Tag per `just db-migrate` ausgerollt, und `supabase migration
list --linked` zeigt die `Remote`-Spalte gefuellt fuer `0067` bis `0072` (die
fruehere Ausrollung von `0061`-`0067` am 2026-09-20 eingeschlossen). Der
Cloud-Migrationsstand ist damit belegt, nicht mehr nur plausibel.

*(Migrationsspanne, Vertragszahlen und das `verify.sh`-Laufdatum am 2026-09-23
auf den tatsaechlichen Codestand korrigiert — reine Faktenwerte, kein neuer
Audit-Durchgang. Das 2026-09-23-Datum belegt nur, dass `verify.sh` an diesem
Tag gegen genau diesen Codestand gruen lief, es ist kein neues Audit-Datum.
`Recommendation`, `Confidence` und die Begruendung dahinter stammen weiterhin
vom 2026-09-22-Audit und wurden nicht neu bewertet. Dasselbe gilt fuer die
Fortschreibung auf `0072` am 2026-09-23: Migrationsspanne und Vertragszahlen
sind nachgezaehlt (`just test-db-all` → `Files=19, Tests=371`), die Bewertung
ist es nicht. Insbesondere ist `Confidence: medium` NICHT deshalb bestaetigt,
weil `0072` einen kritischen Befund geschlossen hat — dass ein solcher Befund
erst im Branch-Review auffiel, spricht eher fuer eine erneute Pruefung als
dagegen. Ebenso am 2026-09-25: der Cloud-Absatz oben ist auf den verifizierten
Rollout- und E2E-Stand nachgezogen — per `supabase migration list --linked`
und dem dokumentierten `just e2e`-Lauf belegte Faktenwerte, keine neue
Bewertung. `Confidence: medium` bleibt unveraendert; dass der Cloud-Stand jetzt
belegt statt nur plausibel ist, hebt die Einstufung nicht automatisch an — das
bliebe einem echten Audit-Durchgang vorbehalten.)*

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
- Implemented: Next.js-16-Web-App, FastAPI/LangGraph-Agent, Migrationen `0001`-`0072`
  lokal, RLS-/Audit-/Agent-Guardrails, WEG/Einheiten/Personen/Eigentuemerschaft,
  Versammlung/TOP/Beschluss/Vote/Protokoll, Beschluss-Sammlung, Vorgangszentrale,
  Audit-Konsole und die Self-Managed-SaaS-Foundation (30-Tage-Trial, Registrierung,
  Onboarding-Wizard, Einladung per Link inkl. Annahmeseite).
  **Seit 2026-09-23 gibt es eine Dokumentenablage** (`0069`-`0072`): der Verwalter
  legt Unterlagen je WEG ab, versioniert sie und sieht die geltende
  Aufbewahrungsfrist samt Herkunft — Mandantenregel oder gesetzlicher Rueckfall,
  einstellbar unter `/einstellungen/aufbewahrung`. **Kein Eigentuemerportal** und
  **kein** Erfuellungsweg fuer das Einsichtsrecht nach § 18 Abs. 4 WEG (Rechtsprechung:
  Einsicht beim Verwalter, keine Pflicht zur digitalen Uebersendung) — die Landingpage
  nennt diese Grenze jetzt ausdruecklich. `0072` schliesst zwei Befunde aus dem
  Branch-Review: das Entfernen eines Dokuments war seit `0015` strukturell
  unmoeglich (die SELECT-Policy filtert `deleted_at is null`, PostgreSQL lehnt
  deshalb jedes UPDATE ab, das `deleted_at` setzt — gemessen, ohne RETURNING),
  und der Join in `aufbewahrung_effektiv` fuehrte ohne Tenant-Praedikat fuer
  einen BYPASSRLS-Aufrufer zu einer Auffaecherung. Die SELECT-Policy bleibt
  unveraendert; der Soft-Delete laeuft jetzt ueber die RPC
  `public.dokument_entfernen`. Details: `docs/specs/2026-09-22-dokumentenablage-design.md`.
  Der zugehoerige E2E-Spec `apps/web/e2e/dokumente.spec.ts` lief am 2026-09-25
  erstmals: Test 18 (Upload), Test 19 (neue Version **und** Entfernen aus der
  Liste — der einzige Pfad, der `public.dokument_entfernen` ausuebt) und Test 20
  (eine geaenderte Aufbewahrungsregel wirkt sich auf die Liste aus) bestanden
  alle drei (siehe „Next Logical Step" fuer den vollstaendigen Lauf und sein
  Datenresiduum).
  **Die Pflichtkette aus § 28 WEG ist seit dem 2026-09-20 im Datenmodell vollstaendig:**
  Wirtschaftsplan mit positionsgenauer Verteilung (`0060`), Zahlungseingaenge und
  offene Posten (`0061`), Ausgaben und Erhaltungsruecklage (`0062`), Jahresabrechnung
  mit Abrechnungsspitze nach § 28 Abs. 2 WEG (`0063`), Vermoegensbericht zum 31.12.
  nach § 28 Abs. 4 WEG (`0065`) und gemischte Verteilungsschluessel mit erzwungenem
  HeizkostenV-Korridor (`0067`). `0064` schliesst eine NULL-Falle in zwei
  Writer-Guards, `0066` macht einen Abrechnungsentwurf wieder loeschbar (die
  Kaskaden-Falle aus `0063`). Jede dieser Migrationen hat einen eigenen
  pgTAP-Vertrag im CI-Gate; die Finance-Liste umfasst neun Vertraege. Seit
  `0068` meldet `public.audit_verify_chain()` eine ungebrochene Kette auch als
  `intact` — vorher war das wegen einer NULL-Falle in `0050` unmoeglich. Sieben
  E2E-Specs decken den Finanzbereich browser-gefuehrt ab (`finanzen`, `-positionen`,
  `-zahlungen`, `-ausgaben`, `-abrechnung`, `-vermoegensbericht`,
  `-gemischter-schluessel`). Seit 2026-09-20 existiert ausserdem eine TOM-Liste nach
  Art. 32 DSGVO mit Nachweis je Massnahme (`docs/09-tom-art32.md`), und die
  Landing-/Preisseite behauptet nur noch, was das Produkt kann (PR #20).
  **Seit 2026-09-22 ist die Mandantentrennung katalogweit zugesichert:**
  `infra/supabase/tests/0000_rls_katalog.sql` prueft fixture-frei ueber `pg_class`
  und `pg_policy`, dass jede Tabelle in `public` RLS und FORCE RLS traegt, dass jede
  Nicht-Partition mindestens eine Policy hat und dass im Schema `private` keine
  Tabelle liegt. Gemessen (Stand `0075`): 65 von
  65 Tabellen (inkl. der beiden partitionierten Elterntabellen, die der
  urspruengliche Vorschlag uebersehen haette, der `aufbewahrungsregel` aus
  `0069` und der `weg_zugang` aus `0075` — der ersten neuen Tabelle seit
  `0069`). Der Vertrag wurde
  gegen einen echten Verstoss geprueft — eine Probetabelle ohne RLS laesst drei
  der fuenf Zusicherungen fallen. Das CI-Gate umfasst damit 22 Vertraege mit 420
  Zusicherungen (`0072` brachte keinen neuen Vertrag, sondern erweiterte die
  bestehenden `0069` von 12 auf 26 und `0071` von 13 auf 15; `0073`, `0074` und
  `0075` brachten je einen).
- Partially implemented: Der Finanzbereich rechnet, aber er bucht nicht — kein
  Bankabgleich, kein Mahnwesen. Das ist bewusst und steht so auf der Landingpage;
  die Dokumentenablage ist seit 2026-09-23 keine Grenze mehr, sondern ein
  Implemented-Eintrag (oben). `0001_rls_negative.sql` sieht wie ein RLS-Test aus, ist aber
  vollstaendig auskommentiert und in keinem Rezept verdrahtet; ebenso
  `0039_sollstellung_option_b.sql`. Der SaaS-Slice hat
  weiterhin keinen Billing-Adapter; der Mailversand laeuft im Resend-Sandbox-Modus.
  RAG liefert bewusst `[]`; produktive Agent-Checkpoints und LLMOps-Gates fehlen.
- Not verified: produktives Web-/Agent-Hosting, Backup/Restore und
  Incident-Runbook, AVV und Art.-30-Verzeichnis, Support/SLA, Pricing-Akzeptanz.
  Advisors zeigen unveraendert 7x `auth_rls_initplan`-WARN und 1x `duplicate_index`-WARN
  (im `AGENTS.md`-Backlog). In der Frankfurt-Cloud liegen seit dem 2026-09-21 bewusst
  stehengelassene Demo-Daten — seit dem 2026-09-25-E2E-Lauf zusaetzlich 3 `weg`-,
  3 `document`- und 4 `document_version`-Zeilen sowie 4 Storage-Objekte in
  `weg-docs`, alle strukturell unloeschbar (append-only-Trigger plus
  `on delete restrict` auf beiden FKs, siehe „Next Logical Step").
  **Der Cloud-Migrationsstand ist seit dem 2026-09-25 verifiziert:** `0068`-`0072`
  wurden an diesem Tag per `just db-migrate` ausgerollt, und `supabase migration
  list --linked` zeigt die `Remote`-Spalte gefuellt fuer `0067` bis `0072`.
  **Der Gesamtlauf der E2E-Suite liegt jetzt vor**, in zwei Teilen wegen eines
  plattenspeicherbedingten Abbruchs: Teil 1 (`just e2e`) deckte Tests 1-83 von
  100 ab — 81 bestanden, 2 uebersprungen (`test.skip`: `finanz-wp-zero-mea`,
  `sollstellung-unit-no-mea`), 0 fehlgeschlagen —, dann brach der Prozess mit
  `ENOSPC` ab, kein Testfehler. Teil 2 (die drei restlichen Spec-Dateien direkt
  per Playwright) lief vollstaendig gruen: 19 von 19 Tests bestanden. Zusammen:
  98 bestanden, 2 uebersprungen, 0 fehlgeschlagen von 100 —
  `apps/web/e2e/dokumente.spec.ts` lief darin zum ersten Mal ueberhaupt
  (Tests 18-20, alle gruen).
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
- Risks: Der Cloud-Stand war bis zum 2026-09-25 unverifiziert; seit dem Rollout
  von `0068`-`0072` an diesem Tag ist er es nicht mehr. Die allgemeine Annahme
  „Cloud = lokal" bleibt trotzdem riskant, sobald wieder lokale Migrationen
  entstehen, die nicht sofort ausgerollt werden — `0045`/`0058`/`0059` haben
  genau diese Annahme schon einmal widerlegt (siehe Memory „Cloud Schema
  Drift"). Ein Full-Suite-Claim ist seit dem 2026-09-28 belegt: ein
  durchgehender `just e2e`-Lauf ueber 103 Tests, 101 bestanden, 2
  uebersprungen, 0 fehlgeschlagen, 7,6 Minuten, ohne Abbruch. **Der Hinweis auf
  die 2 uebersprungenen Faelle bleibt Pflicht** (`finanz-wp-zero-mea`,
  `sollstellung-unit-no-mea` tragen `test.skip`) — es sind 101 von 103, nicht
  103 von 103. Der geteilte Lauf vom 2026-09-25 ist damit historisch und nicht
  mehr die aktuelle Beleglage. Echter Zahlungsverkehr oder Rechtsberatung
  wuerden Produkt- und Compliance-Grenzen wesentlich erweitern.

## Next Logical Step

Erledigt am 2026-09-22: Die Portabilitaet ist hergestellt und belegt —
`apps/web/Dockerfile` (gebaut, gestartet, HTTP 200), `output: "standalone"` mit
`outputFileTracingRoot` und der JWT-Hook in `infra/supabase/config.toml`.
Entscheidung 6 (Datenbank-Betreiber) ist bewusst **vertagt**, mit vier
definierten Ausloesern: `docs/11-betriebsmodell.md` § 11.3.

1. Step: Weiterentwickeln. Die Betriebsfragen sind bewusst vertagt und an
   Ausloeser gebunden (`docs/11-betriebsmodell.md` § 11.3.2). Getrennte
   Umgebungen, Backup-Tarif und Betreiberwahl gehoeren zusammen und kommen
   gemeinsam mit Ausloeser A — einzeln ergeben sie keinen Sinn.
   Why: Solange nur Demo-Daten in der Datenbank liegen, ist keine dieser drei
   Massnahmen notwendig, und jede einzelne waere Aufwand gegen ein Risiko, das
   nicht existiert. Was die Lage traegt, ist die Regel in `AGENTS.md`: keine
   echten Eigentuemerdaten in die Cloud-Datenbank.
   Stop/continue rule: Sobald echte Daten anstehen, ist das Paket aus
   Umgebungstrennung, Backup und Betreiberwahl faellig — oder es bleiben
   Demo-Daten.
2. Erledigt am 2026-09-25: Der Cloud-Migrationsstand ist per `supabase
   migration list --linked` abgeglichen — die `Remote`-Spalte ist gefuellt fuer
   `0067` bis `0072` — und `0068`-`0072` sind per `just db-migrate` ausgerollt.
   Ein vollstaendiger `just e2e`-Lauf ist dokumentiert, in zwei Teilen wegen
   eines plattenspeicherbedingten Abbruchs (`ENOSPC`, kein Testfehler): Teil 1
   deckte Tests 1-83 von 100 ab (81 bestanden, 2 uebersprungen per
   `test.skip`, 0 fehlgeschlagen), Teil 2 die drei restlichen Spec-Dateien
   direkt per Playwright (19 von 19 bestanden). Zusammen 98 bestanden, 2
   uebersprungen, 0 fehlgeschlagen von 100 — der erste jemals ausgefuehrte Lauf
   von `apps/web/e2e/dokumente.spec.ts` eingeschlossen (Tests 18-20, alle
   gruen; Test 19 uebt `public.dokument_entfernen` erstmals ueber die echte
   Oberflaeche aus).
   **Das dabei entstandene Datenresiduum ist nicht mehr hypothetisch:** der Lauf
   hat 3 `weg`-, 3 `document`- und 4 `document_version`-Zeilen sowie 4 Objekte
   im Bucket `weg-docs` im Cloud-Tenant hinterlassen, keine davon entfernbar
   (append-only-Trigger plus `on delete restrict` auf beiden FKs, 0015) — und
   waechst mit jedem weiteren Lauf weiter. Details im Kopfkommentar von
   `apps/web/e2e/dokumente.spec.ts`.
3. Erledigt am 2026-09-22: Das leere Forward-Fenster von `audit_verify_chain()`
   war eine NULL-Falle in `0050`, derselben Klasse wie `0064`. `0045` pruefte
   `valid_after_seq is null or seq > valid_after_seq`; `0050` verlor den
   NULL-Zweig, und der faul angelegte Checkpoint traegt genau NULL. Behoben in
   `0068` samt pgTAP-Vertrag (6 Zusicherungen, vorher 4 rot). Eine intakte Kette
   wird jetzt als `intact` gemeldet; damit ist die naechtliche Kettenpruefung
   ueberhaupt erst sinnvoll baubar.
4. Bei Ausloeser A–D: die drei Fragen an Elestio (§ 11.5), dann Umzug.
   `scripts/db-migrate-guard.sh` ist dabei auf `--db-url` umzustellen.
5. Danach organisatorisch: AVV, Art.-30-Verzeichnis (dafuer die
   Unterauftragsverarbeiter-Liste von Supabase besorgen), Meldeprozess nach
   Art. 33, Loeschkonzept.

## Do Not Build Yet
- Keine produktive RAG-Pipeline oder weitere Agent-Automation vor dem einfachen Selbstverwaltungs-Onboarding.
- Keine komplette Buchhaltungs-Suite auf Verdacht; zuerst den Selbstverwaltungs-Slice verifizieren — **Definition und Stand siehe unten.**

### Was der Selbstverwaltungs-Slice ist

Der Begriff stand hier zweimal als Sperre, ohne je definiert zu sein. Seit dem
2026-09-28 ist er eine konkrete Reise: **Eine WEG mit sechs Einheiten kommt von
der Anlage bis zur Jahresabrechnung.** Sechs, weil § 19 Abs. 2 Nr. 6 WEG die
Verwaltung durch einen Eigentümer nur unter neun Sondereigentumsrechten
zulaesst (und nur, wenn weniger als ein Drittel einen zertifizierten Verwalter
verlangt) — das ist die reale Groesse dieses Segments.

Die Reise: WEG → Einheiten mit vollstaendigen MEA → Personen und
Eigentuemerschaften → Verteilungsschluessel → Wirtschaftsplan → **aktivieren**
→ Sollstellungen → Ausgaben → Jahresabrechnung.

**Verwalterseitig belegt.** `apps/web/e2e/selbstverwaltung.spec.ts` laeuft die
Reise und prueft persistierten Zustand: 72 Sollstellungen, Betraege exakt,
Summe gleich Gesamtkosten, Abrechnungsspitze ausgeglichen. Gruen am
2026-09-28.

**Was dabei offen blieb:** zwoelf Befunde. Vollstaendige Liste mit Fahrplan:
`docs/agent-reports/2026-09-28-selbstverwaltungs-slice-verifikation.md`.

**Die beiden Geldfehler sind seit dem 2026-09-28 behoben** (`0073`):

- **Befund 1 und 4 — unvollstaendige Miteigentumsanteile.**
  `activate_wirtschaftsplan` prueft jetzt, dass die Summe der MEA-Brueche genau
  ein Ganzes ergibt, und weist sonst mit `22023` ab, bevor eine Sollstellung
  entsteht. Geprueft wird der Bruch gegen 1, nie der Zaehler gegen 1000 — der
  Nenner ist gesetzlich nicht festgelegt. Eine WEG ohne Einheiten faellt in
  dieselbe Sperre; bisher meldete die Aktivierung dort Erfolg und erzeugte
  nichts. **Der Generator blieb unangetastet**: Normalisierung des Alt-Pfads
  liesse die erfassten Einheiten den Anteil einer fehlenden mittragen, statt
  das Datenproblem zu zeigen.
- **Befund 2 — Jahresabrechnung ohne aktivierten Plan.** Nicht gesperrt,
  sondern gekennzeichnet: Eine WEG kann ihr erstes Jahr legitim ohne Plan
  gewirtschaftet haben. Die Abrechnungsseite weist jetzt darauf hin, dass ohne
  Plan keine Soll-Vorschuesse existieren und die vollen Kosten als Nachschuss
  erscheinen. Nach § 28 Abs. 2 WEG ist die Spitze die Gegenueberstellung mit
  den Soll-Werten des **rechtsgueltigen** Wirtschaftsplans; Fehler, die sich
  auf die Spitze auswirken, sind genau die, an denen ein Beschluss kippt.

- **Befund 3 — die Sackgasse fuer mandantenlose Nutzer.** Wer angemeldet ist,
  aber keinen Mandanten hat, wird jetzt nach `/onboarding` geleitet statt im
  Dashboard auf den Entwicklersatz „Kein Mandant im aktuellen JWT-Claim." zu
  laufen. Ein fehlgeschlagenes `getClaims()` fuehrt ausdruecklich **nicht** zur
  Umleitung — sonst wuerde eine Netzstoerung oder ein nicht registrierter
  Access-Token-Hook jeden Nutzer aussperren. `/onboarding` hat dafuer einen
  Abmelden-Knopf bekommen, sonst waere der Assistent ein Raum ohne Ausgang.

**Die Wegfuehrung fuehrt seit dem 2026-09-29 zum Wirtschaftsplan** (Befunde 6, 7
und 8):

- **Befund 8 — der Wirtschaftsplan stand nicht in der Leiter.** Der „naechster
  Schritt"-Vorschlag der WEG-Seite lautete Einheiten → Personen → Versammlung
  und kannte den Plan gar nicht. Wer der App folgte, baute nie einen — die Reise
  oben war nur per Direkteingabe der Adressen erreichbar, und genau so laeuft
  der E2E-Test sie ab. Der Plan steht jetzt **vor** der Versammlung, weil nach
  § 28 Abs. 1 WEG der Verwalter ihn aufstellt und die Versammlung auf seiner
  Grundlage ueber die Vorschuesse beschliesst: erst der Beschluss begruendet die
  Zahlungspflicht, der Plan ist die Vorlage. Die Logik liegt jetzt als reine
  Funktion in `wegs/next-step.ts` und ist erstmals getestet; ein Fehler der
  Zaehlabfrage laesst den Schritt ausfallen, statt „kein Plan" zu behaupten.
- **Befund 7 — der Verteilungsschluessel war eine unsichtbare Vorbedingung.**
  Beide Formulare benannten das Fehlen, zeigten aber keinen Ausweg. Der Hinweis
  traegt jetzt den Link — und nur dann, wenn ueberhaupt kein Schluessel
  existiert.
- **Befund 6 — Aktivierungsfehler auf falscher Faehrte.** `23514` trug fuenf
  Ursachen und eine Meldung („Der Statuswechsel ist fachlich nicht erlaubt."),
  obwohl nur eine davon ein Statuswechsel ist. Die Meldungen des Generators sind
  bereits fuer Nutzer formuliert und nennen Zahlen, die nur die Datenbank kennt;
  sie werden jetzt durchgereicht statt verworfen. **Dabei eine Korrektur an
  `0073`:** die Audit-Kette wirft fuer HMAC-Ausfaelle ebenfalls `22023`, und ihre
  Trigger feuern bei jeder Aktivierung — ein kaputter Schluessel wurde als
  MEA-Problem gemeldet.

**Befund 13 — Sollstellungen ohne Beschlussgrundlage — ist seit dem 2026-09-29
datenbankseitig behoben** (`0074`). `activate_wirtschaftsplan` verlangt jetzt
einen Verweis auf einen Eintrag der Beschluss-Sammlung; ohne ihn entsteht keine
Sollstellung. Nach § 28 Abs. 1 WEG stellt der Verwalter den Plan auf, und erst
der Beschluss der Eigentuemer begruendet die Zahlungspflicht — der Plan ist die
Vorlage.

Verwiesen wird auf `beschluss_sammlung_entry`, **nicht** auf `resolution`:
`resolution.meeting_id` ist `not null` und haette den Umlaufbeschluss nach
§ 23 Abs. 3 WEG strukturell ausgeschlossen, der den Wirtschaftsplan ausdruecklich
traegt. Ebenso bewusst **nicht** geprueft wird das Beschlussdatum gegen das
Planjahr — ein Beschluss darf spaet gefasst werden, auch nach Jahresende. Die
RPC-Signatur bleibt unveraendert; der Beschluss wird am Entwurf gesetzt, nicht
beim Aktivieren uebergeben.

**Die Oberflaeche ist seit dem 2026-09-29 nachgezogen.** `0074` ist an diesem
Tag ausgerollt; der Entwurf hat ein Auswahlfeld fuer die Beschlussgrundlage,
angeboten werden nur zustimmende Beschluesse. Das Feld ist bewusst nicht
pflichtig — geplant wird, bevor die Versammlung beschliesst. Der
Aktivieren-Knopf haengt am GESPEICHERTEN Stand: eine nur ausgewaehlte Zuordnung
genuegt nicht, und der Hinweis darunter nennt den Grund samt Weg zum Erfassen.
Beides belegt `apps/web/e2e/finanzen-beschlussgrundlage.spec.ts`.

**Neu notiert — Befund 14: `anfechtungsstatus` ist toter Buchstabe.** Die Spalte
kann ihren Default nie verlassen: die Tabelle ist append-only, und die in `0005`
behauptete Projektion aus `beschluss_anfechtung_event` existiert nicht — fuer
diese Event-Kette gibt es ueberhaupt keinen Schreibpfad. Dahinter das eigentliche
Problem: Entfaellt die Grundlage, bleiben die Sollstellungen unveraendert
bestehen. `sollstellung.buchungstyp = 'korrektur'` (`0039`) ist der vorhandene,
leere Anknuepfungspunkt.

**Befund 13 ist damit abgeschlossen.** Offen bleiben fuenf der urspruenglichen
Befunde (5, 9–12) und der neue Befund 14. Von den fuenf erzeugt keiner falsches
Geld und keiner sperrt einen Nutzer aus.

**Die RLS trennt seit dem 2026-09-29 erstmals nach Rolle** (`0075`). PR #37
hatte die Rolle `eigentuemer` aus dem Dashboard ausgesperrt — das war die
Oberflaeche, nicht die Grenze: PostgREST unter `/rest/v1/*` blieb unberuehrt,
ein gueltiges Token las weiterhin alles. `public.weg_zugang` haelt jetzt
explizit fest, wer welche WEG lesen darf, erzwungen auf `weg`, `unit`,
`ownership` und der Beschluss-Sammlung.

**Bewusst nicht ueber die Eigentuemerkette.** `person.user_id` ist weder
eindeutig noch validiert, der Trial-Pfad legt gar keine Eigentuemerschaft an,
und Miteigentuemer haengen an einer anderen Tabelle — vier Befunde, alle im
Bericht. Eigentum ist eine Fachtatsache, Sichtbarkeit eine Zugriffstatsache.
`weg_zugang` startet leer; eine Oberflaeche zum Vergeben kommt mit der
Eigentuemersicht. `person` und die Finanztabellen sind ausgespart, `person`
wegen der noetigen Einschraenkung auf Spaltenebene. Bericht:
`docs/agent-reports/2026-09-29-weg-zugang-rollentrennung.md`.

**Eigentuemerseitig gesperrt statt ungeprueft (seit 2026-09-29).** Bei der
Vorbereitung dieser Entscheidung kam heraus, dass die Rolle `eigentuemer` nicht
nur unfertig, sondern offen war: Sie ist einladbar und war im Einladungsformular
**voreingestellt**, waehrend die RLS der Fachtabellen ausschliesslich nach
Mandant filtert. Ein so eingeladener Nutzer bekam das vollstaendige
Verwalter-Dashboard, lesend und schreibend, fuer alle WEGs des Mandanten.
Geschadet hat es nichts — es gibt keine echten Eigentuemer —, aber die Luecke
haette sich beim ersten echten Mandanten geschlossen. Das Dashboard weist die
Rolle jetzt nach `/kein-zugang` ab, und die Einladung bietet sie nicht mehr an.
Bericht: `docs/agent-reports/2026-09-29-eigentuemerrolle-ohne-schranke.md`.

**Eigentuemerseitig ungeprueft.** 54 der 60 Routen liegen im
Verwalter-Dashboard; die Rolle `eigentuemer` existiert im Datenmodell, im
Web-Code aber nur als Datensatz, nie als Betrachter. Ob der Slice ohne
Eigentuemer-Einblick als Produkt traegt, ist eine offene Entscheidung und
bewusst nicht Teil dieser Verifikation.
- Keine destruktive Audit-Cold-Storage-Funktion vor Export-, Manifest- und HMAC-Verify-Prozess.
- Keine „produktionsreif“, „DSGVO-konform“, „rechtssicher“ oder Full-WEG-Suite-Claims ohne juristische und operative Belege.

## Source Links
- WEG § 28: https://www.gesetze-im-internet.de/woeigg/__28.html
- Immoware24 WEG-Funktionsumfang: https://www.immoware24.de/funktionen/weg-verwaltung/
- etg24 fuer Verwaltungen: https://etg24.de/fuer-verwaltungen/
- BfDI AVV-Muster: https://www.bfdi.bund.de/SharedDocs/Downloads/DE/Muster/Muster_zur_Auftragsverarbeitung.pdf?__blob=publicationFile&v=2
- BSI Mindeststandard externe Cloud-Dienste: https://www.bsi.bund.de/DE/Themen/Oeffentliche-Verwaltung/Mindeststandards/Externe_Cloud-Dienste/Externe_Cloud-Dienste.html
