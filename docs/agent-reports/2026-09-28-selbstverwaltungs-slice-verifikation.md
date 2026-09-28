# WEG-Verwaltung Agent Report

Datum: `2026-09-28`
Agent/Rolle: `Claude (Planner + Worker)`
Task: `Den Selbstverwaltungs-Slice definieren, verifizieren und die Befunde berichten`
Betroffener Worker-Bereich: `E2E-Testinfrastruktur, Finance/Hausgeld (nur lesend)`

## Kurzfazit

Erledigt. Der Slice ist erstmals definiert und belegt: Eine WEG mit sechs
Einheiten trägt von der Anlage bis zur Jahresabrechnung durch — 72
persistierte Sollstellungen, Beträge exakt, Summe gleich Gesamtkosten,
Abrechnungsspitze ausgeglichen. Dabei sind **zwölf Befunde** entstanden, zwei
davon erzeugen still falsches Geld. Nichts wurde repariert; das war die
Entscheidung für diesen Durchgang.

## Was bedeutet das?

Die gute Nachricht zuerst: Der Kernweg funktioniert. Wer eine kleine WEG
anlegt, Einheiten mit vollständigen Miteigentumsanteilen erfasst, einen
Wirtschaftsplan aktiviert und Ausgaben bucht, bekommt am Ende eine
Jahresabrechnung, die aufgeht. Das war vorher nicht belegt.

Die schlechte: Wer dabei einen Fehler macht, erfährt es nicht. Wenn die
Miteigentumsanteile nicht vollständig vergeben sind — etwa weil eine Einheit
vergessen wurde —, verteilt das System die Kosten trotzdem, nur eben zu wenig.
Die Gemeinschaft nimmt dauerhaft weniger Hausgeld ein, als sie ausgibt, und
niemand wird gewarnt. Dasselbe gilt, wenn jemand eine Jahresabrechnung
erstellt, ohne vorher einen Wirtschaftsplan aktiviert zu haben: Dann schuldet
rechnerisch jeder Eigentümer die vollen Jahreskosten als Nachzahlung.

Beide Fälle sind für einen selbstverwaltenden Beirat realistisch — er macht das
einmal im Jahr und hat keine Routine darin. Beide sind jetzt durch Tests
festgehalten, damit sie nicht wieder aus dem Blick geraten.

## Handfester Fahrplan

| Reihenfolge | Schritt | Datei/Bereich | Warum? | Freigabe noetig? |
| --- | --- | --- | --- | --- |
| `1` | MEA-Summe beim Aktivieren prüfen und die Abweichung benennen | `0060` Generator + `wirtschaftsplan-edit-form.tsx` | Befund 1 ist der einzige, der dauerhaft falsches Geld erzeugt | ja (Migration) |
| `2` | Jahresabrechnung ohne aktivierten Plan kenntlich machen | `0063` / `abrechnung/page.tsx` | Befund 2 erzeugt einen falschen Nachschuss über die volle Jahressumme | ja (Migration) |
| `3` | Mandantenlose Nutzer ins Onboarding leiten | `middleware.ts` oder `(dashboard)/layout.tsx` | Befund 3 ist die einzige Sackgasse, aus der ein Nutzer gar nicht herausfindet | nein |
| `4` | Aktivierung sperren, solange die WEG keine Einheiten hat | `wirtschaftsplan-edit-form.tsx:202` | Befund 4 meldet Erfolg und erzeugt nichts | nein |
| `5` | Fehlermeldungen der Aktivierung auffächern | `[planId]/edit/actions.ts:46-64` | Befund 6 schickt den Nutzer bei fehlenden Basiswerten auf die falsche Fährte | nein |

## Entscheidung fuer den Nutzer

- Empfohlene Entscheidung: `freigeben` (nur Tests und Dokumentation)
- Begruendung: Dieser Durchgang ändert kein Verhalten. Er fügt eine Spec hinzu,
  die die Reise künftig nachhält, korrigiert einen Testtitel, der mehr
  versprach als er prüfte, und hält zwölf Befunde fest. Das Risiko ist der
  Datenrückstand im Frankfurt-Mandanten, der bewusst in Kauf genommen wurde.
- Naechste Nutzeraktion: Commit und PR freigeben; danach entscheiden, welche
  Befunde repariert werden — Schritt 1 und 2 des Fahrplans sind die einzigen,
  bei denen es um Geld geht.

## Findings

| Status | Prioritaet | Problem | Evidenz | Auswirkung | Konkreter Schritt | Begruendung |
| --- | --- | --- | --- | --- | --- | --- |
| `SUPPORTED` | `P1` | MEA wird nie auf Vollständigkeit geprüft; der rohe Bruch wird verteilt | `0060:255-268`; Test `selbstverwaltung-mea-luecke` misst 9.000 statt 12.000 € | Die Gemeinschaft erhebt dauerhaft zu wenig Hausgeld, ohne Warnung | Summe der MEA beim Aktivieren prüfen, Abweichung benennen | Fachlich: Es geht um Geld, das nie eingefordert wird |
| `SUPPORTED` | `P1` | Jahresabrechnung ohne aktivierten Plan setzt `soll_vorschuesse` auf 0 | View `abrechnung_spitze` (`0063:668`); Test `selbstverwaltung-abrechnung-ohne-plan` misst Spitze 5.000 € bei 5.000 € Kosten | Jeder Eigentümer erhält die vollen Jahreskosten als Nachschuss ausgewiesen | Beim Erstellen prüfen, ob ein aktiver Plan für das Jahr existiert, und sonst warnen | Fachlich: Eine falsche Zahlungsaufforderung an alle Eigentümer |
| `SUPPORTED` | `P1` | Mandantenloser Nutzer landet in einer Sackgasse mit Entwicklersatz | `(dashboard)/layout.tsx:9-19` prüft nur die Session; `createWeg` lehnt mit „Kein Mandant im aktuellen JWT-Claim." ab | Wer die Bestätigungsmail in einem anderen Browser öffnet, kommt nie ins Onboarding | Mandantenprüfung in `middleware.ts` oder im Dashboard-Layout, Weiterleitung nach `/onboarding` | Wegführung: Der Nutzer kann sich nicht selbst befreien |
| `SUPPORTED` | `P2` | Wirtschaftsplan mit null Einheiten aktivierbar | `wirtschaftsplan-edit-form.tsx:202-215` deaktiviert den Knopf nicht; Generator fügt null Zeilen ein | Erfolg wird gemeldet, es entsteht kein Hausgeld | Knopf sperren, solange keine Einheit existiert | Wegführung: stiller Leerlauf |
| `SUPPORTED` | `P2` | `erstelle_abrechnung` gelingt in einem Jahr ohne Ausgaben | `0063:425-540` | Eine Abrechnung ohne Kostenpositionen entsteht ohne Hinweis | Leeres Jahr abweisen oder deutlich kennzeichnen | Fachlich: ein Dokument, das nichts aussagt |
| `SUPPORTED` | `P2` | Aktivierungsfehler falsch beschriftet | `[planId]/edit/actions.ts:46-64` bildet `23514` auf „Der Statuswechsel ist fachlich nicht erlaubt." ab | Fehlende Basiswerte werden als Statusproblem gemeldet | `23514` nach Ursache auffächern, `0A000` ergänzen | Wegführung: schickt auf die falsche Fährte |
| `SUPPORTED` | `P2` | Verteilungsschlüssel ist unsichtbare Vorbedingung | `position-form.tsx:137,164`; `ausgabe-form.tsx:187` — leeres, deaktiviertes Auswahlfeld, Absendeknopf aktiv | Nutzer klickt, bekommt einen Feldfehler und keinen Weg zur Lösung | Link auf `…/verteilungsschluessel/new` in beide Formulare | Wegführung: Sackgasse mit Ausweg, der nicht gezeigt wird |
| `SUPPORTED` | `P2` | Die Wegführung überspringt die gesamten Finanzen | `wegs/[id]/page.tsx:227-267`: Adresse → Einheiten → Personen → Versammlung | Wer der App folgt, baut nie einen Wirtschaftsplan | Finanzen in die Leiter aufnehmen | Wegführung: die Kernaufgabe fehlt im Vorschlag |
| `SUPPORTED` | `P3` | Versammlung ohne `termin_von` ist eine Sackgasse | `versammlungen/new/actions.ts`; Einladung, Stimmen und Feststellung scheitern danach | Der Fehler zeigt sich erst drei Schritte später | Termin zur Pflicht machen oder früh warnen | Wegführung: späte Rückmeldung |
| `SUPPORTED` | `P3` | `castVote` scheitert als stiller No-Op | `abstimmung/actions.ts:57,76-81,97-103` — `return` ohne Zustand | Die Seite rendert unverändert, niemand erfährt warum | Fehlerzustand zurückgeben | Wegführung: unsichtbares Scheitern |
| `SUPPORTED` | `P3` | Feststellung hat elf Ursachen und eine Meldung | `abstimmung/actions.ts:36-41` | Die am schlechtesten diagnostizierbare Stelle der App | Ursachen auffächern | Wegführung: nicht diagnostizierbar |
| `SUPPORTED` | `P3` | Trial-Ablauf nicht durchgesetzt, `unit_count` nie abgeglichen | `modules/saas/guards.ts` — `requireWritableSubscription` wird nirgends gerufen | Abgelaufene Testphasen schreiben weiter; bezahlte Einheitenzahl ist unverbindlich | Guard einhängen oder die Funktion entfernen | Toter Code, der Sicherheit suggeriert |

### Der Test, der mehr versprach als er prüfte

`scenario-new-weg-onboarding` trug im Titel „verifying Hausgeld/Sollstellung".
Tatsächlich aktiviert er den Wirtschaftsplan nie — und ohne Aktivierung
existiert keine einzige Sollstellung. Geprüft wurde die Live-Vorschau im
Formular (`wirtschaftsplan-form.tsx:176-193`), also eine Berechnung im Browser.

Das ist doppelt heikel, weil Vorschau und Generator (`0060:255-268`) **dieselbe
Formel** benutzen: Eine Zusicherung gegen die Vorschau bestätigt den Generator
auch dann, wenn beide falsch rechnen — genau der Fall aus Befund 1. Die
Moduldoku des Projekts warnt wörtlich vor dieser Klasse
(`e2e/helpers/finanzen.ts:8-10`).

Titel und Kommentare sind korrigiert; der Test bleibt bestehen, weil die
Vorschau prüfenswert ist. Der persistierte Beweis liegt jetzt in
`selbstverwaltung.spec.ts`.

## Geaenderte Dateien

- `apps/web/e2e/selbstverwaltung.spec.ts`: neu — die Reise plus zwei
  Charakterisierungstests für die Geldfehler
- `apps/web/e2e/scenarios.spec.ts`: Titel ehrlich gemacht, Vorschau als solche
  gekennzeichnet, zwei unverankerte URL-Prüfungen (`/finanzen` matchte auch
  `/finanzen/new`) verankert
- `PROJECT_REALITY.md`, `TEST_INFRA.md`, `AGENTS.md`: Slice definiert, Zahlen
  nachgezogen

## Betroffene Systembereiche

- RLS/Audit/HMAC/Migrationen: nicht geändert; RLS wurde implizit mitgeprüft,
  da alle Fixtures unter dem normalen Mandanten-Token laufen
- Web-App/Fachmodule: nicht geändert, nur gelesen
- Agent/Guardrails/RAG: nicht berührt
- Meetings/Votes/Beschluss-Sammlung: nur gelesen (Befunde 9–11)
- Finance/Hausgeld: nur gelesen; Befunde 1, 2, 4, 5, 6 liegen hier
- CI/Tooling/Dokumentation: eine Spec mehr (20 → 21)

## Architektur- und Securitycheck

- RLS/Tenant-Isolation beruehrt? `nein`
- Audit/HMAC/Append-only beruehrt? `nein`
- Migrationen beruehrt? `nein`
- Agent-Write-Grenzen beruehrt? `nein`
- Remote-/Cloud-Systeme beruehrt? `ja` — die Spec läuft gegen Frankfurt und
  hinterlässt Daten
- ADR oder Decision-Eintrag erforderlich? `nein`

## Ausgefuehrte Checks

| Check | Ergebnis | Hinweis |
| --- | --- | --- |
| `just typecheck` | `pass` | tsc und mypy ohne Befund |
| `playwright test selbstverwaltung` | `pass` | 5 von 5 (2 Auth-Setups, 3 Tests), 21,8 s |
| `playwright test scenarios` | `pass` | 7 von 7, 32,0 s — nachgeholt, weil die geänderte Datei zunächst ungeprüft blieb und die CI kein Playwright ausführt |
| `./scripts/verify.sh` | `pass` | siehe Commit |
| `just e2e` (volle Suite) | `skipped` | Nur die beiden berührten Dateien wurden geprüft. Die übrigen 19 Specs sind auf diesem Zweig nicht gelaufen — sie wurden auch nicht angefasst. |

**Zur CI-Abdeckung:** `.github/workflows/` führt kein Playwright aus. Die
grünen PR-Prüfungen decken Lint, Typecheck, Unit-Tests, Codegen-Drift,
SQL-Lint und die pgTAP-Verträge ab — **keinen** E2E-Test. Eine Änderung an
einer Spec-Datei wird also von der CI nicht validiert; das muss von Hand
geschehen und wurde hier nachgeholt.

## Git-Status

- Dateien gestaged? `ja`
- Commit erstellt? `ja`
- Push ausgefuehrt? `nach Freigabe`
- Wenn nein: Was fehlt fuer Commit/Push? Nutzerfreigabe für Push und PR
- Vorgeschlagene Stage-Dateien: die sechs oben genannten
- Bewusst ausgeschlossene Dateien: keine
- Vorgeschlagene Commit-Message:
  `test(e2e): verify the self-management slice end to end and pin two silent money bugs`
- Push-Ziel: `origin/claude/selbstverwaltung-slice-verifikation`

## Security-Check

- Secrets gelesen oder ausgegeben? `nein`
- Produktive Daten beruehrt? `nein` — Demo-Mandant, keine echten
  Eigentümerdaten (Regel aus `AGENTS.md`)
- Externe Dienste kontaktiert? `ja` — Supabase Frankfurt (Testlauf) und das
  Playwright-CDN (Browser-Nachinstallation, nach Freigabe)
- Sensible Daten geloggt? `nein`

## Bewusst nicht geaendert

- **Keine Reparatur.** Nutzerentscheidung für diesen Durchgang; der Fahrplan
  oben benennt die Reihenfolge.
- **Keine Eigentümersicht.** Die Marktrecherche legt sie nahe — jeder Anbieter
  dieses Segments führt mit einem Eigentümerportal, und im Produkt ist der
  Eigentümer bisher ein Datensatz, kein Betrachter (54 von 60 Routen liegen im
  Verwalter-Dashboard). Das ist Breite und gehört in eine eigene Entscheidung.
- **Die Versammlungskette** bleibt bei `versammlungen.spec.ts`, die Oberfläche
  der Jahresabrechnung bei `finanzen-abrechnung.spec.ts`.

## Risiken

| Risiko | Bedeutung | Naechster Schritt |
| --- | --- | --- |
| Datenrückstand wächst je Lauf | Drei WEGs, davon zwei mit unlöschbaren Sollstellungen, pro Durchlauf | Eigener Wegwerf-Mandant; hängt laut Betriebsmodell an Auslöser A |
| Die Charakterisierungstests werden rot, wenn jemand die Fehler behebt | Beabsichtigt, kann aber als Regression missverstanden werden | Kommentar im Test benennt es; beim Beheben mit entfernen |
| Befunde 1 und 2 bleiben offen | Solange nur Demo-Daten betroffen sind, folgenlos — bei echten Eigentümern nicht | Fahrplan Schritt 1 und 2 vor dem ersten echten Mandanten |
| Playwright-Browser waren lokal verschwunden | Nach dem Plattenengpass war kein E2E-Lauf mehr möglich | Nachinstalliert; bei erneutem Cache-Verlust wiederholen |

## Folgeaufgaben

| Prioritaet | Aufgabe | Begruendung |
| --- | --- | --- |
| `P1` | MEA-Summenprüfung (Befund 1) | Der einzige Befund, der dauerhaft falsches Geld erzeugt |
| `P1` | Warnung bei Abrechnung ohne aktivierten Plan (Befund 2) | Falsche Zahlungsaufforderung an alle Eigentümer |
| `P1` | Mandantenlose Nutzer weiterleiten (Befund 3) | Einzige Sackgasse ohne Selbsthilfe |
| `P2` | Wegführung um die Finanzen ergänzen (Befund 8) | Wer der App folgt, baut nie einen Wirtschaftsplan |
| `P2` | Verteilungsschlüssel verlinken (Befund 7) | Zwei Formulare enden ohne Ausweg |
| `P3` | Entscheiden, ob eine Eigentümersicht gebaut wird | Der Slice ist verwalterseitig belegt; ob er ohne Eigentümer-Einblick als Produkt trägt, ist offen |
