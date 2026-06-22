# Vorgangszentrale Foundation Design

Datum: 2026-06-22
Status: freigegebener Brainstorming-Designstand
Scope: `apps/web/`, `apps/agent/`, `infra/supabase/`

## Ziel

Die Vorgangszentrale wird die operative Foundation fuer die naechste Produktstufe. Sie verbindet Inbox, Vorgang, Aufgabe, Dokument, Frist, KI-Vorschlag, Review, Portal-Sichtbarkeit und Audit in einem professionellen Arbeitsplatz fuer WEG-Verwalter.

Der erste Spec baut nicht drei separate Produkte gleichzeitig. Er legt eine Foundation, auf der spaeter Security-/Trust-Center und Eigentuemerportal natuerlich aufsetzen koennen.

Der Nutzer soll drei Fragen schnell beantworten koennen:

1. Was braucht heute meine Entscheidung?
2. Welche Informationen, Dokumente und Personen gehoeren dazu?
3. Was darf ich sicher freigeben, und was muss intern bleiben?

## Recherche-Kontext

Die Marktrecherche am 22.06.2026 zeigt zwei dominante Produktlager:

- ERP-/Buchhaltungs-Suiten wie Immoware24, DOMUS, Aareon/PowerHaus, Impower und SCALARA dominieren Stammdaten, Buchhaltung, Hausgeld, Wirtschaftsplan, Zahlungsverkehr und Abrechnung.
- Portal-/CRM-Plattformen wie casavi, etg24, facilioo und iDWELL dominieren Kommunikation, Vorgangsmanagement, Eigentuemer-App, Dienstleistersteuerung und Dokumente.

KI wird im Markt vor allem als Produktivitaetsmodul vermarktet: Textassistenz, Dokumentenerkennung, Rechnungsvorbereitung, Anrufbeantworter, Ticketklassifizierung. Oeffentlich sichtbare Governance-Details wie Agent-Schreibgrenzen, Mandantenisolation, Audit-Integritaet, Quellenpflicht und Human-in-the-loop sind selten klar beschrieben.

Die Produktchance fuer dieses Projekt ist deshalb nicht "auch KI", sondern eine rechtssichere, auditierbare und KI-assistierte Vorgangsmaschine fuer WEG-Verwalter.

Relevante Quellen:

- casavi: https://casavi.com/de/
- Immoware24 KI-Funktionen: https://www.immoware24.de/funktionen/ki/
- DOMUS: https://www.domus-software.de/
- etg24: https://etg24.de/
- facilioo: https://facilioo.de/
- iDWELL: https://www.idwell.com/de/
- DSGVO Art. 32: https://gdpr-info.eu/art-32-gdpr/
- EU AI Act Art. 4: https://artificialintelligenceact.eu/article/4/
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- WCAG 2.2: https://www.w3.org/TR/WCAG22/

## Produktentscheidung

Die erste Ausbaustufe ist die **Vorgangszentrale als Foundation**.

Security/Trust und Eigentuemerportal werden nicht ignoriert. Sie werden als feste Anforderungen an Datenmodell, Sichtbarkeit, Audit, Redaction, Review-Flows und UI vorbereitet. Der erste Implementierungsschnitt liefert aber keine vollstaendige Portal-Suite und kein separates Compliance-Center.

## Architektur

### Neues Modul

Es entsteht ein neues Domain-Modul:

```text
apps/web/modules/vorgangszentrale/
```

Falls die bestehende App-Struktur weiterhin App-Router-nahe Module bevorzugt, kann die Implementierung die Dateien zunaechst unter `apps/web/src/app/(dashboard)/vorgaenge/` und `apps/web/src/lib/vorgangszentrale/` platzieren. Die fachliche Modulgrenze bleibt trotzdem `vorgangszentrale`.

Interne Unterbereiche:

- `inbox` fuer rohe Eingangselemente.
- `tasks` fuer Aufgaben und Fristen.
- `timeline` fuer die nutzernahe Arbeitschronik.
- `visibility` fuer interne, Beirat-, Eigentuemer- und Dienstleister-Sichtbarkeit.
- `reviews` fuer KI- und Systemvorschlaege, die eine menschliche Entscheidung brauchen.

### Abgrenzung zu bestehenden Modulen

Die Vorgangszentrale orchestriert Arbeit, wird aber nicht neue Quelle der Wahrheit fuer bestehende Domaenen.

| Modul | Fuehrend fuer | Rolle der Vorgangszentrale |
| --- | --- | --- |
| `weg` | WEG, Einheit, Person, Ownership, Rollen | referenziert Stammdaten, kopiert sie nicht |
| `dokumente` | Upload, Version, Hash, Storage, Preview | verknuepft Dokumente mit Arbeitskontext |
| `versammlung` | Meeting, TOP, Resolution, Vote, Protocol | erzeugt Vorbereitungs- und Folgeaufgaben |
| `beschluss-sammlung` | append-only Beschluss-Sammlung | verwaltet Pruefung/Umsetzung, mutiert keine Eintraege |
| `finanzen` | Wirtschaftsplan, Sollstellung, spaetere Buchungen | buendelt Pruef- und Klaerfaelle |
| `audit` | revisionsfeste technische Wahrheit | bleibt massgeblich fuer Nachweis und Integritaet |
| `agent-bridge` | AgentSuggestion und KI-Review | liefert Vorschlaege, die in Vorgangsreviews erscheinen |

## Datenmodell

### `vorgang`

Fachlicher Arbeitscontainer.

Beispiele:

- Schadensmeldung
- Belegpruefung
- Eigentuemeranfrage
- Beschlussumsetzung
- Rechnungspruefung
- Versammlungsvorbereitung
- Dokumentenklaerung

Pflichtfelder:

- `id`
- `tenant_id`
- `weg_id` nullable, aber globale Tenant-Vorgaenge muessen explizit sein
- `title`
- `typ`
- `status`
- `priority`
- `visibility_state`
- `assigned_to`
- `due_at`
- `created_by`
- `created_at`
- `updated_at`

### `vorgang_inbox_item`

Rohes Eingangselement vor fachlicher Einordnung.

Kanaele:

- `manual`
- `document_upload`
- `portal_message`
- `email_placeholder`
- `phone_note`
- `system_event`

Ein `InboxItem` kann einem bestehenden Vorgang zugeordnet, verworfen oder in einen neuen Vorgang konvertiert werden.

### `vorgang_task`

Konkrete Arbeitseinheit mit Verantwortlichem, Frist und Status.

Aufgaben koennen zu einem Vorgang gehoeren oder spaeter als eigenstaendige Wiedervorlage entstehen. Im ersten Schnitt soll jede Aufgabe bevorzugt einen `vorgang_id` haben, damit der Arbeitskontext erhalten bleibt.

### `vorgang_timeline_event`

Nutzernahe Chronik pro Vorgang.

Sie zeigt Statuswechsel, Kommentare, Dokumentverknuepfungen, KI-Vorschlaege, Freigaben und Kommunikationsereignisse. Sie ist nicht Ersatz fuer `audit_event`; die Audit-Tabelle bleibt die revisionsfeste Wahrheit.

Timeline-Events sind fachlich append-only. Korrekturen erfolgen ueber neue Events.

### `vorgang_relation`

Typisierte Links zu bestehenden Domaenenobjekten.

Unterstuetzte Relationstypen im Design:

- `weg`
- `unit`
- `person`
- `ownership`
- `document`
- `meeting`
- `agenda_item`
- `resolution`
- `beschluss_sammlung_entry`
- `wirtschaftsplan`
- `sollstellung`
- `audit_event`

Bei sensiblen Relationen, insbesondere Personen- und Dokumentrelationen, prueft die Server Action zusaetzlich, ob die Relation im selben Tenant liegt und fachlich zum Vorgang passt.

### `vorgang_participant`

Beteiligte mit Rolle im Vorgang:

- `verwalter`
- `buchhaltung`
- `beirat`
- `eigentuemer`
- `dienstleister`
- `auditor`

Teilnahme bedeutet nicht automatisch Sichtbarkeit. Sichtbarkeit wird separat ueber `vorgang_visibility` gesteuert.

### `vorgang_visibility`

Explizite Sichtbarkeitsregeln fuer Portal und externe Beteiligte.

Defaults:

- portal-sichtbar: `false`
- interne Notizen: `internal`
- Dokumentfreigabe: keine automatische Vererbung
- KI-Rohdaten: nie portal-sichtbar

## Statusmodelle

### InboxItem

```text
new -> classified -> linked
                  -> converted
                  -> dismissed
                  -> failed
```

Status:

- `new`: eingegangen, noch nicht geprueft.
- `classified`: Mensch oder KI hat Typ, WEG-Bezug, Prioritaet oder Frist vorgeschlagen.
- `linked`: mit bestehendem Vorgang verbunden.
- `converted`: neuer Vorgang wurde erzeugt.
- `dismissed`: irrelevant, Spam oder Duplikat.
- `failed`: Verarbeitung fehlgeschlagen.

### Vorgang

```text
draft -> open -> waiting_external -> open
              -> waiting_internal -> review_required -> open
              -> resolved -> closed
              -> cancelled
```

Status:

- `draft`: angelegt, fachlich noch unvollstaendig.
- `open`: aktiv in Bearbeitung.
- `waiting_external`: wartet auf Eigentuemer, Dienstleister, Beirat, Bank, Behoerde oder andere externe Stelle.
- `waiting_internal`: wartet auf interne Freigabe oder Entscheidung.
- `review_required`: KI- oder Systemvorschlag braucht menschliche Pruefung.
- `resolved`: inhaltlich erledigt, aber noch nicht final geschlossen.
- `closed`: abgeschlossen, historisch lesbar.
- `cancelled`: abgebrochen oder falsch angelegt.

### Aufgabe

Status:

- `todo`
- `in_progress`
- `blocked`
- `review_required`
- `done`
- `cancelled`

Statuswechsel erzeugen Audit-Events. KI darf Statuswechsel vorschlagen, aber nicht final fuer rechtlich oder finanziell wirksame Domainobjekte ausfuehren.

## Informationsarchitektur

Die App-Navigation bekommt neue Arbeitsbereiche:

```text
Arbeitsplatz
Vorgaenge
Inbox
Reviews
WEGs
Versammlungen
Dokumente
Finanzen
Audit
```

`Arbeitsplatz` kann im ersten Schnitt das bestehende Dashboard ergaenzen oder spaeter ersetzen. Der Fokus liegt nicht auf Charts, sondern auf Arbeit:

- offene Reviews
- ueberfaellige Vorgaenge
- Fristen heute
- KI-Vorschlaege
- wartende externe Antworten
- neue Inbox-Items

## UX/UI

### Vorgangsliste

Die Hauptansicht ist eine dichte Tabelle/List-Hybrid mit gespeicherten Views:

- `Meine offenen`
- `Ueberfaellig`
- `Heute faellig`
- `Review erforderlich`
- `KI-Vorschlaege`
- `Warten auf Externe`
- `Eigentuemer sichtbar`

Spalten:

- Prioritaet
- Status
- Titel
- WEG
- Typ
- Frist
- Zustaendig
- Sichtbarkeit
- KI
- Letzte Aktivitaet

Klick auf eine Zeile oeffnet ein rechtes Sidepanel. `Enter` oeffnet die volle Detailseite. `Space` selektiert. Batch-Aktionen erscheinen nur nach expliziter Auswahl.

### Sidepanel

Das Sidepanel zeigt:

- Titel, Status, Prioritaet, Frist, Verantwortlicher
- naechste empfohlene Aktion
- Timeline
- Aufgaben
- Dokumente mit Version/Hash/Integritaetshinweis
- offene KI-Vorschlaege
- Sichtbarkeit
- kompakter Audit-Auszug mit Link ins Audit-Modul

Das Sidepanel muss Fokus sauber halten und nach dem Schliessen zur Ausgangszeile zurueckkehren.

### Inbox

Die Inbox ist der Triage-Arbeitsplatz.

Flow:

```text
Eingang pruefen
  -> KI-Vorschlag ansehen
  -> vorhandenen Vorgang zuordnen oder neuen Vorgang erstellen
  -> Aufgabe/Frist/Sichtbarkeit bestaetigen
  -> InboxItem abschliessen
```

Kein Inbox-Item wird automatisch portal-sichtbar.

### Review-Queue

Die Review-Queue sammelt Entscheidungen:

- Triage-Vorschlaege
- Antwortentwuerfe
- Fristvorschlaege
- Dokumentmetadaten
- RAG-Antworten
- Risiko-Hinweise

Review-Before-Commit gilt fuer:

- Beschlussformulierungen
- Protokollfinalisierung
- Eintraege in die Beschluss-Sammlung
- Zahlungen und Buchungsvorschlaege
- Eigentuemerkommunikation
- Dienstleisterbeauftragung
- Sichtbarkeitsaenderungen Richtung Portal

Die Review-Ansicht zeigt die Wirkung, nicht den Prompt: Empfaenger, Text, Anhaenge, geaenderte Felder, betroffene WEG, Rechts-/Finanzwirkung und Audit-Folge.

### KI-Provenance

Jeder KI-Beitrag zeigt:

- Badge `KI-Vorschlag`
- Quelle und Dokumentbezug
- qualitative Sicherheit: `hoch`, `mittel`, `niedrig`, `blockiert`
- Zeitpunkt
- Agent-Use-Case
- Diff zur letzten menschlichen Version
- Status: `vorgeschlagen`, `ueberarbeitet`, `uebernommen`, `verworfen`

Keine numerischen Prozent-Konfidenzen.

### Accessibility

Ziel: WCAG 2.2 AA.

Anforderungen:

- keine Drag-only-Aktionen
- sichtbarer Fokus
- echte Tabellenheader und Status-Text
- keine reine Farbcodierung
- KI-Streaming mit `aria-live="polite"`
- Touch-Ziele mobil mindestens 44 px fuer Primaeraktionen
- Sidepanel-Fokusfuehrung und Fokus-Rueckkehr
- destruktive oder rechtlich relevante Aktionen mit expliziter Zusammenfassung

Keyboard-Ziele:

- `Ctrl/Cmd+K`: Command Palette
- `/`: Suche in aktueller Liste
- `j/k`: Zeile wechseln
- `Space`: auswaehlen
- `Enter`: oeffnen
- `e`: bearbeiten
- `a`: KI-Vorschlag uebernehmen, nur bei fokussiertem Vorschlag
- `r`: KI-Vorschlag verwerfen
- `Esc`: Sidepanel schliessen oder Auswahl aufheben

## Security, Compliance, Audit

### RLS und Least Privilege

Jede neue Tabelle folgt dem bestehenden Supabase-Pattern:

- `tenant_id NOT NULL DEFAULT public.tenant_id()`
- `ENABLE ROW LEVEL SECURITY`
- `FORCE ROW LEVEL SECURITY`
- getrennte Policies pro Command
- keine `FOR ALL`-Policies
- Composite-FKs mit `(tenant_id, id)`
- keine offenen `anon`-Grants
- Views mit `security_invoker = true`
- `SECURITY DEFINER` nur mit explizitem Tenant-Check, fixem `search_path` und minimalem Grant

Rollen im Design:

- `tenant_admin`: alle Tenant-Vorgaenge, Audit, Payload-Reveal, Konfiguration.
- `verwalter_mitarbeiter`: zugewiesene WEGs, Vorgaenge, Aufgaben, Reviews.
- `buchhaltung`: Finance-Kontext und Beleg-/Rechnungspruefung, keine Meeting-Finalisierung.
- `beirat`: nur explizit freigegebene Vorgaenge und Dokumente.
- `eigentuemer`: eigene portal-sichtbare Meldungen und freigegebene Status/Dokumente.
- `auditor_readonly`: read-only, bevorzugt maskiert.

### Audit

Pflicht-Events:

- `vorgang.created`
- `vorgang.updated`
- `vorgang.status_changed`
- `vorgang.priority_changed`
- `vorgang.assigned`
- `vorgang.visibility_changed`
- `vorgang.portal_published`
- `vorgang.document_linked`
- `vorgang.document_unlinked`
- `vorgang.message_sent`
- `vorgang.internal_note_added`
- `vorgang.task_created`
- `vorgang.task_completed`
- `vorgang.agent_suggestion_created`
- `vorgang.agent_suggestion_accepted`
- `vorgang.agent_suggestion_rejected`
- `vorgang.payload_revealed`
- `vorgang.exported`

Audit-Payloads enthalten fuer jede Vorgangsaenderung die folgenden Felder, soweit sie fuer das konkrete Ereignis fachlich existieren:

- `tenant_id`
- `weg_id`
- `vorgang_id`
- `actor_type`
- `actor_user_id`
- `db_role`
- `before`/`after` oder reduzierte Diff-Payload
- `request_id`
- `ip_hash`
- `user_agent_hash`
- `langfuse_trace_id`
- `document_version_id`

Payload-Reveal ist ein eigener auditierter Akt.

### Datenschutz und Redaction

PII-Regeln:

- Personenfelder werden klassifiziert: `public`, `tenant_internal`, `restricted_pii`, `special_category`.
- KI-Traces speichern keine vollstaendigen Klartext-Personendaten, wenn IDs oder redaktierte Platzhalter reichen.
- Vor LLM-Calls werden Namen, E-Mail, Telefonnummer, IBAN, Adressen und freie personenbezogene Details redaktiert oder pseudonymisiert, soweit der Use-Case es erlaubt.
- Re-Identifikation passiert nur serverseitig und tenant-scoped.
- Eigentuemerportal sieht keine internen Notizen, keine Rohprompts und keine vertraulichen Dienstleister- oder Rechtsnotizen.
- Eval-Datasets bleiben synthetisch.

### Dokumentenintegritaet und Retention

Dokumente im Vorgangskontext sind Beweismittel.

Jeder Dokumentlink muss Version und Integritaet sichtbar machen:

- `document_version_id`
- SHA-256-Hash pro Version
- MIME-Type
- Size
- Upload-Actor
- Scan-/OCR-Status
- Freigabestatus
- Retention-Klasse
- Audit-Event bei Upload, Versionierung, Freigabe, Reveal und Export

Retention-Klassen im Design:

- `operational`
- `weg_legal_10y`
- `finance_10y`
- `audit_locked`

Keine harte Loeschung aus der Tenant-UI fuer relevante WEG-, Finance-, Beschluss- oder Audit-Dokumente.

## Agent und RAG

### Neuer Graph

Der Agent-Service bekommt einen eigenen Graph:

```text
vorgang_graph
```

Kein Supervisor-Graph. Der Use-Case wird deterministisch ueber den Endpoint adressiert:

```text
POST /agent/vorgang
```

### Erste KI-Use-Cases

Im ersten Spec erlaubt:

- Inbox-Triage
- Antwortentwurf
- Aufgaben-/Fristvorschlag
- Dokumenthinweise
- RAG-Kontextantworten mit Quellen
- Risk Flags

Nicht erlaubt:

- automatische Zahlungen
- automatische Beschluesse
- automatische Stimmen
- automatische Lieferantenbeauftragungen
- autonome Eigentuemerkommunikation
- finales Schliessen rechtlich oder finanziell relevanter Vorgaenge

### Flow

```text
POST /agent/vorgang
  -> JWT validieren
  -> Vorgang/Inbox-Kontext per RLS-Tools laden
  -> RAG abrufen
  -> strukturierte Vorschlaege erzeugen
  -> Quellen, Unsicherheit, trace_id, thread_id anhaengen
  -> AgentSuggestion speichern
  -> UI zeigt Review
  -> Mensch akzeptiert, editiert oder verwirft
  -> Server Action fuehrt finale Domain-Aenderung aus
```

### AgentSuggestion-Typen

Neue Typen:

- `vorgang_triage`
- `antwort_entwurf`
- `frist_vorschlag`
- `dokument_metadaten_vorschlag`
- `tool_action_proposal`
- `rag_answer`

Der Agent schreibt weiterhin nur in `agent_suggestion`.

### RAG-Quellenpflicht

Regel: Keine fachliche Antwort ohne Quelle.

Jede RAG-Antwort braucht Quellen mit:

- `chunk_id`
- `document_id`
- `document_version_hash`
- `doc_typ`
- `heading_path`
- `page_or_section`
- `retrieved_at`
- `effective_date`
- `tenant_id`
- `weg_id`

Wenn Retrieval leer ist, gibt der Agent `insufficient_sources` zurueck und nennt fehlende Dokumente oder Daten. Er improvisiert keine fachliche Antwort.

Unsicherheitsstufen:

- `hoch`: mehrere passende Quellen, kein Konflikt.
- `mittel`: eine Quelle oder indirekter Bezug.
- `niedrig`: unvollstaendige oder semantisch schwache Quelle.
- `blockiert`: keine Quelle, Rechteproblem, Dokumentkonflikt oder Prompt-Injection-Verdacht.

Dokumenteninhalte sind Datenmaterial, keine Tool-Instruktionen.

### Fehlerfaelle

- JWT fehlt oder ist abgelaufen: `401`.
- Cross-tenant Thread: `403` vor Checkpointer-Zugriff.
- RAG leer: `insufficient_sources`.
- RAG widerspruechlich: Konflikt anzeigen, keine Entscheidung vorschlagen.
- Prompt-Injection-Verdacht: Quelle markieren, keine Tool-Aktion ableiten.
- Structured Output invalid: ein Reparaturversuch, dann sauberer Fehler.
- LLM Timeout: Vorgang bleibt unveraendert, Retry moeglich, Trace speichern.
- Agent versucht protected write: Toolschicht verhindert es; DB-Trigger bleibt Defense-in-Depth.

## Tests und Validierung

### Datenbank und RLS

- Cross-Tenant-Negativtests fuer jede neue Tabelle.
- Katalogtest fuer `FORCE RLS`.
- Test gegen `FOR ALL`-Policies.
- Test gegen offene `anon`-Grants.
- Composite-FK-Test gegen Cross-Tenant-Verlinkung.
- Storage-RLS-Test fuer fremde Tenant-/WEG-Pfade.

### Rollen

- `tenant_admin` sieht alle Tenant-Vorgaenge.
- `verwalter_mitarbeiter` sieht nur zugewiesene WEGs.
- `buchhaltung` sieht Finance-Kontext, aber keine Meeting-Finalisierung.
- `beirat` sieht nur freigegebene Vorgaenge/Dokumente.
- `eigentuemer` sieht nur eigene portal-sichtbare Vorgaenge.
- `auditor_readonly` kann nicht mutieren.

### Agent

- Agent kann `agent_suggestion` schreiben.
- Agent kann keine finalen Domain-Aktionen ausfuehren.
- Prompt-Injection-Dokumente loesen keine Tool-Aktionen aus.
- RAG-Antwort ohne Quelle wird blockiert.
- KI-Uebernahme erzeugt getrennte Events: Vorschlag durch Agent, Entscheidung durch User.

### Audit

- Jede Vorgangsaenderung erzeugt Audit.
- Audit bleibt append-only.
- Payload-Reveal erzeugt eigenes Audit.
- HMAC-Forward-Verification bleibt ab 0045/0046-Checkpoint pruefbar.
- Legacy-Audit-Fenster wird nicht als vollstaendig v2-HMAC-verifiziert dargestellt.

### UX

- Tastaturpfade fuer Liste, Sidepanel und Review-Queue.
- Fokus-Rueckkehr aus Sidepanel.
- `aria-live="polite"` fuer KI-Streaming.
- Keine Aktion nur per Drag.
- Keine reine Farbcodierung fuer Status, Risiko oder KI.

### Evaluation und Observability

- Langfuse Trace pro Agent-Run mit `tenant_id`, `use_case`, `vorgang_id`, `thread_id`, `suggestion_id`, Modellversion und Promptversion.
- RAGAS-Gate erst mit kuratiertem WEG-Fixture-Datensatz.
- Suggestion-Quality-Eval fuer Kategorie, Frist, Quelle, Halluzination und verbotene Aktion.
- Security-Evals fuer Cross-Tenant, Agent-Write-Blocks und Prompt-Injection.
- Metriken: Annahmequote, Editierquote, Verwerfungsgruende, `insufficient_sources`, blockierte Vorschlaege.

## Out of Scope fuer den ersten Implementierungsplan

- Vollstaendige Eigentuemer-App oder native Mobile-App.
- Vollautomatischer Telefonbot.
- Automatische Zahlungsausfuehrung.
- Autonome Dienstleisterbeauftragung.
- Vollstaendiges Compliance-/Trust-Center.
- Produktive RAG-Aktivierung ohne Embedding-Datenpipeline und Eval-Gate.
- Cold-Storage-Detach/Drop fuer Audit-Partitionen.
- Migration weg von bestehenden Next-16-Workarounds.

## Offene Entscheidungen fuer den Implementierungsplan

1. Ob die erste Route `/vorgaenge` oder `/arbeitsplatz` als primaerer Einstieg bekommt.
2. Ob `Inbox`, `Reviews` und `Vorgaenge` separate Top-Level-Routen oder Tabs einer gemeinsamen Route werden.
3. Ob `vorgang_relation` als polymorphe Relationstabelle startet oder fuer kritische Entitaeten zusaetzliche typisierte Linktabellen bekommt.
4. Ob `vorgang_visibility` im ersten Schnitt nur intern/portal-sichtbar unterscheidet oder bereits Beirat/Eigentuemer/Dienstleister getrennt modelliert.
5. Ob der neue `vorgang_graph` im ersten Implementierungsplan nur strukturierte Mock-/Deterministic-Suggestions erzeugt, bis RAG wirklich Daten liefert.

## Akzeptanzkriterien fuer den Designstand

Der Designstand ist akzeptiert, wenn:

- die Vorgangszentrale als Foundation gegenueber Security-Center und Portal priorisiert ist,
- bestehende Domaenen ihre Fuehrung behalten,
- KI nur Vorschlaege erzeugt,
- RLS, Audit, Redaction und Review-Before-Commit als harte Anforderungen definiert sind,
- Portal-Sichtbarkeit vorbereitet, aber nicht automatisch aktiviert wird,
- RAG ohne Quellen keine fachlichen Antworten liefert.
