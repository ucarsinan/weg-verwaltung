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
| `BEHOBEN 0073` | `P1` | ~~MEA wird nie auf Vollständigkeit geprüft~~; der rohe Bruch wird verteilt | `0060:255-268`; Test `selbstverwaltung-mea-luecke` misst 9.000 statt 12.000 € | Die Gemeinschaft erhebt dauerhaft zu wenig Hausgeld, ohne Warnung | Summe der MEA beim Aktivieren prüfen, Abweichung benennen | Fachlich: Es geht um Geld, das nie eingefordert wird |
| `BEHOBEN 2026-09-28` | `P1` | ~~Jahresabrechnung ohne aktivierten Plan ist nicht erkennbar~~ — `soll_vorschuesse` steht weiterhin auf 0, die Seite sagt es jetzt | View `abrechnung_spitze` (`0063:668`); Test `selbstverwaltung-abrechnung-ohne-plan` misst Spitze 5.000 € bei 5.000 € Kosten | Jeder Eigentümer erhält die vollen Jahreskosten als Nachschuss ausgewiesen | Beim Erstellen prüfen, ob ein aktiver Plan für das Jahr existiert, und sonst warnen | Fachlich: Eine falsche Zahlungsaufforderung an alle Eigentümer |
| `BEHOBEN 2026-09-28` | `P1` | ~~Mandantenloser Nutzer landet in einer Sackgasse mit Entwicklersatz~~ | `(dashboard)/layout.tsx:9-19` prüft nur die Session; `createWeg` lehnt mit „Kein Mandant im aktuellen JWT-Claim." ab | Wer die Bestätigungsmail in einem anderen Browser öffnet, kommt nie ins Onboarding | Mandantenprüfung in `middleware.ts` oder im Dashboard-Layout, Weiterleitung nach `/onboarding` | Wegführung: Der Nutzer kann sich nicht selbst befreien |
| `BEHOBEN 0073` | `P2` | ~~Wirtschaftsplan mit null Einheiten aktivierbar~~ | `wirtschaftsplan-edit-form.tsx:202-215` deaktiviert den Knopf nicht; Generator fügt null Zeilen ein | Erfolg wird gemeldet, es entsteht kein Hausgeld | Knopf sperren, solange keine Einheit existiert | Wegführung: stiller Leerlauf |
| `SUPPORTED` | `P2` | `erstelle_abrechnung` gelingt in einem Jahr ohne Ausgaben | `0063:425-540` | Eine Abrechnung ohne Kostenpositionen entsteht ohne Hinweis | Leeres Jahr abweisen oder deutlich kennzeichnen | Fachlich: ein Dokument, das nichts aussagt |
| `BEHOBEN 2026-09-29` | `P2` | ~~Aktivierungsfehler falsch beschriftet~~ — die Meldung der Datenbank wird jetzt ausgewertet statt verworfen | `[planId]/edit/actions.ts:46-64` bildete `23514` auf „Der Statuswechsel ist fachlich nicht erlaubt." ab | Fehlende Basiswerte wurden als Statusproblem gemeldet | `23514` nach Ursache auffächern, `0A000` ergänzen | Wegführung: schickt auf die falsche Fährte |
| `BEHOBEN 2026-09-29` | `P2` | ~~Verteilungsschlüssel ist unsichtbare Vorbedingung~~ — der Hinweis trägt jetzt den Link | `position-form.tsx:137,164`; `ausgabe-form.tsx:187` — leeres, deaktiviertes Auswahlfeld, Absendeknopf aktiv | Nutzer klickt, bekommt einen Feldfehler und keinen Weg zur Lösung | Link auf `…/verteilungsschluessel/new` in beide Formulare | Wegführung: Sackgasse mit Ausweg, der nicht gezeigt wird |
| `BEHOBEN 2026-09-29` | `P2` | ~~Die Wegführung überspringt die gesamten Finanzen~~ — der Wirtschaftsplan steht jetzt in der Leiter, vor der Versammlung | `wegs/[id]/page.tsx:227-267`: Adresse → Einheiten → Personen → Versammlung | Wer der App folgt, baut nie einen Wirtschaftsplan | Finanzen in die Leiter aufnehmen | Wegführung: die Kernaufgabe fehlt im Vorschlag |
| `SUPPORTED` | `P2` | Wirtschaftsplan und Beschluss sind nicht verbunden | `wirtschaftsplan` (0036, 0047) hat kein `resolution_id`; `activate_wirtschaftsplan` erzeugt Sollstellungen ohne jeden Bezug auf eine Versammlung | Zahlungsforderungen ohne Nachweis des Beschlusses, der sie nach § 28 Abs. 1 WEG erst begründet | Aktivierung an einen Beschluss binden; `beschluss_sammlung_entry.resolution_id` (0005:13) liegt bereit | Fachlich: bestreitet ein Eigentümer die Forderung, hat das System keine Antwort |
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
| `just e2e` (volle Suite) | `pass` | 103 Tests: 101 bestanden, 2 übersprungen (`test.skip`), 0 fehlgeschlagen, 7,6 Minuten, kein Abbruch — der erste vollständige Lauf in einem Stück. Der Lauf vom 2026-09-25 musste nach `ENOSPC` geteilt werden. |

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
| ~~`P1`~~ erledigt | MEA-Summenprüfung (Befund 1) | Der einzige Befund, der dauerhaft falsches Geld erzeugt |
| ~~`P1`~~ erledigt | Warnung bei Abrechnung ohne aktivierten Plan (Befund 2) | Falsche Zahlungsaufforderung an alle Eigentümer |
| ~~`P1`~~ erledigt | Mandantenlose Nutzer weiterleiten (Befund 3) | Einzige Sackgasse ohne Selbsthilfe |
| ~~`P2`~~ erledigt | Wegführung um die Finanzen ergänzen (Befund 8) | Wer der App folgt, baut nie einen Wirtschaftsplan |
| ~~`P2`~~ erledigt | Verteilungsschlüssel verlinken (Befund 7) | Zwei Formulare enden ohne Ausweg |
| `P1` | Aktivierung an einen Beschluss binden (Befund 13) | Sollstellungen entstehen ohne Nachweis des Beschlusses, der sie nach § 28 Abs. 1 WEG erst begründet |
| `P2` | Eigene Fehlercodes im SQL statt einer Meldungsliste (Anschluss an Befund 6) | Die Positivliste in `aktivierungsfehler.ts` spiegelt SQL-Text und veraltet still; eigene Codes wären eindeutig und würden auch der Jahresabrechnung helfen |
| `P3` | Entscheiden, ob eine Eigentümersicht gebaut wird | Der Slice ist verwalterseitig belegt; ob er ohne Eigentümer-Einblick als Produkt trägt, ist offen |

---

## Nachtrag 2026-09-28: Befunde 1, 2 und 4 behoben

Migration `0073_wirtschaftsplan_mea_vollstaendigkeit.sql` plus eine
Begleitänderung in der Weboberfläche. Die übrigen neun Befunde bleiben offen.

**Befund 1 und 4 — eine Sperre an der Aktivierung.** `activate_wirtschaftsplan`
prüft, dass die Summe der MEA-Brüche genau ein Ganzes ergibt, und weist sonst
mit `22023` ab — bevor eine Sollstellung entsteht. Eine WEG ohne Einheiten hat
Summe 0 und fällt in dieselbe Sperre, womit Befund 4 miterledigt ist.

Zwei Entscheidungen, die den Zuschnitt erklären:

- **Der Generator bleibt unangetastet.** `0060` verspricht für den Alt-Zweig
  ausdrücklich byte-identisches Verhalten. Ihn zu normalisieren hieße
  außerdem, die drei erfassten Einheiten für 100 % zahlen zu lassen — der
  Anteil einer fehlenden vierten verschwände still auf die Nachbarn. Die
  Prüfung gehört an den Moment, in dem Geld entsteht, nicht in die Rechnung.
- **Geprüft wird der Bruch gegen 1, nie der Zähler gegen 1000.** Der Nenner ist
  gesetzlich nicht festgelegt; 1000/1000 ist verbreitete Praxis, mehr nicht.
  Eine WEG darf 1/2 + 250/1000 + 25/100 führen — der Vertrag sichert das zu.
- **Eigener Errcode `22023` statt `23514`.** Die Oberfläche bildet jeden
  `23514` der Aktivierung auf dieselbe Sammelmeldung ab (Befund 6). Ein
  eigener Code macht die Ursache benennbar, ohne Meldungstexte zu parsen.
  Befund 6 bleibt im Übrigen offen.

**Befund 2 — gekennzeichnet, nicht gesperrt.** Ohne aktivierten Plan gab es
tatsächlich keine geschuldeten Vorschüsse; `soll_vorschuesse = 0` ist dann
richtig. Eine WEG kann ihr erstes Jahr legitim ohne Plan gewirtschaftet haben.
Falsch war nur, dass dem Wert nicht anzusehen war, ob er „kein Plan" oder
„Plan mit null" bedeutet. Die Abrechnungsseite sagt es jetzt.

Das ist auch juristisch die schärfere Stelle: Nach § 28 Abs. 2 WEG ist die
Spitze die Gegenüberstellung der Ist-Kosten mit den Soll-Werten des
**rechtsgültigen** Wirtschaftsplans, und Fehler in der Jahresabrechnung führen
nach der Rechtsprechung nur dann zur Ungültigkeit, wenn sie sich auf die Spitze
auswirken. Eine still falsche Spitze ist genau das, woran ein Beschluss kippt.

**Was dabei nicht geschah:** keine rückwirkende Korrektur bereits aktivierter
Pläne mit unvollständiger MEA. Sollstellungen sind historische Forderungen; sie
umzuschreiben wäre ein eigener, schwerer Eingriff. Bestehende Daten im
E2E-Mandanten behalten ihre zu niedrigen Beträge.

**Die Stimmgewichtung** (`0049:482-484`) summiert ebenfalls rohe MEA-Brüche.
Das ist kein Geld, sondern Stimmrecht, und eine eigene Entscheidung — hier
nicht angefasst, aber hiermit aktenkundig.

### Checks dieses Nachtrags

| Check | Ergebnis | Hinweis |
| --- | --- | --- |
| `just test-finance-db` (vor der Migration) | `fail` | 5 von 17 rot — die Sperre existierte noch nicht, genau wie beabsichtigt |
| `just test-db-all` | `pass` | 20 Dateien, 388 Zusicherungen (vorher 19 / 371) |
| `./scripts/verify.sh` | `pass` | 538 Web-Tests (vorher 527) |

## Nachtrag 2026-09-28: Befund 3 behoben

`(dashboard)/layout.tsx` leitet mandantenlose Nutzer nach `/onboarding` —
spiegelbildlich zu `onboarding/page.tsx`, das die Gegenrichtung schon machte.

Zwei Dinge, die die Reparatur erst tragfähig machen:

**Ein fehlgeschlagenes `getClaims()` ist nicht dasselbe wie „kein Mandant".**
Bei einer JWKS- oder Netzstörung liefert `getTenantClaims` ebenfalls
`tenantId: null`. Wer darauf umleitet, wirft gültige Nutzer ins Onboarding —
und wäre der Custom Access Token Hook in einer Umgebung nicht registriert,
träfe es jeden, samt Schleife. Deshalb wird bei einem Fehler durchgelassen und
geloggt; das Dashboard zeigt dann wie bisher „nicht verfügbar", was
diagnostizierbar bleibt. Genau das sichert der vierte Vitest-Fall zu.

**`/onboarding` hat jetzt einen Abmelden-Knopf.** `logoutAction` lebte nur in
der Dashboard-Hülle. Ohne ihn hätte die Umleitung eine Sackgasse gegen eine
schlechtere getauscht: Wer sich mit dem falschen Konto anmeldet, käme sonst nur
über gelöschte Cookies wieder heraus.

**Neue Kopplung, bewusst in Kauf genommen:** `saas-onboarding.spec.ts` hängt
jetzt daran, dass `refreshSession()` den Claim synchron liefert. Bisher
renderte die Seite auch ohne Claim und der Test lief grün — aus einer stillen
Verschlechterung wird ein sichtbarer Fehlschlag. Sachlich richtig, aber der
wahrscheinlichste neue Flake.

### Checks

| Check | Ergebnis | Hinweis |
| --- | --- | --- |
| `./scripts/verify.sh` | `pass` | 542 Web-Tests (vorher 538) |
| `playwright test dashboard` | `pass` | 4 von 4 — die Regressionsprobe: der gesäte Admin wird nicht umgeleitet |
| `playwright test saas-onboarding` | `pass` | 3 von 3 — Registrierung → Wizard → Dashboard → Einladung → Annahme |

**Acht Befunde bleiben offen**, keiner davon erzeugt falsches Geld.

## Nachtrag 2026-09-29: Befunde 6, 7 und 8 behoben — und ein neuer Befund 13

Der Auftrag lautete „der Weg zum ersten Wirtschaftsplan". Eine Webrecherche zu
§ 28 WEG vorweg hat die Reihenfolge der Wegführung entschieden und dabei einen
Befund freigelegt, der größer ist als die drei reparierten zusammen.

### Die Rechtslage, die die Reihenfolge vorgibt

Seit dem WEMoG (1.12.2020) sind Zahlenwerk und Beschluss rechtlich getrennt. Der
Verwalter **stellt den Wirtschaftsplan auf** (§ 28 Abs. 1 S. 2 WEG); die
Eigentümer **beschließen nur über die Vorschüsse**, nicht mehr über den Plan
selbst. Der Plan ist die Beschlussvorlage — er erläutert, wie die Zahlungspflicht
zustande kommt, begründet sie aber nicht. Die Abfolge ist damit: **Plan aufstellen
→ Versammlung beschließt die Vorschüsse → Zahlungspflicht.**

Daraus folgt unmittelbar, dass der Wirtschaftsplan in der Leiter **vor** die
Versammlung gehört und nicht dahinter. Bisher endete sie bei der Versammlung und
kannte den Plan gar nicht — sie führte den Nutzer also zu genau dem Termin, für
den ihm die Vorlage fehlte.

### Befund 8 — die Leiter kennt jetzt den Wirtschaftsplan

Neu `wegs/next-step.ts`: Die Priorisierung lag als verschachteltes Ternär im
Rumpf der Server Component, dreifach dupliziert und **nirgends geprüft**. Sie ist
jetzt eine reine Funktion nach dem Muster von `wegs/address.ts` und zum ersten
Mal getestet. Die Leiter lautet: Einheiten → Personen → **Wirtschaftsplan** →
Versammlung → offene Versammlung.

Eine WEG mit laufender Versammlung, aber ohne Plan wird damit auf den Plan
gestoßen. Das ist beabsichtigt: ohne Vorlage kann die Versammlung nicht
beschließen.

**`hatWirtschaftsplan` ist `boolean | null`,** und `null` überspringt den Schritt.
Scheitert die Zählabfrage, darf die App nicht behaupten, es gebe keinen Plan —
sie würde sonst eine längst planende Gemeinschaft zum Neuanlegen auffordern.
Dieselbe Unterscheidung wie bei `getClaims()` im Nachtrag zu Befund 3: ein Fehler
ist nicht dasselbe wie ein leeres Ergebnis.

Der `reason`-Text des Panels nannte „Stammdaten" als Kriterium, obwohl die Leiter
die Adresse nie prüfte. Er ist mitkorrigiert.

### Befund 7 — der Hinweis trägt jetzt den Ausweg

Beide Formulare hatten den Hinweis bereits, ihm fehlte nur der Link. Muster ist
der Inline-Satz mit Anschluss-Link aus `beschluss-sammlung/page.tsx:119-133`;
bewusst nicht `EmptyState`, die im gesamten `finanzen/`-Teilbaum nirgends
verwendet wird.

In `position-form.tsx` sind die zwei Fälle getrennt: Nur wenn **gar kein**
Schlüssel existiert, hilft der Link. Existieren Schlüssel, die der Generator
nicht auflösen kann, wäre er eine falsche Fährte. Heute deckt `GENERATOR_TYPEN`
alle Typen ab, die Fälle fallen also zusammen — das muss nicht so bleiben.

**Nicht gelöst, nur benannt:** Wer mitten im Formular abbiegt, verliert seine
Eingaben. Beide Formulare sind uncontrolled, und ein `?next=`-Rücksprung
existiert im Projekt nur im Auth-Pfad.

### Befund 6 — größer als gedacht, und eine Korrektur an `0073`

Die Erkundung hat die Annahme des Berichts widerlegt: Bei der Aktivierung sind
**fünf Ursachen** unter `23514` erreichbar, von denen nur eine ein Statuswechsel
ist — Status (`0073`), fehlender Nachtrags-Vorgänger (`0073`), fehlende
Basiswerte, Basiswert-Summe 0 und gemischte Regel ohne Teile (alle drei `0067`).
Eine reine Code→Text-Tabelle kann das nicht trennen.

Der Hebel lag im Weggeworfenen: Die Action nahm nur `error.code`. Die Meldungen
des Generators sind aber bereits für Nutzer formuliert und nennen Zahlen, die nur
die Datenbank kennt („Es fehlen Basiswerte für 3 Einheit(en) zum Stichtag
2026-01-01."). Neu `modules/finanzen/aktivierungsfehler.ts` reicht diese Meldungen
über eine **Positivliste** durch und übersetzt die zwei englischen
Entwicklersätze. Positivliste und nicht Sperrliste, damit nie ein interner Satz
wie `violates check constraint "…"` an den Verwalter durchrutscht; was nicht
erkannt wird, fällt auf einen Text zurück, der die Ursachen **benennt** statt
eine zu behaupten.

**Die Korrektur an der eigenen Arbeit vom Vortag:** `0073` hat `22023` eingeführt,
und die Oberfläche bildete den Code auf „Die Miteigentumsanteile dieser WEG
ergeben nicht genau ein Ganzes" ab. Aber `0045:153` und `0045:179` werfen
denselben Code für Ausfälle der HMAC-Kette, und deren Trigger hängen an
`wirtschaftsplan` und `sollstellung` — sie feuern bei jeder Aktivierung. Ein
kaputter Audit-Schlüssel wurde damit als MEA-Problem gemeldet, also genau die
Fehlfährte, die dieser Befund beseitigen sollte. Interne Meldungen (Präfix
`audit_writer.`) bekommen jetzt einen technischen Text und werden laut geloggt.

`mapLifecycleError` bedient nur noch Archivieren und Nachtrag und behauptet dort
ebenfalls keinen MEA-Fehler mehr: Die MEA-Vorbedingung sitzt allein in
`activate_wirtschaftsplan`, wird bei diesen beiden also nie geprüft.

**Bewusst ohne Migration.** Eigene Fehlercodes im SQL wären eindeutig statt
textbasiert und würden auch der Jahresabrechnung helfen, die dasselbe Problem hat
(`abrechnungen/actions.ts:98-99`). Aber `just db-migrate` ist Handarbeit, und bis
zum Ausrollen griffe der Web-Teil für diese Fälle nicht. Als Folgeaufgabe
vermerkt.

### Befund 13 (neu) — Sollstellungen ohne Beschluss

Aus der Recherche ergibt sich ein Befund, der **nicht** repariert wurde:
`wirtschaftsplan` hat keine Verbindung zu einem Beschluss. Die Spalten aus `0047`
sind rein technisch (`status`, `aktiviert_am`, `version_nr`), ein `resolution_id`
gibt es nicht. `activate_wirtschaftsplan` erzeugt Sollstellungen — also
Zahlungsforderungen — ohne Versammlung, ohne Beschluss und ohne Nachweis, dass es
einen gab. Nach § 28 Abs. 1 WEG begründet aber erst der Beschluss die
Zahlungspflicht.

Bestreitet ein Eigentümer eine Forderung, hat das System auf „worauf beruht das?"
keine Antwort. Die andere Hälfte liegt fertig da: `beschluss_sammlung_entry`
führt `meeting_id` und `resolution_id` (`0005:13`).

Das berührt Migration und Finanzmodell und ist damit kein Beiwerk einer
UI-Aufgabe. Als `P1`-Folgeaufgabe aufgenommen.

### Checks

| Check | Ergebnis | Hinweis |
| --- | --- | --- |
| `./scripts/verify.sh` | `pass` | 565 Web-Tests (vorher 542) — 8 für die Leiter, 14 für die Fehlerzuordnung, 1 in den bestehenden Action-Tests |
| `playwright test wegs.spec.ts finanzen-positionen finanzen-ausgaben` | `pass` | 14 von 14, 1,1 Minuten. Belegt, dass die WEG-Seite mit der neuen Zählabfrage und beide geänderten Formulare zur Laufzeit rendern — die CI führt kein Playwright aus, das musste von Hand geschehen. |

**Grenze dieser Probe:** Kein E2E-Test sichert die Leiter-Texte zu (selbst
geprüft), der Lauf belegt also das Rendern, nicht die Priorisierung. Die trägt
`wegs/__tests__/next-step.test.ts`.

**Fünf Befunde bleiben offen** (5, 9–12), dazu der neue Befund 13.
