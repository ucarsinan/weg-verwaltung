# Section 6 — End-to-End-Workflows, Risiken, Out-of-Scope

> **Status:** Section 6 von 6 fertig. Die Design-Spec ist damit abgeschlossen.
> Diese finale Section verbindet die Sections 1–5 zu echten Verwalter-Workflows, geht jeden mit STRIDE-Threat-Walk-Through durch, ordnet die Restrisiken in einer 3×3-Matrix ein, dokumentiert die drei Out-of-Scope-Adapter-Slots (eIDAS, SEPA, Hybrid-Meeting), beschreibt die Production-Migration-Roadmap und schließt mit einer kuratierten Synthese aller offen gelassenen Fragen.

---

## 6.1 Workflows-Übersicht + Mode-Matrix

Die vorigen fünf Sections legten das Modell, die Architektur, die Sicherheits-Invarianten, die KI-Schicht und die UX-Prinzipien fest. Section 6 zeigt, **wie sie im realen Verwalter-Alltag zusammenwirken** — und wo bewusst Slots offen bleiben.

Die WEG-Reform 2020 (WEMoG) und die Mini-Reform vom 17.10.2024 haben den Versammlungsraum geöffnet: vier Modi sind heute zulässig, jeder mit eigener Rechtsbasis, eigenen Form-Erfordernissen und eigenen Software-Konsequenzen. Die folgende Matrix ist die Referenz, gegen die alle weiteren Subsections (6.2 Happy-Path, 6.3 Mode-Variations, 6.4 Edge-Cases) gespiegelt werden.

| Schritt | Präsenz | Hybrid (§ 23 Abs. 1 S. 2) | Virtuell (seit 17.10.2024) | Umlauf (§ 23 Abs. 3) |
| --- | --- | --- | --- | --- |
| Rechtsbasis | Default | Mehrheitsbeschluss für Online-Teilnahme | 75%-Beschluss, max. 3 J., 1× Präsenz/Jahr bis 2028 Pflicht (§ 48 Abs. 6) | Allstimmig oder Themen-Mehrheits-Beschluss vorab; **Textform** seit Mini-Reform Okt 2024 (§ 126b BGB) |
| Einladung | Textform + 3 Wo. | + Einwahldaten | + Plattform-Link, Identitäts-Verfahren | Aufforderung zur Stimmabgabe in Textform |
| Anwesenheit | physisch | physisch + remote, beide gleichberechtigt | nur remote, "vergleichbare Rechte" Pflicht | entfällt |
| Vollmacht | Papier/Text | Text | Text + digital | entfällt |
| Stimmabgabe | Handzeichen/Stimmkarte | parallel im Saal + Tool | nur im Tool | individuelle Textform-Erklärung |
| Verkündung | mündlich | mündlich + im Stream | im Stream | nicht erforderlich; Feststellung durch Verwalter nach Eingang aller Stimmen |
| Protokoll | § 24 Abs. 6 | identisch | identisch (Stream-Mitschnitt strittig, nicht Pflicht) | "Niederschrift" entfällt; Dokumentation der Textform-Erklärungen |

Die Sections 6.2–6.4 detaillieren den Präsenz-Happy-Path, die Mode-Variationen und die Edge-Cases, die ein WEG-Tool bewältigen muss, ohne die Section-1-Invarianten zu brechen.

---

## 6.2 Happy-Path: Präsenz-Versammlung

Der Präsenz-Modus ist der Default, an dem das Datenmodell aus Section 1, die State-Machine aus Section 2 und die HITL-Surfaces aus Section 5 kalibriert sind. Die 13 Schritte sind keine UI-Sequenz, sondern die rechtlich-prozessuale Sicht — pro Schritt: **was tut der Verwalter / das System**, **§-Referenz** und **welche Section-Invariante greift**.

| # | Schritt | Pflicht / § | Software-Wirkung |
| --- | --- | --- | --- |
| 1 | Termin + Ort + TOP-Sammlung (Beirat, Eigentümer-Anträge) | § 24 Abs. 1 WEG | `Meeting{status: entwurf, modus: praesenz}` |
| 2 | Tagesordnung mit bestimmten Beschlussgegenständen | § 23 Abs. 2 WEG (Ankündigungserfordernis) | `AgendaItem` per `Meeting`; KI kann Vorschlag aus Vorjahres-Protokoll liefern (Use-Case 1, Section 4) als `AgentSuggestion` |
| 3 | Einladung in Textform versenden (3-Wochen-Frist, ohne Versandtag und Versammlungstag) | § 24 Abs. 4 S. 2 WEG | `Meeting.frist_einladung_ok = (termin_von - einladungs_versand_am >= 21 days)` (Invariante 6 aus Section 1) |
| 4 | Anlagen beifügen (WP-Entwurf, Vorjahres-Abrechnung, Angebote, Beschluss-Antrags-Wortlaute) | ordnungsmäßige Verwaltung §§ 18, 19 WEG | `Document` mit `meeting_id`, signed-URL-Versand |
| 5 | Anwesenheitsliste + Vollmachten in Textform prüfen | § 25 Abs. 3 WEG | `AttendanceRecord` pro `Ownership`, `Proxy`-Aggregate aus Section 1 |
| 6 | Eröffnung + Feststellung Anwesenheit + MEA. **Kein Quorum** — beschlussfähig ab 1 Eigentümer (WEMoG 2020) | § 25 WEG n.F. | `Meeting.status: laufend`, kein Quorum-Check (Stolperstein 3, siehe 6.4) |
| 7 | Pro TOP: Aussprache → Antrag formulieren → Stimmrechts-Ausschluss-Check (§ 25 Abs. 4) → Abstimmung | § 25 Abs. 2 + 4 WEG | `Vote.ownership_id` (Invariante 5), `Resolution.excluded_voter_ids[]` mit Begründung |
| 8 | **Beschlussverkündung** durch Vorsitzenden — konstitutiv | st. Rspr. (BGH V ZR 113/12 ff.) | `Resolution.verkuendet_at` als eigenes Event; ohne Eintrag kein Beschluss |
| 9 | Niederschrift in Versammlung erstellen (Verwalter führt, Vorsitzender + WEr + ggf. Beirat unterzeichnen) | § 24 Abs. 6 WEG | `Protocol.status: ki_entwurf` via Agent (Use-Case 4, Section 4.7-HITL) → `verwalter_revision` → `unterzeichnet` |
| 10 | **Beschluss-Sammlung-Eintrag** unverzüglich (≤ 1 Werktag empfohlen) | § 24 Abs. 7 S. 7 WEG | `BeschlussSammlungEntry` INSERT (append-only, Invariante 3) |
| 11 | Protokoll-Versand an alle Eigentümer | ordnungsmäßige Verwaltung | Resend (Section 3.7-Sub-Processor) |
| 12 | Anfechtungsfrist-Tracking: 1 Monat Klage- + 2 Monate Begründungsfrist ab Beschlussfassung | § 45 WEG | `Resolution.legal_state: pending`, Fristzähler |
| 13 | Nach Fristablauf: Bestandskraft markieren → Umsetzung | § 27 WEG | `Resolution.legal_state: final` → Folge-Workflows |

Die Schritte 8, 9 und 10 sind die rechtlich heikelsten — Verkündung ist konstitutiv, Niederschrift ist beweisrelevant, und der Beschluss-Sammlung-Eintrag ist die einzige unlöschbare Quelle. Genau hier greifen die Section-1-Invarianten 2 (KI = nur Vorschläge, kein Agent darf `Resolution` oder `BeschlussSammlungEntry` schreiben) und 3 (append-only) als harte DB-Trigger. Schritt 12/13 spannen den Anfechtungs-Flow aus Section 5.8 auf — der Beschluss ist nicht "fertig", sondern wandert durch `legal_state ∈ {pending, contested, final, voided}`.

---

## 6.3 Mode-Variations

Die drei Nicht-Präsenz-Modi sind keine Sonderfälle, sondern Varianten auf demselben State-Machine-Pfad aus 6.2 — sie ändern Form-Erfordernisse, Anwesenheit-Modell und Verkündungs-Schritt, aber nicht die Section-1-Aggregate. Pro Modus die Delta gegenüber Präsenz, plus die Software-Konsequenzen.

**Hybrid (§ 23 Abs. 1 S. 2):** physische + remote Teilnehmer gleichberechtigt. Online-Teilnahme bedarf vorab Mehrheitsbeschluss der WEG. Stimmabgabe parallel im Saal + im Tool — beide gehen in dieselbe `Vote`-Tabelle, unterscheidbar nur via `Vote.quelle: praesenz | digital | umlauf` (Invariante 5, Section 1). Verkündung erfolgt mündlich im Saal **und** im Stream; der Vorsitzende ist verantwortlich für die Synchronität beider Kanäle. Die "vergleichbaren Rechte" der Online-Teilnehmer (Wortmeldung, Antragsrecht, Stimmabgabe) sind Pflicht — wer remote teilnimmt, darf nicht zum Zuschauer degradiert werden. UI-seitig heißt das: der Stream-Kanal hat dieselben Action-Buttons wie der Saal-Klient.

**Virtuell (vollständig, seit 17.10.2024):** durch WEMoG-2-Reform erlaubt mit 75%-Beschluss, befristet auf 3 Jahre, plus **mindestens 1 Präsenz-Versammlung/Jahr Pflicht bis 2028 (§ 48 Abs. 6 WEG-neu)**. Software-Konsequenz: pro Tenant Tracking der "Präsenz-Quote pro Jahr" — ein Counter auf `Tenant`/`WEG`-Ebene, der bei jeder Versammlung mit `modus=praesenz | hybrid` inkrementiert wird und bei rein virtueller Planung ein UI-Warnung-Flag triggert. Stream-Mitschnitt ist nicht Pflicht (strittig in Literatur), wird aber als optionales `MediaArtifact` mit eigenem Retention-Regime modelliert (DSGVO Art. 6 lit. f vs. lit. c — Abwägung durch Verwalter). Identitäts-Verfahren beim Join → siehe Adapter-Slot 3 in Section 6.7 (Out-of-Scope-Liste).

**Umlaufbeschluss (§ 23 Abs. 3 WEG):** seit Mini-Reform Okt 2024 reicht **Textform** (§ 126b BGB) für die Aufforderung und die Stimmabgabe. Allstimmigkeit als Default; Themen-Mehrheits-Umlauf bedarf vorherigen Versammlungsbeschluss. Keine Versammlung, keine Verkündung — Verwalter stellt Ergebnis nach Eingang aller Stimmen fest. `Meeting{modus: umlauf}` durchläuft denselben State-Machine-Pfad, nur ohne `AttendanceRecord` und ohne `verkuendet_at`; stattdessen trägt `Resolution.festgestellt_at` den Zeitpunkt der Verwalter-Feststellung. Die `Vote.quelle = umlauf`-Markierung erlaubt der Auswertungslogik, die korrekte Mehrheitsregel anzuwenden — bei Themen-Mehrheits-Umlauf zählt jede nicht eingegangene Stimme als Enthaltung, nicht als Nein.

---

## 6.4 Edge-Cases + Software-Stolpersteine

Die in 6.2 skizzierten 13 Schritte sind der Happy-Path. Die folgende Tabelle listet acht Fälle, in denen WEG-Praxis vom Happy-Path abweicht und das Datenmodell den Unterschied tragen muss. Jeder Fall hat eine rechtliche Konsequenz und ein konkretes Software-Modell — beides verbunden über die Section-1-Aggregate.

| # | Fall | Rechtliche Konsequenz | Software-Modell |
| --- | --- | --- | --- |
| 1 | **Eigentümerwechsel mid-meeting** | Stimmberechtigt ist, wer zum Versammlungszeitpunkt im Grundbuch steht; Käufer i.d.R. nur mit Kaufvertrags-Vollmacht | `Vote → ownership_id` mit zeitbezogenem Ownership-Snapshot; "werdender Eigentümer" als eigener Status |
| 2 | **Vollmacht widerrufen / Vollmachtgeber erscheint** | Persönliches Erscheinen widerruft Vollmacht konkludent | `Proxy.status: revoked_at`; Anwesenheit-Erfassung setzt aktive Vollmachten dieses Eigentümers automatisch auf `superseded` |
| 3 | **Stimmverbot § 25 Abs. 4** | Eigenes Rechtsgeschäft, Rechtsstreit gegen den Eigentümer, § 17-Entziehung; auch wirtschaftliche Verflechtung | Pro TOP `Resolution.excluded_voter_ids[]` mit Begründung; bei Falschausschluss: Anfechtungsrisiko-Flag |
| 4 | **Ungültige Stimme** (Bedingung, Unklarheit) | Stimme wird nicht gezählt, gilt nicht als Nein | `Vote.validity ∈ {valid, invalid_unclear, invalid_conditional}` + Begründungsfeld |
| 5 | **Beschlussunfähigkeit** | **Existiert nicht mehr** seit WEMoG; jede Versammlung ist beschlussfähig | Kein Quorum-Check; nur Anwesenheit dokumentieren |
| 6 | **Mehrheitstyp** | Einfach (Regel), doppelt qualifiziert für bauliche Veränderung mit allgemeiner Kostentragung (§ 21 Abs. 2 Nr. 1: >2/3 Stimmen + >½ MEA), Allstimmigkeit für Vereinbarungs-Änderungen | `Resolution.majority_rule` als Enum; Auswertungslogik wendet die korrekte Schwelle an |
| 7 | **Protokoll-Korrektur nach Unterzeichnung** | Berichtigung nur bei objektiver Unrichtigkeit, datierter Berichtigungsvermerk, alle Unterzeichner unterschreiben mit; inhaltliche Änderung = neuer Beschluss | Append-only `ProtocolCorrection`-Event mit Verweis auf Original, eigene Signatur-Kette |
| 8 | **Anfechtungsfrist 1/2 Monate (§ 45)** | Beschluss schwebend wirksam, Verwalter darf trotzdem ordnungsmäßige Maßnahmen treffen; Bestandskraft erst nach Ablauf | `Resolution.legal_state ∈ {pending, contested, final, voided}` mit Fristzähler |

**Anfechtungs-Workflow (Verwalter-Sicht):**

1. Klage-Zugang an Verwalter (Beklagte ist GdWE, vertreten durch Verwalter, § 9b WEG); Klagefrist 1 Monat ab Beschluss läuft bereits.
2. Sofortmaßnahme: Anwalt beauftragen (Fristwahrung).
3. Eigentümer-Information: Klagewirkung gegen Gemeinschaft; Beschluss bleibt schwebend wirksam, Umsetzung mit Vorsicht.
4. Urteilsumsetzung: Bei Ungültig-Erklärung → in Beschluss-Sammlung als "für ungültig erklärt" vermerken (nicht löschen), Reversal-Aktionen anstoßen.

**Drei Stolpersteine — die deutsche WEG-Tools regelmäßig falsch machen:**

1. **Stimme an Person statt an Eigentum gekoppelt** — bei Eigentümerwechsel oder Bruchteilsgemeinschaft (eine Stimme pro Einheit nach Kopfprinzip) bricht die Historie. Korrekt: `Vote → ownership_id` zeitlich versioniert, niemals direkt auf User. (Section-1-Invariante 5.)
2. **"Beschluss = Mehrheit > 50%"** als Hardcode — die WEG kennt mindestens fünf Schwellen. Korrekt: Strategy-Pattern per `Resolution.majority_rule`, abhängig vom Beschlussgegenstand.
3. **Protokoll als mutables Word-Dokument** — nach Unterzeichnung ist es ein rechtsrelevantes Dokument mit Beweisfunktion. Korrektur braucht erneute Unterschriften aller Unterzeichner; Beschluss-Sammlung ist eigene unlöschbare Quelle. Korrekt: Append-only Event-Store, Berichtigungen als eigene signierte Events.

---

## 6.5 Threat-Walk-Through pro Workflow

Threat-Modeling pro Section ist abstrakt — pro Workflow wird es konkret. Methodik: ein Haupt-Workflow pro Tabelle, eine Zeile pro **state transition** (kein UI-Click-Schritt), wo entweder eine Trust-Boundary überquert oder ein Write gegen Postgres durchgereicht wird. Invariant-Anker (`§3.X`, `§4.X`) verweisen auf Section-3/4-Content, statt zu wiederholen — die `Residual`-Spalte trägt die Begründung, warum das Restrisiko **nicht** weiter mitigiert wird.

### Workflow A — Einladung versenden (Tagesordnung-Vorschlag → Mail-Versand)

Trust boundaries: Browser → Next.js Server Action → FastAPI Agent → LLM (extern) → Supabase → Resend (extern).

| # | State transition | Threats (STRIDE) | Invariant | Mitigation in step | Residual |
| --- | --- | --- | --- | --- | --- |
| 1 | Verwalter öffnet Versammlungs-Liste | S, I | §3.1 (RLS), §3.4 (Composite FKs) | JWT-Claim `tenant_id` + Policy `meeting_select` | Low — RLS-Bypass via service_role (§3.9 unknown #2) |
| 2 | Klick "KI-Tagesordnung vorschlagen" → FastAPI-Agent-Call | T, I | §3.6 T2 (indirect injection via doc), §4.6 (Spotlighting) | Spotlighting-Wrapper auf Vorjahres-Protokoll; structured Pydantic-Output | Medium — Spotlighting kein 100%-Schutz |
| 3 | Agent emittiert `AgentSuggestion`-Rows | T, R | §3.2 (KI = nur Vorschlag, DB-Trigger blockt `actor_type=agent` auf protected tables) | Trigger lehnt direkten Beschluss-Schreibzugriff ab; nur `AgentSuggestion`-Insert erlaubt | Low — Trigger ist DB-level enforcer |
| 4 | Verwalter approved Suggestions → `AgendaItem` werden persistiert | R | §3.5 (audit append-only) | AuditEvent mit `actor_type=human`, Hash-Chain | Low |
| 5 | "Einladung versenden" klickt — `interrupt()`-Approval-Card (§4.7 Layer 3) | I, D | §4.7 (Tool-Call-Safety 4-Layer), §3.6 T4 (Tool-Exfil) | Rendered-Effect-Preview, Recipient-Allow-List in Pydantic-Validator, `interrupt()` für scope=external | Medium — Allow-List nur so gut wie der Stammdaten-Stand |
| 6 | Resend-API-Call mit redacted Args | T, I | §3.7 (Sub-Processor), §3.6 T9 (LLM-Provider als Sub-Processor — Resend analog) | DPA mit Resend, EU-Region | Low — DPA-vertraglich abgedeckt |

### Workflow B — Stimmabgabe (Vote casting)

Trust boundaries: Browser → Next.js Server Action → Postgres (RLS) — **kein Agent-Pfad**.

| # | State transition | Threats | Invariant | Mitigation | Residual |
| --- | --- | --- | --- | --- | --- |
| 1 | Eigentümer öffnet Versammlung im UI | S, I | §3.1 RLS, §3.3 Rollen-Modell | JWT `app_metadata.role=eigentuemer`, Policy `vote_select_own_ownership` | Low |
| 2 | Vote-Form-Submit (Server Action) | T, R, E | §3.2 KI-only-suggests, §3.5 ownership-not-user | Server-Action prüft `actor_type=human`, schreibt `ownership_id`, niemals `person_id` | Medium — Session-Hijack zwischen MFA & Vote bleibt möglich |
| 3 | Postgres INSERT auf `vote` | T, I | Section-1-Invariante 2 (Stimmrecht), §3.4 (Composite FK `(tenant_id, ownership_id)`) | Composite FK strukturell unmöglich Cross-Tenant; Trigger validiert Ownership-Aktivität zum Meeting-Zeitpunkt | Low |
| 4 | ResolutionResult-Caching (Hintergrund) | T | §3.5 Audit | AuditEvent `vote_cast` mit Hash-Chain | Low |

### Workflow C — Protokoll-Signatur (HITL-Review → Sign)

Trust boundaries: Browser → Next.js → FastAPI Agent (LangGraph `interrupt`) → Supabase → Sign-Endpoint (kein Agent).

| # | State transition | Threats | Invariant | Mitigation | Residual |
| --- | --- | --- | --- | --- | --- |
| 1 | Meeting-Status flippt zu `beendet` → `protokoll_graph.ainvoke` | T | §4.2 (JWT nicht im State), §4.7 HITL | JWT via RunnableConfig transient; Checkpoint auf `agent.checkpoints` mit RLS | Low |
| 2 | Agent baut Draft, ruft `interrupt({protokoll_review})` | T, R | §3.6 T7 (JWT-Expiry mid-run), §4.2 (thread_id-Tenant-Prefix-Check) | thread_id-Prefix-Validierung gegen JWT vor jedem Checkpointer-Call | Medium — bei JWT-Refresh-Race kann partieller State erhalten bleiben |
| 3 | Verwalter editiert im Diff-Editor (§5.5) | T, R | §3.5 Audit | Tiptap Tracked Changes als Document-Marks, Yjs Auto-Save in `protokoll_draft_state` mit `version` | Low |
| 4 | Resume `Command(resume={edited_draft})` → Persist `Protocol{status: ki_entwurf}` | T, R | §3.2 (Agent signiert nie) | Status `ki_entwurf`, kein `unterzeichnet=true` aus Agent-Pfad möglich | Low |
| 5 | Verwalter-Klick "Unterzeichnen" → separater **Non-Agent-Endpoint** `POST /protocol/{id}/sign` | T, R, E | §3.2, §3.3 MFA-Pflicht | Re-Auth + TOTP, AuditEvent mit `actor_type=human`, Hash-Chain | Low — Agent-Pfad ist strukturell entkoppelt |

### Workflow D — Beschluss-Sammlung-Entry (append-only Write)

Trust boundaries: Server Action → Postgres mit triple Schutz-Layer.

| # | State transition | Threats | Invariant | Mitigation | Residual |
| --- | --- | --- | --- | --- | --- |
| 1 | Resolution-Status flippt zu `angenommen` nach Verkündung | T | §3.2 KI = Vorschlag | UI-Action durch Verwalter, kein Agent-Pfad | Low |
| 2 | INSERT `BeschlussSammlungEntry` | T, R | Invariante 3 (append-only), §3.5 3-Layer-Schutz (REVOKE + Trigger + RLS) | Trigger `RAISE EXCEPTION` auf UPDATE/DELETE — auch für service_role | Low — service_role-Forgery durch `db_role`-Capture detektierbar |
| 3 | Hash-Chain-Aktualisierung | I | §3.5 HMAC-SHA256 mit Vault-Key | Trigger berechnet `row_hash`, nightly `verify_chain()` | Low — Vault-Compromise ist eigene Klasse |
| 4 | Audit-Event `beschluss_sammlung_entry_created` | R | §3.5 Hash-Chain unverletzlich | dedicated `audit_writer` Role als SECURITY DEFINER | Low |

---

## 6.6 Risk-Matrix (qualitativ, 3×3)

**Methodik:** Qualitative 3×3-Matrix nach NIST SP 800-30 Rev. 1 (Very-Low…Very-High auf Low/Medium/High verdichtet). DREAD ist von Microsoft deprecated, CVSS gilt für CVEs, und OWASP-1–10-Averaging ist false precision. 5×5 lädt zu erfundener Genauigkeit ein — 3×3 plus geschriebene Anker ist der Portfolio-Sweet-Spot.

**Likelihood-Skala:**

- **Low** — erfordert privilegierten Insider oder Zero-Day
- **Medium** — bekannte Threat-Klasse, plausibel pro Jahr
- **High** — Internet-erreichbar + bekannte Exploits

**Impact-Skala:**

- **Low** — einzelner WEG-Datensatz, reversibel
- **Medium** — mandantenweit, DSGVO Art. 33 meldepflichtig
- **High** — Cross-Tenant-Leak, WEG-rechtlich anfechtbarer Beschluss, Berufsgeheimnis-Verletzung

**Matrix:**

| Risiko | Inherent (L × I) | Controls | Residual | Owner | Why not Low |
| --- | --- | --- | --- | --- | --- |
| KI-Agent schreibt direkt in `BeschlussSammlung` / `Vote` / `Protocol.unterzeichnet` | H × H = **Critical** | DB-Trigger `actor_type≠agent`, Append-only-Constraint, AuditEvent (§3.2, §3.4, §3.5) | **Low** (DB-Schema-enforced) | Backend | Trigger-Bypass nur via Superuser-Migration → §3.9 |
| Cross-Tenant-Datenleck via fehlerhafte RLS-Policy | M × H = **High** | FORCE RLS, Composite FKs, pgTAP-Negative-Tests, Supabase-Advisor-Lints als CI-Gate (§3.4) | **Medium** | Platform | Neue Policies brauchen Review; Tests decken ~80% Pfade |
| Indirect Prompt Injection via uploaded Doc | H × M = **High** | Spotlighting + Datamarking + structured Pydantic-Output (§4.6); Human-Confirm-Gate für Side-Effects (§4.7) | **Medium** | Agent-Service | Spotlighting kein 100%-Schutz; akzeptiert für non-side-effect Use-Cases (§3.9, §4.11) |
| service_role-Key-Leak (Misconfig oder Compromise) | L × H = **High** | service_role nur in System-Jobs, **niemals** in request-scoped Pfaden; `db_role`-Capture im AuditEvent (§3.4, §3.5) | **Medium** | Backend | Misconfig durch eine Sub-Modul-Migration möglich; honest unknown |
| Tool-Exfiltration via `send_email`-Injection | M × H = **High** | 4-Layer (Pydantic-Allow-List + `@side_effect` Idempotency + `interrupt()` + AuditEvent) (§4.7) | **Low** | Agent-Service | EchoLeak-class Attacks bleiben theoretisch — Defense-in-Depth begrenzt Blast-Radius |
| LLM-Provider-Memorization trotz ZDR | L × M = **Medium** | Anthropic ZDR-Agreement, EU-Routing, client-side PII-Redaction vor Send (§3.6, §3.7) | **Medium** | Compliance | Mathematisch nicht beweisbar (§3.9 unknown #5) |
| Cost-DoS via Prompt-Flood | M × M = **Medium** | 4-Layer-Cost-Controls (§4.9): Redis-Per-User, Postgres-Per-Tenant-Cap, RunBudget im State, Langfuse-Alarms | **Low** | Platform | Greift gestaffelt vor Cap-Hit |
| Audit-Hash-Chain-Bruch durch service_role-Forgery | L × H = **High** | dedicated `audit_writer`-Role + SECURITY DEFINER + nightly `verify_chain()` + pgaudit off-box (§3.5) | **Low** | Platform | Forgery anhand `db_role` und Hash-Bruch forensisch detektierbar |
| JWT-Expiry mid-Agent-Run | M × L = **Medium** | Agent-Runs ≤ 15 min, Chunked-Runs, kein Refresh im Agent-Prozess (§3.6 T7, §4.2) | **Low** | Agent-Service | Lange Background-Workflows brauchen Re-Architecture |
| CLOUD-Act-Disclosure (US-Provider) | L × H = **High** | EU-Region (Section 2.3), bewusste Offenlegung in Sub-Processor-Registry (§3.7) | **Medium** | Compliance | Strukturell nicht eliminierbar, solange Vercel/Fly/Supabase US-inkorporiert. Migration zu Hetzner ab erstem zahlenden Mandanten (§2.3) |

**Anti-Patterns explizit vermieden:**

- DREAD-Scores 1–10 gemittelt (von Microsoft deprecated).
- "Mitigated" ohne benannte Control.
- Erfundene Prozentangaben ("92 % blockiert") ohne Telemetrie.
- 5×5 mit undefinierten Labels.
- Single-Axis-Liste (nur Severity, ohne Likelihood).

---

## 6.7 Out-of-Scope-Adapter — eIDAS-Signatur · SEPA-Lastschrift · Hybrid-Meeting-Streaming

Section 1 hat externe Systeme als saubere Adapter-Slots angekündigt, nicht als Vollintegrationen. Section 6.7 zeigt für drei dieser Slots das Interface, die Vendor-Kandidaten 2026, das Hauptrisiko und die Anbindung an die Domain aus Section 1. Vendor-Wahl bleibt explizit deferred — die Architektur committed sich auf die Slot-Shape, nicht auf einen Anbieter.

### Adapter 1 — eIDAS-Signatur (Protokoll-QES)

**Kontext 2026:** eIDAS 2 (VO 2024/1183, seit 20.05.2024) macht Remote-QES per Smartphone zum Standard. **EUDI-Wallet** wird bis Ende 2026 von jedem EU-Mitgliedstaat bereitgestellt und kann QES kostenlos. Nur QES ist der handschriftlichen Signatur gleichgestellt (§ 126a BGB).

**Interface (Pseudo-Code):**

```python
class SignatureAdapter(Protocol):
    def request_signature(document_id, signer: SignerRef,
                          kind: Literal["qes","aes"]) -> SignatureRequestId
    def get_status(request_id) -> SigStatus  # pending|signed|declined|expired
    def cancel(request_id) -> None

    # Inbound webhook events:
    on_signature_completed(request_id, signed_pdf_url, cert_chain, tsa_token)
    on_signature_failed(request_id, reason)
```

**Vendor-Kandidaten 2026:**

- **D-Trust / Bundesdruckerei sign-me** — DE-souverän, behäbig
- **Swisscom Signing Service** — etabliert, CH-Datenfluss
- **Skribble** — UX-stark, aggregiert mehrere QTSPs
- **sproof sign** — AT, schlank
- **EUDI-Wallet-natives Signing** — ab 2027 Pflichtakzeptanz, kostenlos

**Hauptrisiko:** QES erfordert Identitäts-Verifikation (Video-Ident / eID) — Onboarding-Reibung für Beirat.

**Domain-Anbindung:** `Protocol.unterzeichnet` wird von boolean zu trinär (`{pending, qes, manual}`). Neues Modell `SignatureRecord(protocol_id, signer_ownership_id, qtsp, cert_serial, signed_at, artifact_uri)`. AuditEvent `ProtocolSigned` mit `actor_type=human` — Section-1-Invariante 3 ("Agent signiert nie") bleibt scharf.

### Adapter 2 — SEPA-Lastschrift (Hausgeld / Sonderumlagen)

**Kontext 2026:** Bundesbank-spezifiziertes **pain.008.001.08** ist Pflichtformat. Creditor-ID wird einmalig bei der Bundesbank beantragt (pro Verwalter-Tenant). Sequenztyp `FRST` für erstes Einreichen pro Mandat, dann `RCUR`, `OOFF` für einmalige Sonderumlagen.

**Interface (Pseudo-Code):**

```python
class SepaAdapter(Protocol):
    def create_mandate(ownership_id, iban, scheme: Literal["CORE","B2B"]) -> MandateId
    def revoke_mandate(mandate_id, reason) -> None
    def submit_debit_run(items: list[DebitItem], target_settlement_date) -> BatchId
    def export_pain008(batch_id) -> bytes  # offline-Bank-Fallback

    # Inbound webhook events:
    on_debit_settled(batch_id, per_item_status: list[ItemStatus])
    on_r_transaction(mandate_id, kind: Literal["AC04","MD06","MS02","..."])  # Rücklastschrift
```

**Vendor-Kandidaten 2026:**

- **GoCardless** — SEPA-Spezialist, gute R-Transaction-API
- **Mollie** — EU-hosted, einfache DPA
- **Stripe SEPA** — UX-stark, US-Konzern → DSGVO-Lärm
- **finAPI / FinTecSystems** — PSD2-Banking-Bridge, EBICS-nah
- **Eigener EBICS-Anschluss** — maximale Souveränität, hoher Aufwand

**Hauptrisiko:** R-Transactions (Rücklastschrift wegen fehlender Deckung) müssen pro Eigentümer auf den Beschluss zurückgemappt werden — Forderungsmanagement, nicht nur Payment.

**Domain-Anbindung:** Neue Modelle `SepaMandate(ownership_id, mandate_ref, signed_at, scheme, status)`, `DebitBatch(beschluss_id, pain008_uri, status)`. Mandat ist an `Ownership` (nicht `Person`) — bei Eigentumswechsel automatisch invalidiert (Section-1-Invariante 5).

### Adapter 3 — Hybrid / Virtuelle Versammlung (WEMoG-Reform seit 17.10.2024)

**Kontext 2026:** WEG erlaubt rein virtuelle Versammlung bei 75%-Beschluss (befristet 3 Jahre, plus mind. 1× Präsenz/Jahr Pflicht bis 2028 nach § 48 Abs. 6 WEG-neu — siehe 6.3). Nichtöffentlichkeit ist Pflicht → Warteraum, Zugangscodes, keine Weiterleitung. Aufzeichnung ist datenschutzrechtlich heikel und **out-of-scope**.

**Interface (Pseudo-Code):**

```python
class MeetingAdapter(Protocol):
    def provision_meeting(versammlung_id, start_at, expected_n: int) -> MeetingHandle
    def personalized_join_link(versammlung_id, ownership_id) -> SignedUrl  # short-lived
    def end_meeting(versammlung_id) -> None

    # Inbound events:
    on_attendee_joined(ownership_id, joined_at, ip_region)
    on_attendee_left(ownership_id, left_at)
    on_connection_quality_drop(ownership_id)  # relevant für Beschlussfähigkeit
```

**Vendor-Kandidaten 2026:**

- **BigBlueButton self-hosted EU** — DSGVO-optimal, OSS, Ops-Aufwand
- **BBB managed** (z. B. bbb-hosting.de) — DE-EU-DPA, keine Self-Host-Last
- **Zoom EU-Region + DPA** — Marktstandard, US-Konzern-Risiko
- **Webex EU** — solide, teurer
- **Microsoft Teams + Meeting-Bot-API** — falls Verwalter M365 nutzt

**Hauptrisiko:** Identitäts-Verifikation am Join — Magic-Link aus Supabase-Session + 2FA reicht für AES-Niveau; QES-Login (EUDI-Wallet) ist Roadmap.

**Domain-Anbindung:** `AttendanceRecord(versammlung_id, ownership_id, joined_at, left_at, channel: praesenz | virtual)` ersetzt die rein physische Anwesenheitsliste. Beschlussfähigkeit war seit WEMoG 2020 ohnehin nicht mehr Quorum-gebunden (siehe 6.2, Schritt 6), aber `connection_quality_drop`-Events sind relevant für die juristische Argumentation bei Anfechtung "vergleichbare Rechte nicht gewährleistet".

### Gemeinsamer Sub-Processor-Punkt

Alle drei Adapter sind Auftragsverarbeiter nach Art. 28 DSGVO (Section 3.7). Architektur-Konsequenz:

- **Sub-Processor-Registry pro Tenant** — pro aktiviertem Adapter wird `(vendor, vertrag_uri, datenraum, dpa_version)` registriert
- **Opt-in pro Tenant**, nicht global — eine kleine WEG kann ohne SEPA-Vendor leben
- **Eigentümer-Information** automatisch über den Verwalter (Art. 13 DSGVO) — Adapter-Aktivierung triggert E-Mail-Template mit aktualisierter Sub-Processor-Liste
- **AuditEvent** `SubProcessorActivated/Deactivated` in unverletzlichem `audit_event` (Invariante 4)
- **TIA (Transfer Impact Assessment)** für jeden Vendor mit US-Bezug (Zoom, Stripe) als strukturiertes Dokument

Entscheidung bleibt im MVP **explizit deferred** — drei klar abgegrenzte Slots mit identischer DSGVO-Governance, keine Vendor-Kopplung im Domain-Modell.

---

## 6.8 Production-Migration-Roadmap

**Onboarding-Roadmap in drei Stufen:**

| Stufe | Kundengröße | Provisioning | AVV-Workflow | Onboarding-Modus |
| --- | --- | --- | --- | --- |
| **Stufe 1** | Tenants 1–3 | Manuell via Admin-Script (`INSERT tenant + owner_user`) | AVV als Word/PDF per Mail, qualifizierte E-Signatur (Sproof Sign / sign-me) | "White-Glove" — 90-min Onboarding-Call, händischer Daten-Import durch Solo-Dev |
| **Stufe 2** | Tenants 4–20 | Self-Serve-Signup + Stripe-Subscription + Webhook → Edge-Function | In-App PDF-Sign (BoldSign / Sproof API) | "Guided Self-Service" — Migrations-Wizard mit CSV-Upload, Onboarding-Call optional |
| **Stufe 3** | Tenants 20+ | API-only Provisioning, Sandbox-Tenants für Demos | Embedded eIDAS-QES-Signing via Adapter 1 | "Sales-Assisted-PLG" — Customer-Success-Profil, Referenz-Kundenprogramm, SOC-2-Vorbereitung läuft |

**Datenmigration aus existierender Software:**

Verwalter haben heute **Haufe Powerhaus / immoware24 / Karthago / Domus / SCALARA**. Diese Systeme exportieren standardisiert nur in **DATEV-CSV + Excel**, es gibt **kein "WEG-XML"** als Branchen-Standard.

**Empfohlen: Parallel-Run für ein Quartal pro Kunde.** Alte Software bleibt führend bis zur ersten erfolgreich abgehaltenen Versammlung im neuen System. Import via CSV/Excel-Export + Migrations-Mapping-Schicht in `apps/agent/` (LLM-assistiert für Einheiten-Bezeichnungen, da Schema-Mismatch typisch).

| Strategie | Verdikt | Begründung |
| --- | --- | --- |
| **Parallel-Run 1 Quartal** | ✓ empfohlen | WEG-Versammlungsfristen sind nicht verschiebbar; ein verlorener Beschluss ist juristisch teuer |
| Big-Bang-Cutover | verworfen | Risiko zu hoch |
| API-Direktimport | verworfen | kein Branchen-Standard; Custom-Scraper pro Altsystem ist kein Solo-Dev-Job |

**SLA-Empfehlung für die initiale Phase:**

**99.5% Monthly** (≈ 3,6 h Downtime/Monat) mit Exclusion-Klausel für geplante Wartung (1× monatlich, 2 h Sonntagnacht) und Force Majeure. Industry-Range B2B-SaaS 2026 ist 99.5–99.9%; 99.9% verlangt Multi-Region + 24/7-On-Call und ist ehrlich nicht versprechbar im Solo-Dev-Modus. **Honest Promise statt inflated SLA mit Credits-Theater.**

**Incident-Response-Stack:**

1. **Better Stack** — Uptime + On-Call + Status-Page (Free-Tier deckt MVP, konsolidiert 3 Tools, billiger als Statuspage.io)
2. **Sentry** — Error-Tracking + Performance (Free-Tier bis ~50k Events/Monat)
3. **Langfuse self-hosted** — LLM-Trace + Cost (Section 4.8, bereits im Stack)
4. **Supabase Logs + `pgaudit`** — DB-Forensik (Section 3.5)

Public Status-Page von Tag 1. Postmortems initial intern in `docs/incidents/`, ab Stufe 2 redacted public (Vertrauenssignal).

**Backup-Recovery-Test-Cadence:**

Supabase **PITR ist 14 Tage Default** (Pro+ Plan). Empfehlung:

- **Monatlicher Restore-Smoke-Drill** — PITR auf Staging-Branch, 30-min-Runbook
- **Quartalsweiser DR-Full-Drill** — inklusive Audit-Hash-Chain-Verifikation (`verify_chain()` post-Restore, Section 3.5)
- **RPO 1 h / RTO 4 h** für Frankfurt-only-Single-Region — ehrlich kommunizieren

---

## 6.9 Compliance-Roadmap + Architecture-Tax

Compliance ist kein Big-Bang-Projekt, sondern eine Folge von Triggern. Jeder Meilenstein hat einen konkreten Auslöser im Geschäftsverlauf — nicht "irgendwann mal", sondern "wenn X eintritt". Die folgende Tabelle ist die Roadmap, die in den Verkaufs- und Onboarding-Gesprächen vorausgesetzt werden kann.

**Compliance-Trigger-Tabelle:**

| Meilenstein | Auslöser | Konkretes |
| --- | --- | --- |
| **DSGVO TOM dokumentiert** | Tenant #1 | AVV verlangt es heute. Verzeichnis von Verarbeitungstätigkeiten (Art. 30 DSGVO), TOM-Liste (Art. 32 DSGVO) |
| **ISO 27001 Stage 1** | ~5 Tenants ODER erste Kanzlei > 50 WEGs | EU-Markt-Default für B2B (95% EU-Recognition vs. ~40% für SOC 2). Stage-1 = Documentation-Audit |
| **SOC 2 Type 2** | US-Marktambition ODER Series-A | Erst bei US-Kunden- oder VC-Bedarf. Kosten ~$15-25k initial + 12 Monate Observation-Period |
| **DSGVO-Audit extern** | > 25k Eigentümer-Datensätze ODER Datenpanne | Externer Datenschutzbeauftragter ohnehin schon ab 20+ MA-Pflicht (§ 38 BDSG), aber DSGVO-Audit ist eigene Stufe |

**ISO 27001 vor SOC 2 für DE-B2B** — klare Empfehlung. SOC 2 ist US-zentrisch; ISO ist hierzulande das, was Kanzleien-Procurement-Checklisten erwarten. Eine deutsche Verwalterkanzlei, die zwischen zwei SaaS-Anbietern wählt, kennt SOC 2 oft nicht einmal namentlich, aber sie kennt ISO 27001 aus dem eigenen IT-Governance-Kontext. Die Reihenfolge folgt damit dem Markt, nicht dem Hype.

### Architecture-Tax — drei strukturelle Festlegungen

Es gibt Entscheidungen, die in der Architektur **strukturell** verankert sein müssen, weil sie sich nachträglich nicht oder nur unter erheblichem Daten- und Vertragsrisiko nachrüsten lassen. Die folgenden drei sind in den vorigen Sections bereits gebaut — Section 6 markiert sie explizit als **nicht verschiebbar**:

| # | Tax | Wo bereits drin | Begründung |
| --- | --- | --- | --- |
| 1 | **`tenant_id` auf jeder Tabelle + FORCE RLS-Policy von Tag 1** | Section 1.4.6 / 3.4 | Multi-Tenant nachrüsten = Rewrite. Es gibt keinen Pfad "fügen wir später ein". |
| 2 | **`AuditEvent` + HMAC-Hash-Chain unlöschbar von Tag 1** | Section 3.5 | Ohne tamper-evidence ist DSGVO-Art.-30-Nachweis bzw. ISO-A.8.15 nicht machbar — historische Daten lassen sich nicht rückwirkend kette |
| 3 | **Region-Pinning auf Supabase Frankfurt + Vercel `fra1`** | Section 2.3 | Daten-Lokalität ist Schrems-II-relevant. Region-Move nachträglich ist nicht trivial — Migrations-Fenster + DPA-Updates pro Kunde. |

Diese drei sind in den vorigen Sections bereits gebaut — die Section-6-Bedeutung ist: **diese Entscheidungen sind nicht verschiebbar.** Alle anderen Sections sind anpassbar; die Tax-Punkte sind die strukturellen Festlegungen, die das Projekt überhaupt erst Compliance-fähig machen.

**Warum die Tax-Metapher:** Tax bedeutet, dass diese Entscheidungen heute Aufwand verursachen, ohne dass ein User je davon profitiert. Kein Verwalter wird je sagen "ich kaufe dieses Tool wegen der HMAC-Hash-Chain". Aber ohne diese drei Posten ist die Software bei Tenant #5 nicht mehr verkaufbar — und der Rewrite kostet das Zehnfache der initialen Tax. Die Tax ist deshalb keine Last, sondern die Eintrittskarte in den B2B-Markt 2026.

---

## 6.10 Honest Unknowns (Synthese aus allen 6 Sections)

Dies ist die finale Liste — eine kuratierte Synthese der "Honest Unknowns" aus Sections 3, 4, 5, plus Section-6-spezifische. Sie ist keine Bug-Liste, sondern ein Inventar der Stellen, an denen die Spec eine bewusste Entscheidung trifft, **ohne** sich auf eine eindeutige Antwort festzulegen — weil die eindeutige Antwort 2026 entweder rechtlich nicht entschieden, technisch nicht messbar oder operativ nicht erprobt ist.

### Rechtliche Unknowns

1. **§ 203 StGB de-lege-ferenda für Immobilienverwalter** (aus 3.9) — vereinzelt im Schrifttum diskutiert; Gesetzgeber-Bewegung würde die LLM-Strategie kippen (kein non-EU-LLM mehr).
2. **GdWE vs. Verwalter als DSGVO-Verantwortlicher** (aus 3.9, § 9a WEG) — Streit ungeklärt; Praxis-AVVs werden mit dem Verwalter geschlossen, juristisch sauberer wäre die GdWE.
3. **Art. 9 DSGVO-Daten im WEG-Alltag** (aus 3.9) — Behinderten-Stellplatz-Beschlüsse etc. können punktuell Art. 9 erzeugen; klare Erfassungs-/Vermeidungs-Policy ist projekt-offen.
4. **Eigentümer-Portal-EAA-Scope** (aus 5.11) — falls Eigentümer direkten Zugang bekommen (§ 13 BGB Verbraucher), wird der Teilbereich BFSG-pflichtig. UX-Layer muss dann strenger reviewt werden.

### Sicherheits-Unknowns

5. **Indirect Prompt Injection ist 2026 nicht gelöst** (aus 3.9 / 4.11) — Spotlighting reduziert die Rate, eliminiert sie nicht. Residual-Risk akzeptiert, kompensiert durch Human-Confirm-Gates.
6. **LLM-Provider-Memorization trotz ZDR** (aus 3.9 / 4.11) — mathematisch nicht beweisbar; Risiko vertraglich beim Provider.
7. **Sub-Processor-Change-Window** (aus 3.9) — Anthropic / OpenAI geben 30 Tage Vorlauf; in dem Fenster könnten Daten einen noch nicht freigegebenen Sub-Processor berühren.
8. **CLOUD-Act-Exposure** (aus 2.3, 3.9) — Vercel + Fly + Supabase US-inkorporiert. EU-Region gibt Daten-Residency, nicht Sovereignty. Migrationspfad Hetzner ab erstem zahlenden Mandanten dokumentiert.

### KI- und Infrastruktur-Unknowns

9. **bge-m3 Self-Host-Cost auf Fly.io Frankfurt** (aus 4.11) — nicht profiliert. CPU-Inferenz ~50 ms/Embedding würde das Fly-Compute-Budget hochziehen.
10. **`weg_legal_precision`-LLM-Judge braucht Domain-Expert-Validation** (aus 4.11) — Few-Shot + Bewertungs-Kriterien initial vom Author. Vor Prod-Use: Review durch zertifizierten WEG-Verwalter oder Fachanwalt.
11. **RAGAS-LLM-as-Judge-Bias auf DE-Rechtstext** (aus 4.11) — Standard-Metrics nutzen englischen Judge; DE-Rechtsterminologie nicht validiert.

### UX- und Tool-Unknowns

12. **Tiptap-OSS-Lizenz-Risiko langfristig** (aus 5.11) — Core ist MIT, Pro-Extensions kommerziell. Falls Pro-Features später nötig, kippt OSS-Story.
13. **`y-indexeddb` + DSGVO** (aus 5.11) — lokaler Browser-Cache enthält Eigentümer-Daten. Privacy-by-Design-Risk.
14. **Print-Layout für Protokolle** (aus 5.11) — Protokolle werden oft per Post versendet; Print-CSS bleibt eigene Aufgabe.

### Migrations- und Operational-Unknowns

15. **Datenmigrations-Mapping aus Haufe Powerhaus / immoware24** — kein Branchen-Standard, custom Scraper pro Altsystem.
16. **Solo-Dev-Skalierung beim ersten Real-Incident** — Better-Stack-On-Call deckt Notifikation, aber Bandbreite ist 1.
17. **eIDAS-2 / EUDI-Wallet-Roll-out-Timeline** — Mitgliedstaaten-spezifisch; Pflichtakzeptanz erst ab 2027.

Diese 17 Unknowns sind nicht der Grund, das Projekt nicht zu starten — sie sind der Grund, das Projekt mit offenen Augen zu starten. Jeder Punkt hat in Section 3, 4 oder 5 eine konkrete Mitigation oder ein bewusst akzeptiertes Restrisiko. Der ehrliche Umgang mit dem, was die Spec nicht weiß, ist Teil dessen, was sie als professionell ausweist.

---

## 6.11 Schlusswort

**Was diese sechs Sections leisten.** Sie modellieren ein produktionswürdiges WEG-Verwaltungs-System mit fünf harten Sicherheits-Invarianten, vier KI-Use-Cases mit klaren Mensch/Maschine-Grenzen, einem deutsch-rechtlich konformen Workflow-Set und einer ehrlichen Risiko- und Migrations-Story. Section 1 hat das Domain-Modell festgelegt, Section 2 die Deployment-Topologie, Section 3 das Sicherheitsmodell, Section 4 die KI-Architektur, Section 5 die UX-Leitprinzipien und Section 6 die End-to-End-Workflows samt Risiken.

**Was sie bewusst nicht leisten.** Eine lauffähige Implementierung. Die Spec ist Vorstufe zum Code, nicht Code. Section 6 hat 17 Honest Unknowns offen gelassen, die im Code-Pfad als Tickets oder TODOs landen, nicht in dieser Spec. Wer nach einer fertigen Lösung sucht, sucht hier falsch — wer nach einer durchdachten Grundlage sucht, hat sie.

**Wann das hier endet, wann der Code beginnt.** Sobald jemand diese sechs Markdown-Dateien gelesen hat und die zwölf Tabellen plus die drei ASCII-Diagramme zu verstehen meint, ist das nächste sinnvolle Artefakt nicht eine siebte Section, sondern: das erste `apps/agent/main.py` und das erste `supabase/migrations/0001_init.sql`. Die Iteration unter `docs/` ist abgeschlossen.

**Was das Portfolio-Piece zeigen will.** Nicht "ich kann eine WEG-Software bauen", sondern "ich verstehe, wo die WEG-Software-Architektur 2026 wehtut: bei Mandanten-Iso, bei KI-Grenzen, bei DSGVO-Rolling, bei deutschem Verfahrensrecht, bei der ehrlichen Differenz zwischen 'designed well' und 'operated well'." Eine Spec, die das ehrlich benennt, ist mehr wert als ein Halbfertig-MVP, der dieselben Fragen unter dem Teppich hält.

**Übergang.** Section 7 dieser Spec gibt es nicht. Der nächste Commit ist `feat(web): initial Next.js 16 scaffold mit auth + supabase-ssr` — oder `feat(agent): initial FastAPI skeleton + JWT-Middleware`. Die Spec hat ihre Aufgabe getan, wenn der erste Code-Commit sie als Referenz zitiert, ohne sie zu wiederholen.

**Ende der Design-Phase.**  Die Iteration unter `docs/` ist abgeschlossen — nächster Commit ist Code, nicht Spec.
