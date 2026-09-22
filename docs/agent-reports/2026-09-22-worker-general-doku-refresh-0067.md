# WEG-Verwaltung Agent Report

Datum: `2026-09-22`
Agent/Rolle: `Claude (Opus 5)`
Task: `Dokumentationsrueckstand nach 0061-0067 schliessen; neue globale Dokumentationspflicht verankern`
Betroffener Worker-Bereich: `nicht relevant (reine Dokumentation)`

## Kurzfazit

Erledigt. Sechs Dokumentationsdateien behaupteten einen Projektstand zwischen
`0056` und `0060`, waehrend der Code auf `0067` stand. Der Rueckstand ist
geschlossen; die projekteigene Frische-Pruefung war der Ausloeser und ist der
Beleg.

## Was bedeutet das?

`AGENTS.md` bezeichnet sich selbst als verbindliche Source of Truth und wird zu
Beginn jeder Session gelesen. Sie nannte Migrationsstand `0060`. Wer ihr folgte,
begann mit einem Bild, das sieben Migrationen und dreizehn PRs alt war —
einschliesslich der Annahme, Heizkosten liessen sich nicht positionsgenau planen
und eine Jahresabrechnung existiere nicht. Beides war seit dem 2026-09-20 falsch.

Der Schaden veralteter Doku waechst nicht pro Commit, sondern pro Session: jede
neue Session startet erneut mit dem falschen Bild.

## Handfester Fahrplan

1. `docs/09-tom-art32.md` per PR #22 in `main` — erledigt (Squash `68b227c`).
2. Doku-Rueckstand schliessen — dieser Report. Freigabe fuer Commit/Push noetig.
3. Katalogweite RLS-Zusicherung als pgTAP-Vertrag — naechster Slice.
4. Backup-/Wiederherstellungsregime — Betriebsentscheidung, nicht allein im Code
   loesbar.
5. Cloud-Migrationsstand per `supabase migration list --linked` abgleichen —
   freigabepflichtig.

## Entscheidung fuer den Nutzer

Freigeben. Der Commit aendert ausschliesslich Markdown; kein Produktcode, keine
Migration, keine RLS-Policy ist betroffen. Das Risiko liegt nicht im Aendern,
sondern im Nicht-Aendern.

## Findings

**Finding 1 — Source of Truth war sieben Migrationen alt**

- Status: `SUPPORTED`
- Prioritaet: `P1`
- Problem: `AGENTS.md`, `PROJECT.md`, `PROJECT_CONTEXT.md`, `PROJECT_REALITY.md`,
  `TEST_INFRA.md` und `docs/08-finance-domain-model.md` nannten Staende zwischen
  `0056` und `0060`. Tatsaechlicher Stand: `0067`.
- Auswirkung: `PROJECT_REALITY.md` fuehrte als „Next Logical Step" einen
  E2E-Spec fuer den Positionen-Pfad, den es laengst gibt
  (`finanzen-positionen.spec.ts`), und beschrieb die HeizKV-Luecke als offen,
  obwohl `0067` sie geschlossen hat. Eine Session, die dem Dokument folgt,
  baut Vorhandenes nach.
- Naechster Schritt: alle sechs Dateien auf `0067` gebracht — umgesetzt.
- Begruendung: Die Dateien sind Pflichtlektuere laut `AGENTS.md`; falsche
  Pflichtlektuere ist schlechter als keine.

**Finding 2 — Frische-Pruefung meldete STALE, wurde aber nicht befolgt**

- Status: `SUPPORTED`
- Prioritaet: `P2`
- Problem: `./scripts/check-project-reality-freshness.sh` meldete am 2026-09-22
  `STALE` mit 11 undokumentierten Produktcode-Commits bei Schwelle 8.
- Auswirkung: Der Mechanismus funktioniert — er wurde nur nicht gelesen. Ein
  nicht-blockierender Check, den niemand liest, ist kein Check.
- Naechster Schritt: Die Pruefung gehoert vor jeden Commit, nicht nur in
  `verify.sh`. Als globale Arbeitsregel verankert (siehe unten).
- Begruendung: Der Check ist git-only, ohne Secrets, ohne Cloud-Aufruf und
  kostet Sekunden.

**Finding 3 — `0001_rls_negative.sql` prueft nichts**

- Status: `SUPPORTED`
- Prioritaet: `P2`
- Problem: Die Datei traegt den Namen des RLS-Negativtests, ist aber
  vollstaendig auskommentiert („the SHAPE, not a runnable suite") und in keinem
  justfile-Rezept verdrahtet. Gleiches gilt fuer
  `0039_sollstellung_option_b.sql`.
- Auswirkung: Wer die Vertragsliste ueberfliegt, haelt die Mandantentrennung
  fuer getestet. Von 20 Vertragsdateien laufen 15 im CI-Gate.
- Naechster Schritt: Nicht die Datei aufwerten, sondern die fehlende Zusicherung
  bauen — katalogweite RLS-Pruefung nach `docs/09-tom-art32.md` § 9.7. Als
  naechster Slice geplant.
- Begruendung: Ein auskommentierter Test ist ehrlicher als ein schwacher; die
  Luecke ist die fehlende Zusicherung, nicht die Datei.

## Geaenderte Dateien

- `AGENTS.md` — Abschnitt „Aktueller Stand" neu geschrieben (`0060` → `0067`),
  Kommentar bei `just test-finance-db` korrigiert, `docs/08` in die Referenzen
  aufgenommen.
- `PROJECT_REALITY.md` — Refresh nach der bestehenden Audit-Methode; Confidence
  von `high` auf `medium` gesenkt, weil der Cloud-Stand nicht mehr belegt ist.
- `PROJECT.md` — Executive Summary, Ampel und Test-/Validierungsstatus.
- `PROJECT_CONTEXT.md` — Abschnitt „Aktueller Zustand".
- `TEST_INFRA.md` — Migrationsannahme, Current Status, pgTAP-Verdrahtung.
- `docs/08-finance-domain-model.md` — Migrationsstrategie 3 und 4.
- `docs/agent-reports/2026-09-22-worker-general-doku-refresh-0067.md` — dieser
  Report.

## Betroffene Systembereiche

Keine. Kein Produktcode, keine Migration, keine Policy, kein Test.

## Architektur- und Securitycheck

Die Confidence-Senkung in `PROJECT_REALITY.md` ist die einzige
sicherheitsrelevante Aussage dieses Commits: Der Cloud-Migrationsstand war am
2026-09-19 verifiziert, `0061`-`0067` wurden am 2026-09-20 ausgerollt, und
seither lief kein `supabase migration list --linked`. Die Annahme „Cloud =
lokal" hat dieses Projekt bereits dreimal widerlegt (`0045`, `0058`, `0059`).
Sie wird deshalb nicht mehr als belegt gefuehrt.

## Ausgefuehrte Checks

- `./scripts/check-project-reality-freshness.sh` — meldete `STALE` (Ausloeser).
- `./scripts/verify.sh` — siehe Git-Status.
- Migrationsstand, Vertragsliste, E2E-Spec-Liste und justfile-Listen direkt aus
  dem Repo gezaehlt, nicht aus der Erinnerung uebernommen.

## Git-Status

Branch `claude/docs-refresh-0067`, abgezweigt von `main` (`68b227c`).
PR #22 wurde vorher gemerged.

## Security-Check

Keine Secrets, keine personenbezogenen Daten, keine Cloud-Credentials im Diff.
Keine Cloud-Aktion ausgefuehrt.

## Bewusst nicht geaendert

- Die Incident-Historie in `PROJECT.md` (Audit 0042-0044) — sie ist Historie und
  bleibt korrekt.
- `README.md`, `SECURITY.md`, `TESTING.md`, `WORKFLOW.md` — enthalten keine
  Migrationsstandsangaben und sind nicht veraltet.
- `0001_rls_negative.sql` — nicht aufgewertet und nicht geloescht; die Luecke
  wird im naechsten Slice mit einer echten Zusicherung geschlossen.
- Keine retrospektiven Einzelreports fuer `0061`-`0067`. Nachtraeglich erfundene
  Detailtiefe waere schlechter als der konsolidierte Stand in
  `PROJECT_REALITY.md`.

## Risiken

Der Cloud-Migrationsstand bleibt unbelegt, bis jemand den freigabepflichtigen
Abgleich ausfuehrt. Bis dahin darf keine produktionsnahe Aussage auf „Cloud ist
auf `0067`" gestuetzt werden.

## Folgeaufgaben

1. Katalogweite RLS-Zusicherung als pgTAP-Vertrag (`docs/09-tom-art32.md` § 9.7).
2. Backup-/Wiederherstellungsregime inkl. einem echten Wiederherstellungslauf.
3. Cloud-Migrationsstand abgleichen (freigabepflichtig).
4. AVV und Art.-30-Verzeichnis — juristische Spur, ausserhalb meines Scopes.

## Neue globale Arbeitsregel

Auf Nutzeranweisung vom 2026-09-22 in `~/.claude/CLAUDE.md` verankert:
alles, was gebaut oder geaendert wird, wird dokumentiert; alle betroffenen
`.md`-Dateien gehoeren in denselben Commit wie die Aenderung, nicht in einen
spaeteren. Eine Aenderung ohne mitgefuehrte Doku gilt als unfertig.
