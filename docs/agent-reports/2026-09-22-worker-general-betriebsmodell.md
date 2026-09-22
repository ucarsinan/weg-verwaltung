# WEG-Verwaltung Agent Report

Datum: `2026-09-22`
Agent/Rolle: `Claude (Opus 5)`
Task: `Betriebsmodell und Anbieterwahl klaeren und dokumentieren`
Betroffener Worker-Bereich: `Betrieb / Datenschutz / Architektur`

## Kurzfazit

Erledigt, soweit es Dokumentation betrifft. Vier Entscheidungen sind getroffen,
zwei sind Empfehlungen mit offenen Fragen. Nichts davon ist umgesetzt — dieser
Commit aendert ausschliesslich Markdown.

Der Anlass war eine Nutzerentscheidung: den in `02-architecture-deployment.md`
vorgesehenen Ausloeser fuer einen Anbieterwechsel („ab erstem Vertrag\")
vorzuziehen.

## Was bedeutet das?

Das Projekt lief bisher vollstaendig auf Anbietern, die zwar EU-Rechenzentren
nutzen, aber nicht EU-Unternehmen sind. Das war in `02-architecture-deployment.md`
seit Juni ausdruecklich benannt und mit einem Ausloeser versehen. Der Ausloeser
wird jetzt vorgezogen — vor dem ersten Vertrag statt danach, also bevor
Kundendaten betroffen sein koennen.

## Handfester Fahrplan

1. PR #22 TOM-Liste, #23 Doku-Rueckstand, #24 RLS-Vertrag, #25 Backup — erledigt.
2. Betriebsmodell dokumentieren — dieser Report.
3. **Betreiber:** drei Fragen an Elestio stellen, zweites Supabase-Projekt anlegen.
4. **Agent:** Docker-Datei und `standalone`-Umstellung, danach Umzug.

## Entscheidung fuer den Nutzer

Freigeben. Reine Dokumentation; kein Produktcode, keine Migration, keine
Konfiguration geaendert. Die eigentlichen Entscheidungen sind bereits gefallen,
dieser Commit haelt sie nur fest.

## Findings

**Finding 1 — Die Angabe „Supabase Inc. (US)\" im Repository war falsch**

- Status: `SUPPORTED`
- Prioritaet: `P2`
- Problem: `02-architecture-deployment.md` fuehrte Supabase als US-Gesellschaft.
  Laut deren Auftragsverarbeitungsvertrag ist der Vertragspartner **Supabase
  Pte. Ltd., Singapur** (Reg. 202005760H), eine Tochter von Supabase, Inc. (USA).
- Auswirkung: Der Transfermechanismus ist ein anderer. Singapur hat keinen
  Angemessenheitsbeschluss; das EU-US Data Privacy Framework greift **nicht** und
  wird im Vertrag nirgends erwaehnt. Es gelten Standardvertragsklauseln. Wer die
  alte Angabe in einen AVV uebernommen haette, haette den falschen Mechanismus
  benannt.
- Naechster Schritt: In `02-architecture-deployment.md` und `09-tom-art32.md`
  § 9.8 korrigiert.
- Begruendung: Eine TOM-Liste wird Vertragsbestandteil. Ein falscher
  Rechtstraeger darin ist eine Falschangabe gegenueber dem Verantwortlichen.

**Finding 2 — Die alte Annahme zum Migrationspfad trifft nicht zu**

- Status: `SUPPORTED`
- Prioritaet: `P2`
- Problem: Der Abschnitt „Migrationspfad\" nahm an, ein Wechsel bedeute
  „self-hosted Postgres + GoTrue (deutlich mehr Ops-Last)\".
- Auswirkung: Diese Annahme haette den Wechsel dauerhaft verhindert — sie stellt
  ihn teurer dar, als er ist. Tatsaechlich gibt es EU-Betreiber, die dieselbe
  quelloffene Software inklusive Backups, Updates und Ueberwachung fuehren. Die
  Ops-Last **sinkt** gegenueber heute, weil es ueberhaupt erst Backups gibt.
- Naechster Schritt: Abschnitt ersetzt, Begruendung in `docs/11-betriebsmodell.md`.
- Begruendung: Eine dokumentierte Annahme, die nie geprueft wurde, wirkt wie ein
  Befund. Diese hier war sechs Monate alt.

**Finding 3 — Der JWT-Hook existiert nur im Dashboard, nicht im Repository**

- Status: `SUPPORTED`
- Prioritaet: `P1`
- Problem: `public.custom_access_token_hook()` ist in `0002_identity.sql`
  definiert und an `supabase_auth_admin` freigegeben. **Aktiviert** wird der Hook
  nirgends im Repository — nur im Supabase-Dashboard. In
  `infra/supabase/config.toml` steht er nicht.
- Auswirkung: Wer das Projekt allein aus dem Repository neu aufbaut, bekommt eine
  Anwendung, in der niemand etwas sieht: der Mandanten-Claim fehlt,
  `public.tenant_id()` liefert NULL, RLS sperrt alles. Immerhin **fail closed**.
  Bei jedem Umzug kann dieser Schritt vergessen werden, und der Fehler sieht aus
  wie „die Anwendung ist kaputt\", nicht wie „eine Einstellung fehlt\".
- Naechster Schritt: In `docs/11-betriebsmodell.md` § 11.7 festgehalten; beim
  Umzug in die Konfiguration aufnehmen.
- Begruendung: Die Mandantentrennung ist die zentrale Zusage. Dass ihr Schalter
  nicht im Code liegt, ist unabhaengig von jeder Anbieterfrage ein Mangel.

**Finding 4 — Eigene Aussage zum Backup-Befund war zu breit**

- Status: `SUPPORTED`
- Prioritaet: `P2`
- Problem: Der Report vom selben Tag formulierte, ein logischer Restore stelle
  die Audit-Kette nicht wieder her, und stellte PITR als einzigen Ausweg dar.
- Auswirkung: Das haette eine Entscheidung ueber 100 $/Monat getrieben.
  Tatsaechlich gilt der Befund nur fuer eine Wiederherstellung in eine **neue**
  Umgebung. Eine Wiederherstellung **im selben Projekt** erhaelt den
  Verschluesselungsschluessel, die Kette ueberlebt — taegliche Backups genuegen.
- Naechster Schritt: In `docs/10-...` § 10.7 und in der Historie korrigiert.
- Begruendung: Der Test, den ich gefahren hatte, war ein Umzug in eine frische
  Umgebung. Aus einem Testfall auf alle Faelle zu schliessen war der Fehler.

**Finding 5 — In der EU gibt es praktisch nur einen Betreiber**

- Status: `SUPPORTED`
- Prioritaet: `P2`
- Problem: Gepruefte Alternativen zu Elestio: Stackhero (FR, 47 Dienste, kein
  Supabase), Northflank (England, kein EU-Staat, zudem nur Vorlage in die eigene
  Cloud), Sealos (China), EasyCloudify (Rechtstraeger nicht feststellbar),
  Cloudron (Software statt Dienst), Nhost (SE, aber GraphQL statt PostgREST —
  grosser Umbau), Aiven (FI, nur Postgres).
- Auswirkung: Konzentrationsrisiko auf ein kleines Unternehmen.
- Naechster Schritt: Ausstiegsplan in `docs/11-betriebsmodell.md` § 11.6
  festgehalten. Das Werkzeug dafuer existiert bereits (`scripts/db-dump.sh`).
- Begruendung: Konzentrationsrisiko und Abhaengigkeitsrisiko sind zweierlei. Die
  Software ist Apache 2.0; drei Rueckfallebenen bestehen jederzeit. Bei einem
  proprietaeren Anbieter gaebe es keine.

## Geaenderte Dateien

- `docs/11-betriebsmodell.md` — neu. Massstab, vier Entscheidungen, zwoelf
  gepruefte Anbieter mit Ausscheidungsgrund, Bestandsaufnahme der genutzten
  Supabase-Bausteine, Kostenrechnung, Klumpenrisiko, Ausstiegsplan, Zielbild.
- `docs/02-architecture-deployment.md` — § 2.3 Zieltopologie ersetzt,
  CLOUD-Act-Abschnitt und Migrationspfad ersetzt, zwei Korrekturen benannt.
- `docs/09-tom-art32.md` — § 9.8 mit Rechtstraeger und Transfermechanismus,
  § 9.9 Historie.
- `docs/10-backup-und-wiederherstellung.md` — § 10.7 Plan-/Betreiberzeile,
  § 10.10 Historie mit der Korrektur aus Finding 4.
- `AGENTS.md` — Safety Rule zum Free-Plan, Referenz.
- `PROJECT_REALITY.md` — Betriebsmodell-Eintrag, Next Logical Step neu geordnet.

## Ausgefuehrte Checks

- Repository gemessen statt geschaetzt: benoetigte Erweiterungen, Anzahl der
  PostgREST-Zugriffe (72 Dateien), Realtime (0 Fundstellen), Edge Functions
  (keine), Storage (drei echte Nutzungen), Auth-Hook-Definition und -Grants.
- Supabase-Auftragsverarbeitungsvertrag, Backup-Doku und Preisseite abgerufen.
- `supabase db push --help` gelesen: `--db-url` existiert, der Ausrollweg bleibt
  moeglich.
- Selbstbetriebene Faehigkeit empirisch belegt: die lokale Datenbank ist dasselbe
  Container-Abbild; 67 Migrationen laufen, 324 Zusicherungen gruen, Vault
  funktioniert.
- Scaleway-Freikontingent nachgerechnet statt uebernommen.
- `./scripts/verify.sh` — siehe Git-Status.

## Git-Status

Branch `claude/betriebsmodell`, abgezweigt von `main` (`ce26594`).

## Security-Check

Keine Cloud-Aktion, keine Konfigurationsaenderung, keine Secrets beruehrt. Reine
Dokumentation.

## Bewusst nicht geaendert

- Keine Konfiguration umgestellt, kein Konto angelegt, kein Anbieter gebucht.
- `scripts/db-migrate-guard.sh` bleibt auf `--linked`. Die Umstellung auf
  `--db-url` gehoert in den Umzug, nicht in einen Dokumentations-Commit — es ist
  das Stueck, das ungepruefte Migrationen aufhaelt.
- Keine Docker-Datei. Sie gehoert zum naechsten Schritt und will lokal getestet
  werden.

## Risiken

Die Empfehlungen 5 und 6 (Scaleway, Elestio) stuetzen sich auf oeffentlich
abrufbare Angaben. Drei Punkte konnten nicht belegt werden und stehen als offene
Fragen in § 11.5; einer davon — ob die Sicherung den Wurzelschluessel enthaelt —
entscheidet, ob die Audit-Kette einen Ausfall uebersteht. Vor der Buchung klaeren.

## Folgeaufgaben

1. Drei Fragen an Elestio.
2. Zweites Supabase-Projekt fuer Entwicklung.
3. Docker-Datei und `standalone`-Umstellung.
4. Umzug inkl. JWT-Hook in die Konfiguration.
5. `scripts/db-migrate-guard.sh` auf `--db-url`.
6. Leeres Forward-Fenster der Kettenpruefung (offen aus dem Backup-Slice).
