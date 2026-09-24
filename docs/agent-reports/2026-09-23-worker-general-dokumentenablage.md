# WEG-Verwaltung Agent Report

Datum: `2026-09-23`
Agent/Rolle: `Claude Sonnet 5 (worker, Task 6 von 6)`
Task: `Dokumentenablage — Produkttexte und Dokumentation`
Betroffener Worker-Bereich: `docs/`, Landing-/Preisseite, kein Datenbank- oder RLS-Bereich

## Kurzfazit

Erledigt. Task 6 schließt den sechsteiligen Slice „Dokumentenablage" ab: Startseite
und Preisseite behaupten jetzt korrekt, was das Produkt kann (Dokumentenablage
für die Verwaltung, mit expliziter § 18 Abs. 4 WEG-Grenze), und sieben
Projektdokumente sind auf den tatsächlichen Codestand nachgezogen —
einschließlich des Planungsdokuments, das nach Ruling-Historie zufolge
~zehn jetzt falsche Aussagen enthielt. `./scripts/verify.sh` und
`just test-db-all` liefen beide grün, ohne dass diese Task Schema oder Code
außerhalb der Produkttexte anfasste.

**Nachtrag (Koordinator-Rückmeldung):** Die ursprüngliche Fassung dieses Reports
hatte den `PROJECT_REALITY.md`-Kopf (Migrationsspanne, pgTAP-Zahl) als „bewusst
nicht geändert" ausgewiesen, weil der Task-6-Auftrag nur „Implemented-Eintrag
und Next Logical Step" nannte. Der Koordinator hat das korrigiert: die
Kopfzeilen-Zahlen sind Fakten, keine Bewertung, und ihre Korrektur ist genau
die Aufgabe, die dieser Task erfüllt — nicht der größere Audit-Durchgang, den
`AGENTS.md` für `Recommendation`/`Confidence`/`Last audit` reserviert. Beides
ist jetzt sauber getrennt: siehe „Was bedeutet das?" und die aktualisierten
Findings unten.

## Was bedeutet das?

Die Dokumentenablage ist seit dieser Task nicht mehr nur im Code fertig,
sondern auch in der Außendarstellung (Landingpage) und in der internen
Dokumentation korrekt beschrieben. Ein Leser von AGENTS.md, TEST_INFRA.md,
PROJECT_REALITY.md oder dem Plandokument findet jetzt nirgends mehr einen
Faktenwert, den der Code widerlegt — auch nicht mehr im `PROJECT_REALITY.md`-Kopf:
Migrationsspanne (`0001`-`0071`) und pgTAP-Zahl (19 Verträge, 355 Zusicherungen)
sind korrigiert. Bewusst unangetastet bleiben dort `Recommendation: continue`,
`Confidence: medium` samt Begründung und das `Last audit`-Datum — das sind
Bewertungen aus dem echten Audit-Durchgang vom 2026-09-22, und die stillschweigend
neu zu datieren hätte einen Audit vorgetäuscht, der nicht stattfand. Ein
Klammersatz direkt im Kopf macht diese Trennung für den nächsten Leser
ausdrücklich.

**Nachtrag 2 (Fix Round 2, Koordinator-Review):** Drei weitere Befunde, alle
vom Koordinator-Review gefunden, nicht selbst:

1. **Wichtig — zeitlich unmögliche Aussage.** Der Klammersatz aus Nachtrag 1
   hatte `./scripts/verify.sh` mit dem Datum `2026-09-20` an die Migrationsspanne
   `0001`-`0071` gekoppelt — `0069` und `0071` existierten am 20. September noch
   nicht, ein Lauf an dem Tag kann diesen Codestand also nicht belegt haben.
   Fehler lag in meiner eigenen Korrektur (ich hatte die Zahlen ausgetauscht,
   aber das zugehörige Datum unverändert gelassen), nicht in der
   Koordinator-Anweisung. Korrigiert auf `2026-09-23` — das Datum, an dem
   `verify.sh` tatsächlich gegen genau diesen Stand grün lief — mit einer
   Klarstellung, dass das ein Testlauf-Datum ist, kein neues Audit-Datum.
2. **Wichtig — Zahlenkorrektur unvollständig gefegt.** `docs/specs/…-design.md`
   hatte die `0071`-Kopfzeile korrekt auf 13 Zusicherungen aktualisiert, aber
   vier Sätze später weiterhin "zwei der zwölf" für den Zwei-Hop-Pfad durch
   `dokument_uebersicht` stehen. Im Vertrag nachgezählt (nicht geschätzt): es
   sind **drei**, nicht zwei — die Fix-Round-2-Zusicherung (BYPASSRLS-Test des
   Tenant-Abgleichs) liest ebenfalls über `dokument_uebersicht`, wurde beim
   ersten Fix aber übersehen, weil sie thematisch als "das Prädikat selbst"
   und nicht als "der Zwei-Hop-Pfad" geführt wird. Beschreibung ergänzt statt
   nur die Zahl erhöht.
3. **Minor.** `page.test.tsx` prüfte die Grenzen-Kopie nur auf der Landingpage,
   obwohl `preise/page.tsx` denselben Text trägt — die Übereinstimmung beider
   Seiten war Konvention, keine geprüfte Eigenschaft. Neuer Test
   `PricesPage > carries the same document store and boundary copy as the
   landing page` spiegelt die Landingpage-Assertions. 524 statt 523 Web-Tests
   seither; `docs/09-tom-art32.md` § 9.6 und die Änderungshistorie entsprechend
   nachgezogen.

## Handfester Fahrplan

| Reihenfolge | Schritt | Datei/Bereich | Warum? | Freigabe nötig? |
| --- | --- | --- | --- | --- |
| 1 | Cloud-Migrationsstand abgleichen (`supabase migration list --linked`) | Betriebsfrage, nicht Code | `0068`-`0071` sind lokal fertig, aber nie ausgerollt worden — der aktuelle Report macht das an drei Stellen (AGENTS.md, TEST_INFRA.md, PROJECT_REALITY.md) explizit sichtbar | ja |
| 2 | `apps/web/e2e/dokumente.spec.ts` erstmals laufen lassen | `apps/web/e2e/dokumente.spec.ts` | Der Spec wurde in Task 5 geschrieben und nur `--list`-geprüft, nie ausgeführt; das ist über sechs Tasks hinweg unverändert der größte offene Beleg-Posten dieses Slices | ja (läuft gegen Cloud) |
| 3 | `PROJECT_REALITY.md`-Kopf (`Recommendation`, `Confidence`-Begründung, `Last audit`-Datum) in einem eigenen, größeren Audit-Durchgang neu bewerten | `PROJECT_REALITY.md` Zeile 3-9 | Die Faktenwerte (Migrationsspanne, pgTAP-Zahl) sind in dieser Task korrigiert; die Bewertung selbst stammt weiterhin vom 2026-09-22-Audit und wurde nicht neu geprüft | nein für das Lesen, ja für den Refresh-Commit |

## Entscheidung für den Nutzer

- Empfohlene Entscheidung: freigeben (Commit dieser Task)
- Begründung: Ausschließlich Dokumentation und Produkttexte, keine Schema-, RLS- oder Sicherheitsänderung; `verify.sh` und `just test-db-all` sind grün, `page.test.tsx` pinnt die neue Aussage explizit.
- Nächste Nutzeraktion: Commit ist bereits erstellt (siehe Git-Status unten für den Hash); bei Gelegenheit den Cloud-Migrationsabgleich und den ersten `dokumente.spec.ts`-Lauf freigeben.

## Findings

| Status | Priorität | Problem | Evidenz | Auswirkung | Konkreter Schritt | Begründung |
| --- | --- | --- | --- | --- | --- | --- |
| SUPPORTED | P1 | Landingpage/Preisseite behaupteten „keine Dokumentenablage", obwohl seit Task 3/4 eine existiert | `apps/web/src/app/page.tsx:293` (alt), `preise/page.tsx:87` (alt) | Falschaussage gegenüber Besuchern; Vertrauensschaden bei einem Portfolio-Stück, dessen Anspruch Ehrlichkeit ist | Neue Formulierung mit § 18 Abs. 4 WEG-Grenze eingefügt, Test angepasst | Genau der Auftrag von Task 6, Step 1 |
| SUPPORTED | P1 | `docs/plans/2026-09-22-dokumentenablage.md` beschrieb ein System, das so nicht gebaut wurde (u. a. `private._aufbewahrung_jahre`, andere Upload-Reihenfolge, Kompensation, die es nicht geben kann) | Vergleich Plan-SQL/Code gegen `infra/supabase/migrations/0069_dokumentenablage.sql`, `apps/web/src/app/(dashboard)/wegs/[id]/dokumente/actions.ts`, `apps/web/src/modules/dokumente/{form,upload}.ts`; Rulings 5, 10, 11, 16, 20 in `progress.md` | Ein Leser des Plans würde eine nicht existierende Funktion, eine falsche Schreibreihenfolge und eine unmögliche Storage-Löschung für real halten | „Abweichungen zwischen Plan und Umsetzung" oben im Plan ergänzt, betroffene Passagen mit Inline-Hinweisen markiert (nicht stillschweigend umgeschrieben) | Explizite Aufgabe „CARRIED ITEM" |
| SUPPORTED | P2 | `docs/specs/2026-09-22-dokumentenablage-design.md` trug noch `Status: entworfen, nicht umgesetzt` und nannte für `0071` 12 statt 13 Zusicherungen | Kopfzeile Zeile 4; `infra/supabase/tests/0071_aufbewahrung_effektiv.sql:42` zeigt `select plan(13)` | Der Spec-Kopf widersprach dem tatsächlichen Umsetzungsstand; die Zusicherungszahl war seit Fix Round 2 (Commit `7154626`) veraltet, weil dieser Commit die Sicht, nicht die Spec, änderte | Status- und Zusicherungszahl korrigiert | Nicht explizit im Task-6-Brief gelistet, aber von der Selbstprüfungsfrage „behauptet ein Dokument etwas, das der Code widerlegt?" verlangt |
| SUPPORTED | P2 | `AGENTS.md` Commands-Block nannte `just test-audit-db` mit veralteter Vertragsliste (`0002, 0046, 0055, 0058, 0059, 0068`) — `0069` und `0071` fehlten | `justfile:19` (`AUDIT_DB_TESTS`) vs. `AGENTS.md` Zeile 46 (alt) | Ein Nutzer, der dem Kommentar vertraut, unterschätzt, was `just test-audit-db` tatsächlich prüft | Liste ergänzt | Teil von „Zahlen und Stand nachziehen" |
| SUPPORTED | P2 | `TEST_INFRA.md` maß die RLS-Katalogprüfung gegen „63 von 63 Tabellen" (Migrationsstand `0067`) — seit `0069` (`aufbewahrungsregel`) sind es 64 | Live-Messung gegen die lokale Testdatenbank: `select count(*) from pg_class … where relkind in ('r','p') and nspname = 'public'` → `64` | Kleine, aber sachlich falsche Zahl in einer Datei, deren Zweck gerade Zahlengenauigkeit ist | Auf 64 von 64 korrigiert, mit Nennung der neuen Tabelle | Im Rahmen der TEST_INFRA.md-Aktualisierung mitgeprüft |
| SUPPORTED | P3 | `docs/09-tom-art32.md` § 9.6 nannte in derselben Zeile, die den pgTAP-Fix trug, noch „452 Unit- und Modultests" — direkt neben der gerade korrigierten Vertragszahl, also besonders auffällig | `just test-web` aktuell: `Tests 523 passed (523)` | Zwei Zahlen in derselben Tabelle, eine korrigiert, eine übersehen, wäre inkonsistenter gewesen als vorher | Auf 523 korrigiert, Änderungshistorie-Eintrag ergänzt | Beim Redigieren derselben Tabellenzeile aufgefallen, nicht Teil der ursprünglichen Brief-Liste |
| SUPPORTED | P2 | `PROJECT_REALITY.md`-Kopf (Zeile 5, „15 gruene pgTAP-Vertraege", `0001-0067`) nannte Fakten, die der Code widerlegt — sieben Migrationen und vier Verträge hinter dem echten Stand | `just test-db-all` aktuell: `Files=19, Tests=355`; Kopf nannte 15/`0001-0067` | Genau die Art Widerspruch, die der ganze Task-6-Auftrag beheben soll — ursprünglich fälschlich als außerhalb des Scopes eingestuft (Koordinator-Korrektur) | Migrationsspanne und Vertrags-/Zusicherungszahl im Kopf korrigiert; `Recommendation`, `Confidence`-Begründung und `Last audit`-Datum bewusst unangetastet (echte Bewertung, kein Faktenwert), mit erklärendem Klammersatz direkt im Kopf | Fakten vs. Urteil sauber getrennt: Zahlen korrigierbar ohne neuen Audit, Bewertung nicht |
| SUPPORTED | P1 | `PROJECT_REALITY.md`-Kopf koppelte nach meiner eigenen Fix-Round-1-Korrektur die neue Migrationsspanne `0001`-`0071` mit dem unveränderten Datum `2026-09-20` für `./scripts/verify.sh` — `0069`/`0071` existierten an dem Tag noch nicht, die Aussage war zeitlich unmöglich | `0069` und `0071` committet am 2026-09-23 laut `git log`; Koordinator-Review fand den Widerspruch | Ein Leser hätte einen Beleg für unmöglich existierenden Code angenommen — derselbe Fehlertyp wie die ursprüngliche „keine Dokumentenablage"-Behauptung, nur subtiler (im Datum versteckt statt in der Zahl) | Datum auf `2026-09-23` korrigiert (der tatsächliche Testlauf-Tag), mit Klarstellung „Testlauf-Datum, kein Audit-Datum" | Eigener Fehler in Fix Round 1: Zahl und Datum gehören zusammen, nur eines zu ändern erzeugt einen neuen Widerspruch |
| SUPPORTED | P2 | `docs/specs/…-design.md` behielt nach der 12→13-Korrektur der `0071`-Kopfzeile vier Sätze später „zwei der zwölf" für den Zwei-Hop-Pfad durch `dokument_uebersicht` | Im Vertrag `infra/supabase/tests/0071_aufbewahrung_effektiv.sql` nachgezählt: Abschnitte 3b, 6b **und** 7 (BYPASSRLS) lesen alle über `dokument_uebersicht` — drei, nicht zwei | Die Zahlenkorrektur hatte den Satz direkt darunter nicht mitgezogen — eine Korrektur, die im selben Absatz einen neuen Widerspruch stehen lässt | Auf „drei der 13" korrigiert, Beschreibung um die dritte (Fix-Round-2-)Zusicherung ergänzt statt nur die Zahl erhöht | Koordinator-Vorgabe ausdrücklich: zählen, nicht schätzen |
| SUPPORTED | P3 | `page.test.tsx` prüfte die Grenzen-Kopie nur auf `LandingPage`, obwohl `preise/page.tsx` denselben Text trägt — Übereinstimmung war Konvention, keine geprüfte Eigenschaft | `describe("PricesPage", …)` hatte vor diesem Fix keine Assertion auf den Dokumentenablage-/Grenzen-Text | Eine künftige Änderung an nur einer der beiden Seiten würde nicht auffallen | Gespiegelte Assertion in `PricesPage` ergänzt (524 statt 523 Web-Tests); `docs/09-tom-art32.md` nachgezogen | Koordinator-Minor, direkt umgesetzt |

## Geänderte Dateien

- `apps/web/src/app/page.tsx`: Grenzenzeile gekürzt, neuer dritter Block „Dokumentenablage für die Verwaltung" mit § 18 Abs. 4 WEG-Grenze, Grid von 2 auf 3 Spalten
- `apps/web/src/app/preise/page.tsx`: dieselbe Änderung, gespiegelt; `FileText`-Import ergänzt
- `apps/web/src/app/__tests__/page.test.tsx`: neuer Test pinnt die Dokumentenablage-Aussage samt § 18 Abs. 4 WEG-Grenze; bestehender Grenzen-Test auf die gekürzte Zeile angepasst; **Nachtrag (Fix Round 2):** gespiegelte Assertion in `PricesPage` ergänzt, damit `preise/page.tsx` und `page.tsx` nicht nur per Konvention, sondern geprüft in Übereinstimmung bleiben (524 statt 523 Web-Tests)
- `AGENTS.md`: „Aktueller Stand" auf `0001–0071` erweitert, neuer Absatz zur Dokumentenablage (inkl. „kein Eigentümerportal", unausgeführter E2E-Spec), Cloud-Stand-Hinweis auf `0068`-`0071` präzisiert, `test-audit-db`-Kommentar korrigiert
- `TEST_INFRA.md`: Migrationsspanne `0001–0071`, neuer Bulletpoint für `0069`-`0071`, Vertragszahl 24/19/355, RLS-Katalog-Messung auf 64/64, E2E-Zeile ergänzt um `dokumente.spec.ts`-Status
- `PROJECT_REALITY.md`: Implemented-Absatz um Dokumentenablage erweitert (mit § 18 Abs. 4-Grenze und E2E-Status), „Dokumentenablage" aus der Partially-implemented-Grenzenliste entfernt, Not-verified-Absatz um `0068`-`0071`-Rollout-Lücke und den nie gelaufenen E2E-Spec ergänzt, Next-Logical-Step Punkt 2 um Migrations-Rollout und ersten E2E-Lauf ergänzt; **Nachtrag:** Kopf (Zeilen 3-9) korrigiert — Migrationsspanne `0001-0071`, pgTAP-Zahl 19/355 statt 15/`0001-0067`, mit Klammersatz, dass nur Faktenwerte korrigiert wurden und `Recommendation`/`Confidence`/`Last audit` unangetastet bleiben; zusätzlich die bis dahin übersehene RLS-Katalog-Zahl im Implemented-Absatz selbst („16 Verträge/324 Zusicherungen/63 von 63 Tabellen" → 19/355/64 von 64); **Nachtrag 2 (Fix Round 2):** das an die neue Migrationsspanne gekoppelte Datum `2026-09-20` (zeitlich unmöglich für `0069`/`0071`, committet erst am 23.) auf `2026-09-23` korrigiert, mit Klarstellung „Testlauf-, kein Audit-Datum"
- `docs/09-tom-art32.md`: § 9.6 Vertragszahl/Zusicherungen auf 19/355, Änderungshistorie-Eintrag für 2026-09-23 ergänzt; **Nachtrag (Fix Round 2):** Anwendungstests-Zeile und Änderungshistorie von 523 auf 524 nachgezogen (neuer Test in `page.test.tsx`)
- `docs/plans/2026-09-22-dokumentenablage.md`: neuer Abschnitt „Abweichungen zwischen Plan und Umsetzung" (8 nummerierte Punkte + Vollständigkeits-Check zu „25 MB"), File-Structure-Tabelle korrigiert/ergänzt, sieben Inline-Annotationen an den betroffenen Plan-Passagen (Global Constraints, Task-1-Interfaces, Vertrag/Migration-Codeblöcke, Task-3-actions.ts-Block, Task-4-Files-Liste)
- `docs/specs/2026-09-22-dokumentenablage-design.md`: Status-Kopf von „entworfen, nicht umgesetzt" auf „umgesetzt" korrigiert, `0071`-Zusicherungszahl von 12 auf 13 korrigiert (nicht im Brief gelistet, beim Selbst-Review gefunden); **Nachtrag (Fix Round 2):** die Folgezeile „zwei der zwölf gehen den Zwei-Hop-Pfad" auf „drei der 13" korrigiert (im Vertrag nachgezählt: Abschnitte 3b, 6b, 7), Beschreibung um die dritte (BYPASSRLS-)Zusicherung ergänzt
- `docs/agent-reports/2026-09-23-worker-general-dokumentenablage.md`: dieser Report (neu, seither zweimal um Fix-Round-Nachträge erweitert)

## Betroffene Systembereiche

- RLS/Audit/HMAC/Migrationen: nein (keine SQL-Datei geändert; `just test-db-all` nur zur Verifikation gelaufen)
- Web-App/Fachmodule: ja, nur Produkttexte (`page.tsx`, `preise/page.tsx`) und der zugehörige Test
- Agent/Guardrails/RAG: nein
- Meetings/Votes/Beschluss-Sammlung: nein
- Finance/Hausgeld: nein
- CI/Tooling/Dokumentation: ja, sieben Markdown-Dateien

## Architektur- und Securitycheck

- RLS/Tenant-Isolation berührt? nein
- Audit/HMAC/Append-only berührt? nein
- Migrationen berührt? nein
- Agent-Write-Grenzen berührt? nein
- Remote-/Cloud-Systeme berührt? nein (kein `db-migrate`, kein `--linked`, kein `just e2e` ausgeführt)
- ADR oder Decision-Eintrag erforderlich? nein

## Ausgeführte Checks

| Check | Ergebnis | Hinweis |
| --- | --- | --- |
| `pnpm vitest run src/app/__tests__/page.test.tsx` | pass | 4/4, inkl. der beiden neuen/angepassten Landingpage-Tests |
| `just test-db-all` | pass | `Files=19, Tests=355` — unverändert, da keine SQL-Datei angefasst wurde; nur zur Bestätigung der im Bericht verwendeten Zahlen gelaufen |
| `./scripts/verify.sh` (1. Lauf) | pass | Lint, Typecheck, `just test` (523 Web- + 80 Agent-Tests), `just build`, `git diff --check`, Whitespace-Check; PROJECT_REALITY-Freshness lief informativ und meldete STALE (13 undokumentierte Commits — erwartet, weil der Refresh-Commit dieser Task noch nicht existierte) |
| Visuelle Prüfung `/` und `/preise` im Browser (lokaler Dev-Server) | pass | Neuer Drei-Spalten-Block rendert korrekt, Text umbricht sauber, kein Layout-Bruch |
| `./scripts/verify.sh` (2. Lauf, nach dem 1. Koordinator-Nachtrag) | pass | Erneut Lint/Typecheck/Test/Build grün; PROJECT_REALITY-Freshness jetzt `OK: kein Staleness-Schwellenwert ueberschritten` — `Letzter Refresh: 2026-09-23 (amended Commit), vor 0 Tag(en)`, `Produktcode-Commits seither: 0` |
| `pnpm vitest run src/app/__tests__/page.test.tsx --reporter=verbose` (nach Fix Round 2) | pass | 5/5 — neue `PricesPage`-Assertion inklusive |
| `just test-web` (nach Fix Round 2) | pass | `Tests 524 passed (524)`, 64 Dateien — bestätigt die eine neue Assertion, keine unerwartete Verschiebung |
| `./scripts/verify.sh` (3. Lauf, nach Fix Round 2) | pass | Erneut vollständig grün (Lint, Typecheck, Test, Build, `git diff --check`, Whitespace-Check); PROJECT_REALITY-Freshness weiterhin `OK` — `Letzter Refresh: 2026-09-23 (amended Commit), vor 0 Tag(en)`, `Produktcode-Commits seither: 0` |

## Git-Status

- Dateien gestaged? ja, alle zehn betroffenen Dateien
- Commit erstellt? ja — Subject „docs: bring copy and project docs in line with the document store" (Task-6-Auftrag verlangt den Commit explizit in Step 4, inkl. der `git commit`-Zeile); beide Koordinator-Nachträge (Fix Round 1 und 2) wurden in denselben Commit amended, nicht als weitere Commits angehängt, damit die Dokumentationspflicht „alles in einem Commit" eingehalten bleibt. Aktueller Hash: siehe `git log -1` im Repository — wird hier bewusst nicht fest verdrahtet, weil jeder weitere Amend ihn ändert.
- Push ausgeführt? nein
- Wenn nein: Was fehlt für Commit/Push? Push war nie Teil des Auftrags
- Vorgeschlagene Stage-Dateien: alle zehn geänderten/neuen Dateien (siehe `git status` oben) — bereits gestaged und committet
- Bewusst ausgeschlossene Dateien: keine
- Vorgeschlagene Commit-Message: `docs: bring copy and project docs in line with the document store`
- Push-Ziel: nicht relevant (kein Push beauftragt)

## Security-Check

- Secrets gelesen oder ausgegeben? nein
- Produktive Daten berührt? nein
- Externe Dienste kontaktiert? nein (lokaler Dev-Server gegen die konfigurierte Cloud-DB nur für zwei rein statische, unauthentifizierte Marketingseiten geöffnet; keine Schreiboperation)
- Sensible Daten geloggt? nein

## Bewusst nicht geändert

- `PROJECT_REALITY.md` Zeile 3 (`Last audit: 2026-09-22`), Zeile 4 (`Recommendation: continue`) und der Bewertungsteil von Zeile 5-9 (`Confidence: medium` samt Begründung, inkl. des Cloud-Absatzes zu `0061`-`0067`) — das sind Urteile aus dem echten Audit-Durchgang vom 2026-09-22, keine Faktenwerte. Nur die darin zitierten Zahlen (Migrationsspanne, pgTAP-Anzahl) wurden korrigiert, mit einem eigenen Klammersatz, der genau das festhält, damit kein Leser einen stillschweigend neuen Audit unterstellt. (Ursprünglich hatte ich den gesamten Kopf inkl. der Zahlen als außerhalb des Scopes eingeordnet — nach Rückmeldung des Koordinators korrigiert: Zahlen sind Fakten, keine Bewertung.)
- `docs/09-tom-art32.md` § 9.1 („61 auf 63 von 63 Tabellen") — explizit als historische Momentaufnahme „gemessen gegen Migrationsstand `0067`" formuliert, keine Live-Behauptung; bewusst nicht auf 64 hochgezählt, weil das die dokumentierte Vorher/Nachher-Erzählung des Abschnitts verfälschen würde. § 9.6 (Vertragszahlen) wurde dagegen aktualisiert, weil dort keine Zeitbindung an `0067` besteht.
- `docs/09-tom-art32.md` Kopfzeile „Stand: 20. September 2026, Migrationsstand `0067`" — folgt der im Dokument selbst etablierten Konvention (Kopf = Erstfassungs-Metadaten, laufende Änderungen ausschließlich über die Änderungshistorie-Tabelle am Ende); dieselbe Konvention wurde beim `0068`-Update nicht angetastet.
- Keine Filter-UI für `/wegs/[id]/dokumente` nachgerüstet — außerhalb des Task-6-Scopes (Produkttexte/Doku), bereits in Task 3 und der Spec-Fußnote als bewusste Lücke dokumentiert.
- `apps/web/e2e/dokumente.spec.ts` wurde nicht ausgeführt — bleibt freigabepflichtig (Cloud), wie in Ruling 2/25 festgelegt.

## Risiken

| Risiko | Bedeutung | Nächster Schritt |
| --- | --- | --- |
| `apps/web/e2e/dokumente.spec.ts` ist über alle sechs Tasks hinweg nie gelaufen | Der zentrale Beweis „die Frist ist Daten, kein Code" (Test 3) ist unbelegt; ein Fehler im Zusammenspiel von Upload, Sicht und Einstellungsseite würde erst beim ersten echten Lauf sichtbar | Freigabe für einen einzelnen, gezielten `dokumente`-Lauf einholen, nicht die volle `just e2e`-Suite |
| `0068`-`0071` sind lokal fertig, aber nie in die Cloud ausgerollt | Cloud und lokaler Code laufen seit vier Migrationen auseinander; jede Aussage über den Cloud-Zustand der Dokumentenablage ist unbelegt | `supabase migration list --linked` (freigabepflichtig), danach `just db-migrate` (freigabepflichtig) |
| `PROJECT_REALITY.md`-Kopf trägt weiterhin eine `Confidence`-Bewertung vom 2026-09-22, obwohl seither vier weitere lokale Migrationen (`0068`-`0071`) dazukamen, die dieser Audit noch nicht gesehen hat | Die Zahlen sind jetzt korrekt, aber die Bewertung „medium" wurde nicht gegen den neuen lokalen Stand geprüft — könnte zu optimistisch oder zu vorsichtig sein | Nächster größerer/riskanter Task sollte einen echten Audit-Durchgang nachholen, der die Bewertung selbst neu trifft, wie in `AGENTS.md` vorgesehen |

## Folgeaufgaben

| Priorität | Aufgabe | Begründung |
| --- | --- | --- |
| P1 | `apps/web/e2e/dokumente.spec.ts` erstmals gegen die Cloud laufen lassen | Einziger unbelegter Teil der gesamten Dokumentenablage-Funktionalität |
| P2 | Cloud-Migrationsstand abgleichen und `0068`-`0071` ausrollen | Vier lokale Migrationen ohne Cloud-Nachweis, Risiko wächst mit jeder weiteren |
| P3 | `PROJECT_REALITY.md`-Kopf-Bewertung (`Recommendation`, `Confidence`, `Last audit`) in einem eigenen Audit-Durchgang neu treffen | Die Faktenwerte sind seit diesem Task korrekt; die Bewertung selbst stammt weiterhin vom 2026-09-22-Audit und hat die vier neuen Migrationen `0068`-`0071` nicht gesehen |
