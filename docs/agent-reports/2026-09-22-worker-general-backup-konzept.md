# WEG-Verwaltung Agent Report

Datum: `2026-09-22`
Agent/Rolle: `Claude (Opus 5)`
Task: `Backup und Wiederherstellung nach Art. 32 Abs. 1 lit. b und c (docs/09-tom-art32.md § 9.7)`
Betroffener Worker-Bereich: `Betrieb / Datenschutz`

## Kurzfazit

Teilweise erledigt — und das ist die ehrliche Einstufung, nicht die vorsichtige.
Konzept, Exportskript und ein durchgefuehrter lokaler Wiederherstellungs-Drill
liegen vor. Die Massnahme selbst ist **nicht** umgesetzt: es gibt weiterhin kein
Backup. Was dazu fehlt, sind zwei Entscheidungen und ein Lauf, und beides gehoert
dem Betreiber.

Der Drill hat einen Befund erzeugt, den ich nicht erwartet hatte.

## Was bedeutet das?

Erstens: **Fiele die Datenbank heute aus, waere der Bestand weg.** Das Projekt
laeuft auf dem Supabase-Free-Plan, und dieser Plan enthaelt laut
Supabase-Dokumentation (abgerufen 2026-09-22) gar keine automatischen Backups —
weder taeglich noch Point-in-Time. Das ist kein Versaeumnis im Code, sondern eine
Eigenschaft des gewaehlten Plans, die bisher niemand ausdruecklich entschieden
hat.

Zweitens, und schwerer: **ein logischer Restore holt die Daten zurueck, aber
nicht den Beweis, dass sie unveraendert sind.**

## Handfester Fahrplan

1. PR #22 TOM-Liste — erledigt.
2. PR #23 Doku auf `0067` — erledigt.
3. PR #24 katalogweite RLS-Zusicherung — erledigt.
4. Backup-Konzept, Exportskript, lokaler Drill — dieser Report.
5. **Betreiber:** Plan und RPO/RTO entscheiden, ersten Cloud-Export ziehen
   (freigabepflichtig), Drill dagegen fahren.
6. **Eigener Slice:** das leere Forward-Fenster der Kettenpruefung untersuchen,
   **bevor** die naechtliche Pruefung eingerichtet wird.

## Entscheidung fuer den Nutzer

Freigeben — aber die Freigabe erledigt die Massnahme nicht. Dieser PR liefert
Werkzeug und Entscheidungsgrundlage. Danach steht eine Betriebsentscheidung an,
die ich nicht treffen kann und nicht treffen sollte.

## Findings

**Finding 1 — Der Free-Plan hat gar kein Backup**

- Status: `SUPPORTED`
- Prioritaet: `P1`
- Problem: Supabase dokumentiert fuer Free-Plan-Projekte keine automatischen
  Backups und verweist darauf, selbst per CLI zu exportieren. `AGENTS.md` fuehrt
  den Free-Plan seit dem 2026-07-14 (Leaked-Password-Kontext).
- Auswirkung: Art. 32 Abs. 1 lit. b und c sind nicht erfuellt. Ein AVV, der
  Verfuegbarkeit und Wiederherstellbarkeit zusagt, waere eine Falschangabe.
- Naechster Schritt: Plan-Entscheidung. Pro ($25/Monat) bringt 7 Tage taegliche
  Backups; PITR ist ein Add-on ($100/Monat je 7 Tage) und ersetzt die taeglichen
  Backups. Preise laut Supabase-Preisseite, abgerufen 2026-09-22.
- Begruendung: Von allen offenen Punkten ist das der einzige, bei dem ein Fehler
  nicht korrigierbar ist. Verlorene Daten kommen nicht zurueck.

**Finding 2 — Ein logischer Restore zerstoert die Verifizierbarkeit der Audit-Kette**

- Status: `SUPPORTED`
- Prioritaet: `P1`
- Problem: Nach Dump, `db reset` und Wiedereinspielen meldete
  `public.audit_verify_chain()` `status = error`, `reason = row_hash_mismatch`.
  Die `prev_hash`-Werte stimmten ueberein, nur der Zeilenhash wich ab.
  Ursache laut dem Kopf von `0017_vault_seed_audit_hmac_key.sql`: Supabase Vault
  nutzt einen projektspezifischen pgsodium-Schluessel, jede frische Umgebung
  erzeugt ihren eigenen `audit_hmac_key`, und eine kopierte `vault.secrets`-Zeile
  laesst sich absichtlich nicht entschluesseln.
- Auswirkung: `AuditEvent` ist laut Sicherheitsmodell unloeschbar und
  faelschungssicher — eine der staerksten Zusagen dieses Produkts. Nach einem
  logischen Restore laesst sie sich fuer alle Zeilen vor dem Restore nicht mehr
  belegen. Die Zeilen sind da; niemand kann mehr beweisen, dass sie unveraendert
  sind.
- Naechster Schritt: Drei Wege stehen in `docs/10-backup-und-wiederherstellung.md`
  § 10.5. Empfehlung: physisches Backup bzw. PITR, weil das als einziger Weg die
  Kette wiederherstellt, ohne dass jemand Schluesselmaterial von Hand verwaltet.
- Begruendung: Die Warnung stand seit `0017` im Repository — sie war nur auf das
  Klonen zwischen Projekten gemuenzt. Niemand hat sie mit dem Wort
  „Wiederherstellung" verbunden. Genau deshalb muss man den Drill fahren und
  nicht bloss planen.

**Finding 3 — Die Kettenpruefung meldete nie „ok"**

- Status: `PARTIALLY_SUPPORTED`
- Prioritaet: `P2`
- Problem: Auf der frischen lokalen Datenbank lieferte `audit_verify_chain()`
  durchgehend `warning`, `rows_checked = 0`, „Keine Audit-Zeilen im
  verifizierbaren Forward-Fenster gefunden" — auch mit vorhandenen Audit-Zeilen
  und `valid_after_seq = null`, was laut `0045` (Zeile 424) alle Zeilen
  einschliesst.
- Auswirkung: Zweierlei. Erstens konnte ich keine positive Kontrollmessung
  erzeugen; Finding 2 stuetzt sich deshalb auf die beobachtete Fehlermeldung plus
  die dokumentierte Schluesselerzeugung, nicht auf einen A/B-Vergleich. Das steht
  so auch im Dokument. Zweitens, und wichtiger: die in der TOM-Liste vorgesehene
  naechtliche Kettenpruefung waere in diesem Zustand wertlos — ein Job, der jede
  Nacht „keine Zeilen" meldet, sieht aus wie eine bestandene Pruefung.
- Naechster Schritt: Eigener Slice, **vor** dem Scheduler. In § 9.7 und in
  `PROJECT_REALITY.md` als Schritt 3 eingetragen.
- Begruendung: Ich habe die Untersuchung hier bewusst abgebrochen. Sie gehoert
  nicht in einen Backup-Slice, und sie halbherzig mitzunehmen waere schlechter
  als sie klar zu benennen.

**Finding 4 — Zwei Bugs im eigenen Skript, beide nur durch Ausfuehren gefunden**

- Status: `SUPPORTED`
- Prioritaet: `P3`
- Problem: (a) `git check-ignore -q backups` meldet „nicht ignoriert", weil das
  Muster `backups/` in `.gitignore` nur fuer Verzeichnisse gilt und git bei einem
  noch nicht existierenden Pfad nicht weiss, dass ein Verzeichnis gemeint ist —
  der Schutzguard haette jeden Lauf abgebrochen. (b) Die Supabase-CLI loest `-f`
  gegen `--workdir infra` auf, nicht gegen das Arbeitsverzeichnis; mit relativem
  Pfad schrieb sie nach `infra/backups/...` und scheiterte.
- Auswirkung: Ohne den lokalen Testlauf waere ein Skript ausgeliefert worden, das
  in beiden Faellen scheitert — und zwar erst dann, wenn jemand es im Ernstfall
  braucht.
- Naechster Schritt: Beides behoben, beides im Skript kommentiert. `--local`-Lauf
  danach erfolgreich.
- Begruendung: Ein Backup-Skript, das im Notfall zum ersten Mal laeuft, ist kein
  Backup-Skript.

## Geaenderte Dateien

- `docs/10-backup-und-wiederherstellung.md` — neu. Rechtsrahmen, Free-Plan-Befund,
  Inhalt und Luecken eines Exports, der gemessene Drill, die drei Wege beim
  HMAC-Schluessel, die offenen Entscheidungen, Ablauf und Nachweisvorlage.
- `scripts/db-dump.sh` — neu. Dreiteiliger logischer Export mit Manifest
  (SHA-256, Git-HEAD, letzte Migration, CLI-Version), Guard gegen ein nicht
  ignoriertes Zielverzeichnis, getippte Bestaetigung fuer `--linked`.
- `.gitignore` — `backups/`.
- `justfile` — `db-dump-local` und `db-dump`.
- `AGENTS.md` — Kommandos, Freigabeliste, Safety Rule zu Exportdaten, Referenz.
- `docs/09-tom-art32.md` — § 9.7 Backup-Zeile und Audit-Ketten-Zeile praezisiert,
  § 9.9 Historie.
- `docs/03-security-model.md` — naechste empfohlene Aufgabe.
- `PROJECT_REALITY.md` — Gaps, Next Logical Step 1 und 3.

## Ausgefuehrte Checks

- Supabase-Backup-Dokumentation und Preisseite abgerufen (2026-09-22), Zahlen
  nicht aus dem Gedaechtnis uebernommen.
- `supabase db dump --help` gelesen, statt Flags zu raten.
- `scripts/db-dump.sh --local` ausgefuehrt: `roles.sql` 501 B, `schema.sql`
  411 KB, `data.sql` 30 KB, Manifest erzeugt.
- Vollstaendiger Drill: Fixture anlegen, exportieren, `supabase db reset --local`,
  wiedereinspielen, Zeilen zaehlen, `audit_verify_chain()` aufrufen.
- `./scripts/verify.sh` — siehe Git-Status.
- Lokale Exportdateien nach dem Drill geloescht.

## Git-Status

Branch `claude/backup-konzept`, abgezweigt von `main` (`b02a308`).

## Security-Check

Der Drill lief ausschliesslich gegen die ephemere lokale Datenbank mit
synthetischen Fixtures. Keine Cloud-Aktion, kein Export echter Daten. Kein
Schluesselmaterial gelesen oder ausgegeben: der `audit_hmac_key` wurde nie
abgefragt, die Ursache ist aus dem Migrationskopf und dem beobachteten
Hash-Verhalten abgeleitet. Keine `.env`-Datei beruehrt.

`backups/` ist in `.gitignore`, und das Skript verweigert den Dienst, wenn dieser
Eintrag fehlt.

## Bewusst nicht geaendert

- Kein Cloud-Export ausgefuehrt. Er ist freigabepflichtig und holt echte
  personenbezogene Daten auf die Platte — das ist eine Entscheidung des
  Betreibers, keine Routine.
- Kein Restore-Skript. Wiederherstellen ist ein bewusster Vorgang mit Blick auf
  das Ziel; ein Skript wuerde dazu verleiten, es ohne diesen Blick zu tun. Die
  Prozedur steht als Ablauf in § 10.8.
- Keine Sicherung der Storage-Objekte. Der Bucket `audit-archives` braucht einen
  eigenen Weg; als offener Punkt vermerkt.
- Das leere Forward-Fenster nicht weiterverfolgt (Finding 3).

## Risiken

Der Drill lief mit einer winzigen Fixture. `pg_dump` warnt bei `--data-only`
selbst davor, dass ein Rueckspielen ohne `--disable-triggers` scheitern kann. In
diesem Test blockierte kein Anwendungstrigger — fuer einen echten Datenbestand mit
Append-only-Triggern auf der Beschluss-Sammlung und den Agent-Guards ist das
**nicht** bewiesen. Der erste Drill gegen einen echten Export kann daher weitere
Befunde bringen; genau dafuer ist er da.

## Folgeaufgaben

1. Plan-Entscheidung, RPO/RTO, Ablageort (Betreiber).
2. Erster Cloud-Export und Drill dagegen (freigabepflichtig).
3. Leeres Forward-Fenster der Kettenpruefung untersuchen (eigener Slice).
4. Sicherung der Storage-Objekte.
5. Aufbewahrungsdauer der Exporte mit dem Loeschkonzept abstimmen.
6. AVV und Art.-30-Verzeichnis — juristische Spur.
