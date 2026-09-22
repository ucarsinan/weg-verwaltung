# WEG-Verwaltung Agent Report

Datum: `2026-09-22`
Agent/Rolle: `Claude (Opus 5)`
Task: `audit_verify_chain() meldet nie "intact" — Ursache finden und beheben`
Betroffener Worker-Bereich: `Audit / Datenbank`

## Kurzfazit

Erledigt. Ursache gefunden, empirisch belegt, mit einem zuerst roten Test
abgesichert und behoben. `public.audit_verify_chain()` konnte eine intakte
Audit-Kette **nie** als intakt melden.

## Was bedeutet das?

Die Anwendung verspricht, dass an Beschluessen und Protokollen niemand
nachtraeglich manipulieren kann. Die Funktion, die das nachweisen soll, hat
diesen Nachweis nie erbracht — sie meldete stattdessen dauerhaft
„Keine Audit-Zeilen im verifizierbaren Forward-Fenster gefunden\".

Echte Bruchstellen hat sie weiterhin erkannt. Aber Unversehrtheit hat sie nie
bestaetigt. In der Audit-Konsole stand „Geprueft: 0\" neben einer makellosen
Kette.

## Handfester Fahrplan

1. Defekt beheben — dieser Report.
2. Produktthema nach Wahl des Nutzers.
3. Aufraeumen: Advisor-Rueckstand.

## Entscheidung fuer den Nutzer

Freigeben. Die Migration ersetzt eine Funktion, fasst keine Tabelle an, aendert
keine Policy und keinen Grant. Der neue Vertrag laeuft im CI-Gate.

## Findings

**Finding 1 — NULL-Falle im Forward-Fenster, eingeschleppt von `0050`**

- Status: `SUPPORTED`
- Prioritaet: `P1`
- Problem: `0045` zaehlte das zu pruefende Fenster mit
  `(c.valid_after_seq is null or ae.seq > c.valid_after_seq)`. `0050` hat die
  Funktion neu gebaut und den NULL-Zweig verloren:
  `(not v_checkpoint_found or ae.seq > v_valid_after_seq)`.
  Der Reparatur-Checkpoint wird **faul** angelegt und traegt dabei
  `valid_after_seq = NULL` — laut `0045` die Bedeutung „ab der Genesis-Zeile
  gueltig\", also alle Zeilen. Genau dann ergibt `ae.seq > NULL` den Wert NULL,
  `false or NULL` ist NULL, und jede Zeile faellt aus dem Fenster.
- Auswirkung: `status` konnte nur `error` oder `warning` sein, nie `intact`.
  `rows_checked` war immer 0, `seq_from` und `seq_to` immer NULL. Eine
  naechtliche Pruefung, die auf `intact` wartet, waere dauerhaft rot gewesen;
  eine, die nur `error` ausschliesst, dauerhaft gruen ohne Aussage. Beides ist
  schlechter als keine Pruefung, weil es nach einer aussieht.
- Naechster Schritt: `0068_audit_verify_chain_null_window.sql`.
- Begruendung: Dieselbe Falle wie in `0064` — ein Vergleich gegen NULL ergibt
  NULL, nicht FALSE, und die umgebende Bedingung kippt still. Das Repository hat
  diese Klasse jetzt zum zweiten Mal.

**Finding 2 — Die Checkpoint-Grenze wurde von ihrer eigenen Auswertung ueberschrieben**

- Status: `SUPPORTED`
- Prioritaet: `P3`
- Problem: Dieselbe Abfrage las `v_valid_after_seq` im Praedikat und schrieb
  `min(seq)` per `INTO` in dieselbe Variable zurueck.
- Auswirkung: Funktional unauffaellig, weil die Variable danach nur noch als
  `seq_from` gemeldet wird. Aber jede kuenftige Aenderung, die den Wert ein
  zweites Mal braucht, laeuft ins Leere — und der Fehler waere still.
- Naechster Schritt: Eigene Variable `v_seq_from` eingefuehrt.
- Begruendung: Eine Variable, die waehrend ihrer Verwendung ihre Bedeutung
  wechselt, ist eine Falle fuer den naechsten Leser.

## Vorgehen

Nach `superpowers:systematic-debugging`, Phasen eingehalten:

**Phase 1 — Ursache.** Funktion vollstaendig gelesen. Dabei fiel auf, dass
`0045` sie **mit** Parameter definiert, die Datenbank sie aber **ohne** fuehrt —
`0050` hat sie ersetzt. Der Vergleich beider Fassungen zeigte den verlorenen
Zweig.

**Phase 2 — Muster.** Das funktionierende Gegenbeispiel stand im selben
Repository: `0045`. Unterschied: genau ein `or`-Zweig.

**Phase 3 — Hypothese, minimal getestet.** Beide Praedikate gegen dieselbe
Datenlage gestellt:

```
audit_zeilen | checkpoint_grenze_ist_null
           2 | t

Praedikat aus 0050  ->  0 Zeilen
Praedikat aus 0045  ->  2 Zeilen
```

Zusaetzlich belegt, dass die Kette wirklich intakt war:
`verify_chain_repaired()` meldete **0** Bruchstellen, waehrend die oeffentliche
Funktion `warning` meldete.

**Phase 4 — Test zuerst.** `0068_audit_verify_chain_window.sql` geschrieben und
**vor** der Migration ausgefuehrt: `Failed 4/6 subtests`, rot genau in den vier
Zusicherungen zum Defekt. Die beiden Vorbedingungen (Audit-Zeilen vorhanden,
Checkpoint-Grenze ist NULL) waren gruen — der Fehlschlag war der Defekt, nicht
die Fixture. Nach der Migration: `Result: PASS`.

## Geaenderte Dateien

- `infra/supabase/migrations/0068_audit_verify_chain_null_window.sql` — neu.
  Die Funktion wurde programmatisch aus `0050` uebernommen und an drei Stellen
  geaendert, statt 170 Zeilen abzutippen.
- `infra/supabase/tests/0068_audit_verify_chain_window.sql` — neu, 6
  Zusicherungen.
- `justfile` — Vertrag in `AUDIT_DB_TESTS` aufgenommen.
- `AGENTS.md`, `TEST_INFRA.md`, `PROJECT_REALITY.md`,
  `docs/09-tom-art32.md` § 9.6/9.7, `docs/10-...` § 10.6 — Zahlen, Stand und
  der aufgeloeste Nebenbefund.

## Ausgefuehrte Checks

- Reproduktion gegen die lokale Datenbank auf Stand `0067`.
- Vertrag vor der Migration: `Failed 4/6`. Nach der Migration: `PASS`.
- `just test-db-all`: `Files=17, Tests=330, Result: PASS`.
- Geprueft, dass nichts auf dem alten Verhalten aufsetzt: kein Web-Test, kein
  E2E-Spec und kein pgTAP-Vertrag prueft `warning` oder `rows_checked = 0`. Die
  Audit-Konsole zeigt `rows_checked` an — dort stand bisher dauerhaft 0.
- `./scripts/verify.sh` gruen.

## Git-Status

Branch `claude/audit-verify-null-window`, abgezweigt von `main` (`f2228e9`).

## Security-Check

Keine Policy, kein Grant, keine Tabelle geaendert. Die Funktion bleibt
`security definer` mit unveraendertem Rollen-Guard (`tenant_admin`) und
unveraenderten Grants. Kein Cloud-Zugriff.

## Bewusst nicht geaendert

- Der pgTAP-Vertrag `0050_audit_console_read_api.sql` bleibt rot und unverdrahtet
  (9 von 54 Zusicherungen, siehe `AGENTS.md`-Backlog). Ihn gruen zu machen ist
  ein eigener Slice; ihn abzuschwaechen waere falsch.
- Keine naechtliche Pruefung eingerichtet. Der Blocker dafuer ist jetzt weg, der
  Scheduler ist eine Betriebsentscheidung.
- Die Audit-Konsole nicht angefasst. Sie zeigt ab jetzt von selbst sinnvolle
  Zahlen.

## Risiken

Die Migration ist gegen die lokale Datenbank geprueft, nicht gegen die Cloud.
Der Cloud-Migrationsstand ist ohnehin seit `0061` nicht verifiziert — beides
gehoert in denselben freigabepflichtigen Abgleich.

## Folgeaufgaben

1. Produktthema nach Wahl (Bankabgleich, Mahnwesen, Dokumentenablage).
2. Advisor-Rueckstand: `auth_rls_initplan` (7x), `duplicate_index` (1x).
3. Cloud-Abgleich inkl. `0068`.
4. `0050`/`0052`/`0054` gruen machen — eigener Slice.
