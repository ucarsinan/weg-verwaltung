# WEG-Verwaltung Agent Report

Datum: `2026-09-23`
Agent/Rolle: `Claude Sonnet 5 (worker, general — Dokumentation nachtragen)`
Task: `Agent-Report für die SECURITY-DEFINER-Funktion public.dokument_entfernen (0072) und die Upload-Reihenfolge-Härtung (9ab0917) nachtragen`
Betroffener Worker-Bereich: `docs/agent-reports/` (Worker F), inhaltlich A (Migration/RLS) und B (Server Action) — kein passender Einzelbereich, daher `general`

## Kurzfazit

Erledigt. Dieser Report dokumentiert nachträglich die beiden riskantesten Commits
des Branches (`9507a53`, `9ab0917`), die bisher keinen eigenen Agent-Report
hatten, obwohl `9507a53` eine neue `SECURITY DEFINER`-Funktion einführt, die
eine RLS-SELECT-Policy umgeht — genau der Fall, für den `AGENTS.md` einen
Report verlangt. Alle Zahlen und Zitate stammen aus gelesenen Dateien, `git
show` oder — dort ausdrücklich als solche gekennzeichnet — einer direkten
Koordinator-Mitteilung in dieser Session; nichts ist geschätzt. Es wurde nur
diese Datei neu angelegt plus ein Verweis in `AGENTS.md`; Code, Migrationen
und Tests sind unverändert.

## Was bedeutet das?

Ein Dokument aus der Liste zu entfernen war bis `0072` technisch unmöglich,
nicht nur fehlerhaft: PostgreSQL prüft bei einem `UPDATE` die SELECT-Policy
auch gegen die neue Zeile, und die SELECT-Policy von `public.document`
verlangt `deleted_at is null` — ein Soft-Delete widerspricht sich damit
selbst. Der Nutzer hat entschieden, diese Policy nicht anzufassen und
stattdessen eine eng geschnittene, DB-seitig geprüfte Funktion einzuführen,
die den Mandanten selbst auflöst statt ihn als Parameter entgegenzunehmen.
Ein Reviewer hat jede einzelne Zusicherung dieser Funktion durch einen
gezielt kaputt gemachten Vertrag rot gesehen, bevor er sie grün abgenommen
hat. Offen bleibt: kein Ende-zu-Ende-Test (`just e2e`) hat den Pfad je
durchlaufen, die Cloud kennt die Funktion nicht, und die Agenten-Sperre in
der Funktion ist heute nicht erreichbar, weil die Agent-Laufzeit den dafür
nötigen Header nicht setzt.

## Handfester Fahrplan

| Reihenfolge | Schritt | Datei/Bereich | Warum? | Freigabe nötig? |
| --- | --- | --- | --- | --- |
| 1 | `_inject_actor_type_header` implementieren | `apps/agent/app/tools/runtime.py:160-178` | Erst dann setzt irgendein Agent-Aufruf `X-Actor-Type`, und die vier `actor_type`-Sperren (inkl. `dokument_entfernen`) greifen auch außerhalb der DB-Ebene | ja, vor dem ersten schreibenden Agent-Werkzeug zwingend |
| 2 | Katalogweiten Definer-Guard entwerfen (Positivliste analog `0000_rls_katalog.sql`) | `infra/supabase/tests/0055_advisor_hardening.sql` bzw. neue Migration/Test | Aktuell wird jede `authenticated`-aufrufbare `SECURITY DEFINER`-Funktion einzeln aufgezählt; eine dreizehnte fiele keinem Vertrag auf | nein für den Entwurf, ja für eine neue Migration/Policy |
| 3 | `just e2e` gezielt für `dokumente.spec.ts` freigeben | `apps/web/e2e/dokumente.spec.ts` | Einziger Test, der `dokument_entfernen` über die echte Oberfläche und echte RLS ausführt; bisher nur `--list`-geprüft | ja (Cloud) |
| 4 | Cloud-Migrationsstand verifizieren | `supabase migration list --linked` | Cloud steht laut `AGENTS.md` auf `0067`; `0068`-`0072` inkl. `dokument_entfernen` existieren nur lokal | ja (Cloud-Kommando) |

## Entscheidung für den Nutzer

- Empfohlene Entscheidung: freigeben
- Begründung: Reine Dokumentation eines bereits abgeschlossenen, verifizierten Arbeitsschritts; keine Migration, keine RLS-Änderung, kein Code-Diff außer dem neuen Report und einem Querverweis in `AGENTS.md`. `./scripts/verify.sh` lief zur Bestätigung erneut.
- Nächste Nutzeraktion: Commit freigeben (bereits erstellt, siehe Git-Status); die vier Fahrplan-Schritte oben einzeln freigeben, wenn gewünscht.

## Findings

| Status | Priorität | Problem | Evidenz | Auswirkung | Konkreter Schritt | Begründung |
| --- | --- | --- | --- | --- | --- | --- |
| SUPPORTED | P1 | `9507a53` (neue `SECURITY DEFINER`-Funktion, RLS-Umgehung per Konstruktion) hatte keinen eigenen Agent-Report, obwohl `AGENTS.md` genau das für Security/RLS/Migrationen verlangt | `AGENTS.md` „Wann ist ein Report Pflicht?" (Security/RLS/Migrationen); einziger Report des Branches war `2026-09-23-worker-general-dokumentenablage.md`, der laut eigenem Kopf nur `docs/`-Produkttexte betrifft (Commit `ecbaa42`), nicht `9507a53`/`9ab0917` | Die riskanteste Änderung des Branches war ungeprüft dokumentiert; ein Reviewer ohne Zugriff auf die (untracked) SDD-Notizen hätte die Beweisführung nicht nachvollziehen können | Diesen Report anlegen (geschehen) | Schließt die Lücke, ohne die untracked Prozessnotizen 1:1 zu kopieren |
| SUPPORTED | P1 | Der Soft-Delete war strukturell unmöglich: `document_select_own_tenant` (`0015:192-194`) filtert `deleted_at is null`, PostgreSQL prüft die SELECT-Policy auch gegen die neue UPDATE-Zeile | `infra/supabase/migrations/0015_dokumente.sql:192-194`; `infra/supabase/migrations/0072_dokument_entfernen.sql:11-27` (Kopfkommentar, gemessen als `authenticated` gegen die echte Tabelle, mit und ohne `RETURNING`); Commit-Message `9507a53` | Beide Schreibpfade (`loescheDokumentAction`, Upload-Kompensation) scheiterten mit `42501`; ein Dokument war weder entfernbar noch löschbar | Migration `0072`: Schreibpfad über `public.dokument_entfernen` statt direktes `UPDATE` | Einzige Möglichkeit, den Soft-Delete lauffähig zu machen, ohne die SELECT-Policy zu ändern |
| SUPPORTED | P2 | Das `RETURNING`, das PostgREST für `.select()` erzeugt, ist **nicht** die Ursache — der Fehler tritt auch bei einem reinen `UPDATE` ohne `RETURNING` auf | `0072_dokument_entfernen.sql:25-27`: „ohne RETURNING. Das RETURNING ist NICHT die Ursache"; `.superpowers/sdd/2026-09-22-dokumentenablage/task-7-report.md` Teil 1 | Eine naheliegende, aber falsche Erklärung („nur das RETURNING ist schuld") hätte zu einem unvollständigen Fix geführt | Beide Aufrufer (mit und ohne `RETURNING`) auf die RPC umgestellt | Verifiziert durch gezielte Messung, nicht angenommen |
| SUPPORTED | P1 | Entscheidung: SELECT-Policy bleibt unverändert, stattdessen `SECURITY DEFINER`-Funktion — ausdrücklich vom Nutzer freigegeben, `AGENTS.md` verlangt das für Änderungen dieser Art | `.superpowers/sdd/2026-09-22-dokumentenablage/progress.md:555-562` („Nutzerentscheidung (2026-09-23)"); `0072_dokument_entfernen.sql:32-37` (Kopfkommentar: „vom Nutzer ausdruecklich freigegeben") | Die Datenbank garantiert weiterhin selbst, dass ein entferntes Dokument unsichtbar ist — die Garantie wandert nicht in Anwendungscode | Keiner (bereits umgesetzt) | Dokumentationspflicht aus `AGENTS.md`: Anweisung und Scope explizit festhalten |
| SUPPORTED | P3 | Dem Nutzer wurden drei Vorwärts-Fix-Optionen vorgelegt, nicht zwei; gewählt wurde Option 1, die `SECURITY-DEFINER`-Funktion | Wortlaut laut Koordinator-Mitteilung in dieser Session (nicht in einer Repository-Datei protokolliert): 1) `SECURITY-DEFINER`-Funktion (Empfehlung) — SELECT-Policy unverändert, eng geschnittene Funktion mit explizitem Tenant-Abgleich und gepinntem `search_path`; 2) `deleted_at is null` aus der SELECT-Policy nehmen — Sichtbarkeitsfilterung wandert in Sicht/Queries, macht den bekannten Minor „`dokument_uebersicht` filtert `deleted_at` nicht" tragend; 3) `dokument_entfernen` vorerst ausbauen — Button/Action entfernen, Kompensation streichen, kein RLS-Risiko, dafür bleiben Fehlanhänge und Upload-Waisen dauerhaft in der Liste. Die getrackten Notizen erfassen nur Optionen 1 und 2, dort als „Weg 2"/„Weg 1" bezeichnet (`final-review.md:123-140`) bzw. als getroffene Entscheidung (`progress.md:555-562`) — Option 3 fehlt dort vollständig | Die getroffene Entscheidung war bereits vorher korrekt belegt; nur die Optionsanzahl war aus dem Repository allein nicht rekonstruierbar. Laut Koordinator eine Lücke im eigenen Ledger, nicht in der Lesart dieses Reports — genau die Art Lücke, die eine Entscheidung im Nachhinein unrekonstruierbar macht | Finding korrigiert: drei statt zwei Optionen, mit Quellenangabe Koordinator-Mitteilung statt Repository-Datei | Herkunft jeder Tatsachenbehauptung bleibt sichtbar: diese Tatsache stammt aus einer direkten Mitteilung in der Session, nicht aus einer gelesenen Datei — die Unterscheidung wird nicht verwischt |
| SUPPORTED | P2 | `SECURITY DEFINER` mit `search_path = ''`, vollständig qualifizierter Funktionskörper, Grants nur an `authenticated`, Tenant im Funktionskörper aufgelöst statt als Parameter — folgt exakt dem Muster von `activate_wirtschaftsplan` | `infra/supabase/migrations/0072_dokument_entfernen.sql:128-198`; Vergleich `infra/supabase/migrations/0047_*.sql:145-146,458-460` (`security definer`, `set search_path = ''`, `revoke all` + gezielter `grant execute` an `authenticated`) | Konsistentes Sicherheitsmuster im Katalog, kein Einzelfall mit eigenen Regeln | Keiner (bereits umgesetzt) | Nachvollziehbarkeit für künftige Definer-Funktionen |
| SUPPORTED | P1 | Jede sicherheitsrelevante Eigenschaft der Funktion wurde einzeln rot gesehen, bevor sie grün abgenommen wurde (nicht nur gelesen) | `.superpowers/sdd/2026-09-22-dokumentenablage/task-7-report.md` Teil 1, Tabelle „Eigenschaft / RED-Nachweis": Tenant-Abgleich (Zusicherung 21: `have: true, want: false` ohne Prädikat), `weg_id`-Pflicht (Zusicherung 18), Agent-Guard (Zusicherung 19: `caught: no exception, wanted: 42501`), `deleted_at is null`/Idempotenz (Zusicherungen 25/26), Grants (Zusicherung 17), Audit-Trail (Zusicherung 26 mit gedropptem Trigger) | Eine grün abgenommene, aber vakuose Zusicherung wäre ein Sicherheitsversprechen ohne Beweis (siehe `project_e2e_vacuous_tests` in `MEMORY.md`) | Keiner (bereits umgesetzt) | Genau die Vorgabe „einzeln rot gesehen, nicht nur gelesen" |
| SUPPORTED | P2 | `public.document` trägt keinen `*_block_agent_writes`-Trigger; die Funktion braucht deshalb ihren eigenen Agenten-Guard, der nicht redundant ist | `0072_dokument_entfernen.sql:49-58,141-147`; Vergleich `0069_dokumentenablage.sql:154-158` (Guard hängt nur an `aufbewahrungsregel`) | Ohne den Guard in der Funktion selbst wäre `dokument_entfernen` der einzige ungeschützte Schreibpfad auf `public.document` für Agenten | Keiner (bereits umgesetzt) | Belegt durch Migrationssuche „trigger ... on public.document" mit genau einem Treffer (`document_audit_emit`) |
| SUPPORTED | P1 | `just e2e` ist auf diesem Branch nie gelaufen; der Spec, der `dokument_entfernen` end-to-end ausübt, ist unausgeführt | `AGENTS.md` Zeile 9 („nicht ausgeführt"); `.superpowers/sdd/2026-09-22-dokumentenablage/task-7-report.md` „Grenzen dieser Arbeit"; `task-8-report.md` „Verifikation" | Der einzige Test, der RLS und die Funktion gemeinsam über die echte Oberfläche prüft, hat nie gelaufen | Freigabe für einen gezielten Lauf von `dokumente.spec.ts` einholen (nicht die volle Suite) | Ausdrücklich als offener Beweis-Posten benannt, nicht verschwiegen |
| SUPPORTED | P2 | Cloud steht auf `0067`; `0068`-`0072` (inkl. `dokument_entfernen`) existieren nur lokal | `AGENTS.md` Zeile 11 („0068–0072 sind lokal gebaut und pgTAP-geprüft, aber noch nicht ausgerollt") | Jede Aussage über den Cloud-Zustand der Funktion ist unbelegt | `supabase migration list --linked` (freigabepflichtig), danach ggf. `just db-migrate` | Vor produktionsnahen Aussagen erst verifizieren |
| SUPPORTED | P2 | `database.types.ts` wurde für `dokument_entfernen` von Hand ergänzt, nicht per `just codegen` regeneriert | `apps/web/src/lib/supabase/database.types.ts:1014` (`dokument_entfernen:`); Commit-Message `9507a53` („database.types.ts gains 8 lines"); `task-7-report.md` „Grenzen dieser Arbeit" | Gleiches Muster wie bei den übrigen RPCs dort — Risiko einer künftigen Divergenz zwischen Handschrift und echtem Schema | `just codegen` bei nächster Gelegenheit gegen die laufende Cloud/den laufenden Agent | Dasselbe Verfahren wie bei allen bisherigen RPC-Einträgen in dieser Datei |
| SUPPORTED | P2 | `dokument_entfernen` ist die zwölfte `authenticated`-aufrufbare `SECURITY DEFINER`-Funktion; kein katalogweiter Guard gegen weiteres Wachstum existiert | `AGENTS.md` Backlog-Zeile „authenticated_security_definer_function_executable" (11 zuvor benannte Funktionen + „seit 0072 kommt dokument_entfernen als zwoelfte hinzu"); `infra/supabase/tests/0055_advisor_hardening.sql:1-53` zählt jede Funktion einzeln per `has_function_privilege`-Zusicherung auf, keine Katalog-Zusicherung | Eine dreizehnte Definer-Funktion würde von keinem Vertrag automatisch erfasst | Positivliste analog `0000_rls_katalog.sql` entwerfen (Follow-up, nicht in diesem Report umgesetzt) | Advisor-WARN, vom Nutzer bewusst in Kauf genommen, aber unbegrenzt wachsend |
| SUPPORTED | P1 | `_inject_actor_type_header` ist ein `pass` hinter `TODO(actor-type)` — keine der vier `actor_type`-Sperren (inkl. der neuen in `dokument_entfernen`) wird von der Agent-Laufzeit heute ausgelöst | `apps/agent/app/tools/runtime.py:160-178` (Funktionskörper endet mit `pass` bei Zeile 178, umgeben von `if scope in ("internal_write", "external"): # TODO(actor-type) ... pass`) | Harmlos, solange die Werkzeugoberfläche rein lesend ist; muss vor dem ersten schreibenden Agent-Werkzeug implementiert sein, sonst greift die DB-seitige Sperre nie in der Praxis | Implementieren, bevor ein schreibendes Agent-Werkzeug entsteht | Bereits in `docs/09-tom-art32.md` § 9.4 als „belegt (DB-Seite)" mit genau dieser Einschränkung dokumentiert |
| SUPPORTED | P2 | Die E2E-Residuen sind dauerhaft und wachsen pro Lauf: 3 `weg`, 3 `document`, 4 `document_version`, 4 Storage-Objekte | `AGENTS.md` Zeile 9; `.superpowers/sdd/2026-09-22-dokumentenablage/task-8-report.md`, Tabelle „Nachgezählt (nicht geschätzt)" | Jeder vollständige `dokumente.spec.ts`-Lauf hinterlässt permanenten Datenmüll in der Cloud-Tenant | Kein Code-Fix vorgesehen (würde eine bewusst durchgesetzte Sicherheitseigenschaft umgehen); vor jedem Lauf bewusst machen | `document_version` ist append-only (Trigger, `0015`), beide FKs stehen auf `on delete restrict` |
| SUPPORTED | P2 | `apps/web/scripts/cleanup-e2e-residue.mjs:220` versucht `DELETE FROM document`, scheitert aber strukturell an `document_version_document_fk`; `document_version` und Storage werden gar nicht erst versucht | `apps/web/scripts/cleanup-e2e-residue.mjs:220` (`await bulkStep("document", () => deleteChunked("document", "weg_id", wegIds));`); `task-8-report.md` „Finding 2" (Korrektur der Prämisse „kein Skript existiert") | Der Aufräumversuch ist in der Praxis totes Programm, meldet aber nur `BLOCKED`, bricht nicht ab — kann fälschlich als „funktioniert teilweise" gelesen werden | Kein Fix vorgesehen (gleicher Grund wie oben); Formulierung „kein Cleanup-Skript" wäre ungenau, korrekt ist „ein Skript, das strukturell nichts bewirkt" | Nachgeprüft am Code, nicht nur an der Behauptung |

## Geänderte Dateien

- `docs/agent-reports/2026-09-23-worker-general-dokument-entfernen-definer-rpc.md`: dieser Report (neu)
- `AGENTS.md`: ein Satz mit Querverweis auf diesen Report ergänzt, an der Stelle, die `dokument_entfernen` bereits beschreibt (Zeile 9) und am Backlog-Eintrag zur Definer-Oberfläche (Zeile 88) — folgt dem bestehenden Muster, mit dem `AGENTS.md` bereits auf `docs/agent-reports/2026-07-14-worker-general-cloud-e2e-first-run.md` verweist

## Betroffene Systembereiche

- RLS/Audit/HMAC/Migrationen: nein, nur Dokumentation eines bereits gemergten Standes (keine SQL-Datei geändert)
- Web-App/Fachmodule: nein
- Agent/Guardrails/RAG: nein (nur beschrieben, nicht geändert)
- Meetings/Votes/Beschluss-Sammlung: nein
- Finance/Hausgeld: nein
- CI/Tooling/Dokumentation: ja — neuer Report, ein Querverweis in `AGENTS.md`

## Architektur- und Securitycheck

- RLS/Tenant-Isolation berührt? nein (nur beschrieben)
- Audit/HMAC/Append-only berührt? nein
- Migrationen berührt? nein
- Agent-Write-Grenzen berührt? nein
- Remote-/Cloud-Systeme berührt? nein (kein `db-migrate`, kein `--linked`, kein `just e2e`, kein `just seed-admin` ausgeführt)
- ADR oder Decision-Eintrag erforderlich? nein — die Entscheidung ist bereits in `0072_dokument_entfernen.sql` (Kopfkommentar) und diesem Report festgehalten

## Ausgeführte Checks

| Check | Ergebnis | Hinweis |
| --- | --- | --- |
| `./scripts/verify.sh` | pass | Lint, Typecheck, `just test` (527 Web-Tests/64 Dateien, 80 Agent-Tests passed/5 skipped), `just build`, `git diff --check`, Whitespace-Check; PROJECT_REALITY-Freshness informativ `OK` (letzter Refresh `9ab0917`, vor 0 Tagen, 0 Produktcode-Commits seither); Remote-Checks (`just e2e`, `just db-migrate`, `just seed-admin`, Supabase-Linked) bewusst nicht ausgeführt, wie vom Skript selbst gemeldet |

## Git-Status

- Dateien gestaged? ja
- Commit erstellt? ja — siehe `git log -1`
- Push ausgeführt? nein
- Wenn nein: Was fehlt für Commit/Push? Push war nicht Teil des Auftrags
- Vorgeschlagene Stage-Dateien: `docs/agent-reports/2026-09-23-worker-general-dokument-entfernen-definer-rpc.md`, `AGENTS.md`
- Bewusst ausgeschlossene Dateien: `.superpowers/sdd/2026-09-22-dokumentenablage/*` (untracked Prozessnotizen, bewusst nicht Teil dieses Commits — dieser Report ist die Repository-Aufzeichnung, die Notizen bleiben Arbeitsmaterial)
- Vorgeschlagene Commit-Message: `docs(agent-reports): record the dokument_entfernen security-definer decision`
- Push-Ziel: nicht relevant (kein Push beauftragt)

**Es wurde nichts gepusht.**

## Security-Check

- Secrets gelesen oder ausgegeben? nein
- Produktive Daten berührt? nein
- Externe Dienste kontaktiert? nein
- Sensible Daten geloggt? nein

## Bewusst nicht geändert

- `infra/supabase/migrations/0072_dokument_entfernen.sql`, `infra/supabase/tests/0069_dokumentenablage.sql`, `infra/supabase/tests/0071_aufbewahrung_effektiv.sql` — bereits committet (`9507a53`), nur beschrieben, nicht erneut angefasst.
- `apps/agent/app/tools/runtime.py` (`_inject_actor_type_header`) — als Follow-up dokumentiert, nicht in diesem Report implementiert.
- `infra/supabase/tests/0055_advisor_hardening.sql` — kein katalogweiter Guard ergänzt; nur als offene Lücke benannt.
- `apps/web/scripts/cleanup-e2e-residue.mjs` — nicht angefasst; ein Fix müsste die von `0015` durchgesetzte Sicherheitseigenschaft (append-only, `on delete restrict`) umgehen.
- Kein `just e2e`, `just db-migrate`, `just seed-admin`, `supabase --linked`-Kommando ausgeführt.
- `.superpowers/sdd/2026-09-22-dokumentenablage/*` nicht in dieses Repository-Dokument kopiert — als Quelle gelesen und zitiert, nicht wortwörtlich übernommen.

## Risiken

| Risiko | Bedeutung | Nächster Schritt |
| --- | --- | --- |
| `just e2e` hat den `dokument_entfernen`-Pfad nie durchlaufen | Der einzige Test, der RLS, die Funktion und die UI gemeinsam prüft, ist unausgeführter Code | Gezielten Lauf von `dokumente.spec.ts` freigeben |
| Cloud steht auf `0067`, `dokument_entfernen` existiert dort nicht | Jede Aussage über den Cloud-Zustand ist unbelegt | `supabase migration list --linked` freigeben |
| `_inject_actor_type_header` ist inaktiv | Die Agenten-Sperre in `dokument_entfernen` ist Verteidigung in der Tiefe, kein durchlaufener Pfad | Vor dem ersten schreibenden Agent-Werkzeug implementieren |
| Definer-Oberfläche wächst ohne Katalog-Guard | Eine künftige Funktion Nr. 13 fiele keinem Vertrag auf | Positivliste analog `0000_rls_katalog.sql` entwerfen |
| E2E-Residuum wächst mit jedem Lauf dauerhaft | Cloud-Tenant sammelt unlöschbare Test-Daten | Kein Fix vorgesehen; vor jedem Lauf bewusst freigeben |

## Folgeaufgaben

| Priorität | Aufgabe | Begründung |
| --- | --- | --- |
| P1 | `_inject_actor_type_header` implementieren (`apps/agent/app/tools/runtime.py:160-178`) | Ohne sie feuert keine der vier `actor_type`-Sperren in der Praxis; muss vor dem ersten schreibenden Agent-Werkzeug stehen |
| P2 | Katalogweiten Definer-Guard entwerfen, modelliert auf `0000_rls_katalog.sql` | `0055_advisor_hardening.sql` zählt einzeln auf; unbeschränktes Wachstum der `authenticated`-Definer-Oberfläche |
| P2 | `just e2e` einmal freigegeben laufen lassen | Einziger unausgeführter Beweis-Posten der gesamten Dokumentenablage-Funktionalität |
| P2 | Cloud-Migrationsstand verifizieren (`supabase migration list --linked`) | Cloud und lokaler Code laufen seit fünf Migrationen (`0068`-`0072`) auseinander |
