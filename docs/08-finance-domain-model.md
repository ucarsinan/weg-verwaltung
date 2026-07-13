# Section 8 — Finance Domain Model

> Status: Implementierungsgrundlage fuer den Abrechnungskern. Diese Section
> erweitert den bisherigen Wirtschaftsplan-/Sollstellung-Slice, ohne bestehende
> historische Sollstellungen neu zu berechnen. Der in "Migrationsstrategie"
> Schritt 2 genannte Folge-Slice ist mit `0060_wirtschaftsplan_position_
> allocation.sql` umgesetzt (Generator + UI); Details dazu weiter unten.

## Ziel

Der Finance-Kern modelliert WEG-Finanzen als regelbasierte, auditierbare
Fachlogik:

```text
Kostenposition -> gueltiger Verteilungsschluessel -> Basiswerte je Einheit
               -> Sollstellung / Forderung / Abrechnungssnapshot
```

Der aktuelle Code kennt bereits:

- `wirtschaftsplan` als Planversion mit Lifecycle.
- `sollstellung` als historisches, insert-only Ziel pro Einheit und Monat.
- `unit` mit MEA.
- `ownership` mit zeitlicher Eigentuemerhistorie.

Der neue Schnitt fuegt zuerst die fehlende Regelgrundlage hinzu:

- versionierbare Verteilungsschluessel,
- Basiswerte je Einheit,
- Wirtschaftsplan-Positionen mit Verteilungsschluessel.

## Nicht-Ziele dieses Schnitts

- Keine Remote-Supabase-Aktion.
- Keine Cloud-E2E-Ausfuehrung.
- Keine automatische Aenderung bestehender `sollstellung`-Berechnung.
- Keine SEPA-, Mahn-, Zahlungs- oder Bankimport-Integration.
- Keine produktive Heizkostenabrechnung.
- Keine Jahresabrechnungserzeugung in diesem Slice.

## Fachliche Invarianten

1. Bestehende `sollstellung`-Rows bleiben unveraendert.
2. Wirtschaftsplan-Positionen duerfen nur an Entwurfsplaenen geaendert werden.
3. Verteilungsschluessel sind versionierte Fachregeln, keine Hardcodes.
4. Agenten duerfen Finanzregeln und Planpositionen nicht direkt schreiben.
5. Alle neuen Tabellen sind mandantenisoliert per `tenant_id`, RLS und
   Composite FKs.
6. Schreibzugriffe auf neue Finance-Regeltabellen sind auf
   `tenant_admin` und `verwalter_mitarbeiter` begrenzt. Eigentuemer und Beirat
   duerfen sie lesen, aber nicht direkt aendern.
7. Jede Aenderung laeuft durch die bestehende Audit-Kette.
8. Gueltigkeitszeitraeume duerfen sich nicht ueberlappen: Versionen desselben
   Verteilungsschluessels und Basiswerte derselben Einheit pro Version muessen
   zeitlich eindeutig sein.
9. Der Sollstellung-Generator (`private._generate_sollstellungen_for_plan`,
   erweitert in `0060`) faellt auf die unveraenderte MEA/`gesamtkosten`-
   Berechnung zurueck, solange ein Plan keine Positionen hat. Sobald
   Positionen existieren, verteilt er jede Position ueber ihren
   Verteilungsschluessel und summiert die Anteile je Einheit.
10. Fehlende Basiswerte fuer eine Einheit oder `typ = 'gemischt'` fuehren zu
    einem Fehler bei der Aktivierung (`errcode 23514` bzw. `0A000`), nicht zu
    einer stillschweigenden Teil- oder Fehlverteilung.

## Neue Tabellen

### `verteilungsschluessel`

Beschreibt einen stabilen fachlichen Schluessel innerhalb einer WEG.

Wichtige Felder:

- `weg_id`
- `name`

### `verteilungsschluessel_version`

Beschreibt die konkrete, zeitlich gueltige Regel, nach der eine Kostenart
verteilt wird.

Wichtige Felder:

- `typ`: `mea`, `einheit`, `flaeche`, `verbrauch`, `manuell`, `gemischt`
- `quelle`: `gesetz`, `teilungserklaerung`, `gemeinschaftsordnung`,
  `beschluss`, `manuell`
- `resolution_id`, optionaler Beschlussanker
- `gueltig_ab`, `gueltig_bis`
- `parameter`, JSON fuer gemischte Regeln wie Heizkosten 70/30

### `verteilungsschluessel_basiswert`

Speichert die Werte, auf denen ein Schluessel rechnet.

Beispiele:

- MEA-Anteile je Einheit
- Wohnflaeche je Einheit
- Verbrauchswerte je Einheit und Periode
- manuelle Anteilswerte

Basiswerte referenzieren die konkrete `verteilungsschluessel_version`, damit
spaetere Regelversionen keine alten Basiswerte umdeuten.

### `wirtschaftsplan_position`

Zerlegt einen Wirtschaftsplan in einzelne Kostenpositionen.

Wichtige Felder:

- `wirtschaftsplan_id`
- `position`
- `kostenart`
- `jahresbetrag`
- `verteilungsschluessel_version_id`
- `verteilungsschluessel_snapshot`

Der Snapshot verhindert, dass spaetere Regelanpassungen eine bereits geplante
Position still fachlich umdeuten. In diesem ersten Slice wird der Snapshot noch
nicht automatisch berechnet; die Spalte ist als bewusstes Contract-Feld
vorhanden.

## Generator-Anbindung (0060)

`0060_wirtschaftsplan_position_allocation.sql` verdrahtet den bestehenden
insert-only-Generator mit den 0056-Tabellen:

- Ohne Positionen: unveraenderter MEA/`gesamtkosten`-Pfad (Regressionstest in
  `infra/supabase/tests/0060_wirtschaftsplan_position_allocation.sql`).
- Mit Positionen: neue interne Funktion
  `private._verteilungsschluessel_version_unit_shares(...)` berechnet je
  Einheit einen Anteil (0..1) fuer eine einzelne Verteilungsschluessel-Version;
  `typ = 'mea'` nutzt `unit.mea_zaehler/mea_nenner`, `typ = 'einheit'` teilt
  gleichmaessig, `typ in ('flaeche','verbrauch','manuell')` normiert auf die
  Summe der `verteilungsschluessel_basiswert`-Werte zum 1. Januar des
  Plan-Jahres. Der Generator summiert `jahresbetrag * anteil` je Einheit ueber
  alle Positionen und teilt danach wie bisher durch 12.
- **Bewusst nicht geloest:** `typ = 'gemischt'` (z. B. Heizkosten 70/30). Das
  `parameter`-JSON (`{"parts":[{"typ":...,"gewicht":...}]}`) referenziert keine
  eigene Basiswert-Version je Teil — mit dem aktuellen Schema ist nicht
  eindeutig, welche `verteilungsschluessel_basiswert`-Zeilen zu welchem Teil
  gehoeren. Die Aktivierung schlaegt fuer `gemischt` mit `errcode 0A000` fehl,
  statt eine Aufteilung zu raten. Eine echte Umsetzung braucht zuerst eine
  Schema-/Produktentscheidung, wie Teile eines gemischten Schluessels ihre
  eigenen Basiswerte referenzieren.
- Eine `wirtschaftsplan_position` muss aktuell nicht datumsgueltig fuer das
  Planjahr sein (keine Pruefung gegen `gueltig_ab`/`gueltig_bis` der
  referenzierten Version). Bewusst ausserhalb dieses Slices gehalten, um den
  bestehenden Entwurfs-Validierungstrigger aus `0056` nicht zusaetzlich
  anzufassen.

UI: `/wegs/[id]/finanzen/verteilungsschluessel` (Schluessel + erste Version
anlegen, Basiswerte je Einheit pflegen) und
`/wegs/[id]/finanzen/[planId]/positionen` (Positionen je Entwurfsplan).

## Pflicht-Testfaelle fuer die naechsten Slices

### 1. Wirtschaftsplan mit gemischten Schluesseln

Die Beispiel-WEG aus dem Auftrag muss Planpositionen nach MEA, Einheit, Flaeche
und spaeter Heizkosten 70/30 berechnen koennen.

### 2. Abrechnungsspitze vs. Zahlungsrueckstand

Fachlich getrennt:

```text
Abrechnungsspitze = Ist-Kostenanteil - beschlossene Vorschuesse
Zahlungsrueckstand = offene faellige Forderungen - Ist-Zahlungen
```

Diese Werte duerfen nicht zu einer einzigen Nachzahlung vermischt werden.

### 3. Sonderumlage aus Beschluss

Ein Beschluss muss spaeter eine Forderung mit Betrag, Schluessel, Faelligkeit,
Zahlungsstatus und Audit-Anker ausloesen koennen.

### 4. Eigentuemerwechsel

Forderungen und Dokumentzugriff muessen ueber `ownership` zeitlich korrekt
aufgeloest werden. Historische Abrechnungen duerfen nicht umgebucht werden,
weil eine Einheit spaeter verkauft wurde.

## Migrationsstrategie

1. `0056_finance_allocation_foundation.sql`
   - legt Verteilungsschluessel, Basiswerte und Planpositionen an,
   - aktiviert RLS/FORCE RLS,
   - setzt Audit-Trigger,
   - blockiert Agent-Write-Pfade,
   - blockiert Planpositionsaenderungen an effektiven Plaenen.
2. Folge-Slice — `0060_wirtschaftsplan_position_allocation.sql` (erledigt)
   - UI fuer Planpositionen und Verteilungsschluessel/Basiswerte,
   - Generator liest optional Planpositionen statt nur `gesamtkosten`,
   - bestehender MEA-Pfad bleibt als Rueckfall erhalten,
   - `gemischt` und fehlende Basiswerte sind bewusst fail-closed statt geloest.
3. Danach
   - Verteilungsschluessel-Typ `gemischt` fachlich/technisch aufloesen,
   - Forderungen/Open Items,
   - Zahlungen,
   - Belege/Buchungen,
   - Jahresabrechnungs-Snapshots,
   - Ruecklagen/Vermoegensbericht.

## Teststrategie

Lokaler Pflichtpfad:

- Migration-Texttests fuer RLS, Audit, Agent-Guards und Draft-only-Guard
  (`apps/web/src/lib/supabase/__tests__/`, inkl.
  `wirtschaftsplan-position-allocation-0060.test.ts`).
- `just test-finance-db` als lokaler pgTAP-Vertrag gegen eine ephemere
  Supabase-Testdatenbank; der Befehl nutzt kein `--linked` und darf nicht auf
  die Frankfurt-Cloud zeigen. Deckt jetzt auch
  `infra/supabase/tests/0060_wirtschaftsplan_position_allocation.sql`
  (Fixture-basiert: MEA-Regression, Mixed-Key-Summierung, fehlender Basiswert,
  `gemischt`, Agent-Guard) ab; derselbe Testlauf ist zusaetzlich in
  `.github/workflows/ci.yml` (`db-regression`-Job) verdrahtet.
- Danach `./scripts/verify.sh`, sofern keine parallel fremden Worktree-Aenderungen
  oder Laufzeitprobleme blockieren.

Bekannte Luecke aus diesem Audit: `just test-finance-db` konnte in der
Bearbeitungs-Sandbox nicht ausgefuehrt werden (kein Docker-Daemon verfuegbar).
Migration 0060 und ihr pgTAP-Test wurden stattdessen von Hand sorgfaeltig
gegen das Schema verifiziert und muessen beim ersten echten Lauf (lokal mit
Docker oder ueber den CI-Job) bestaetigt werden.

Freigabepflichtig:

- `just db-migrate`
- `just e2e`
- Supabase-Remote-Checks

## Risiko

Dieser Slice ist bewusst schema-first. Er erweitert den Datenvertrag, aber noch
nicht die Berechnungslogik. Das ist sicherer als eine sofortige Umstellung des
Sollstellungs-Generators, weil bestehende gruen validierte Demo- und
Finance-Lifecycle-Flows nicht beruehrt werden.
