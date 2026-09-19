# Section 8 — Finance Domain Model

> Status: Implementierungsgrundlage fuer den Abrechnungskern. Diese Section
> erweitert den bisherigen Wirtschaftsplan-/Sollstellung-Slice, ohne bestehende
> historische Sollstellungen neu zu berechnen.

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
2. `0060_wirtschaftsplan_position_allocation.sql` (Folge-Slice, umgesetzt)
   - UI fuer Verteilungsschluessel, Basiswerte und Planpositionen,
   - Generator liest Planpositionen statt nur `gesamtkosten`,
   - bestehender MEA-Pfad bleibt als Rueckfall erhalten (byte-identisch,
     solange ein Plan keine Positionen hat),
   - unterstuetzte Schluesseltypen: `mea`, `einheit`, `flaeche`, `verbrauch`,
     `manuell`.
   - Abweichung zum Alt-Pfad: im Positionen-Pfad werden `mea`-Anteile auf die
     MEA-Summe der WEG normalisiert. Das Schema erzwingt nicht, dass sich die
     MEA einer WEG auf 1 summieren; ohne Normalisierung bliebe ein Teil des
     Positionsbetrags unverteilt. § 16 Abs. 2 WEG verteilt "im Verhaeltnis der
     Miteigentumsanteile", und der Plan muss vollstaendig finanziert sein.
3. Offener Folge-Slice: `gemischt`
   - `gemischt` ist in 0056 modelliert, wird von 0060 aber fail-closed mit
     `0A000` abgelehnt. Grund: `verteilungsschluessel_basiswert` ist eindeutig
     ueber `(tenant_id, version_id, unit_id, gueltig_ab)` und hat keine Spalte
     fuer die Zugehoerigkeit zu einem Teil der Regel — eine 70/30-Regel kann
     Verbrauch UND Flaeche einer Einheit deshalb nicht speichern.
   - Praxisrelevanz: Heiz- und Warmwasserkosten muessen nach HeizKV zwingend
     gemischt verteilt werden (30-50 % Grundkosten nach Flaeche, 50-70 % nach
     Verbrauch). Solange dieser Slice offen ist, lassen sich Heizkosten nicht
     positionsgenau planen.
   - Zu entscheiden: Diskriminator-Spalte am Basiswert vs. Komposition aus
     referenzierten Sub-Versionen. Das ist eine Schema-/Produktentscheidung,
     keine stille Annahme im Geldpfad.
4. Danach
   - Forderungen/Open Items,
   - Zahlungen,
   - Belege/Buchungen,
   - Jahresabrechnungs-Snapshots,
   - Ruecklagen/Vermoegensbericht.

## Teststrategie

Lokaler Pflichtpfad:

- Migration-Texttests fuer RLS, Audit, Agent-Guards und Draft-only-Guard.
- `just test-finance-db` als lokaler pgTAP-Vertrag gegen eine ephemere
  Supabase-Testdatenbank; der Befehl nutzt kein `--linked` und darf nicht auf
  die Frankfurt-Cloud zeigen.
- Danach `./scripts/verify.sh`, sofern keine parallel fremden Worktree-Aenderungen
  oder Laufzeitprobleme blockieren.

Freigabepflichtig:

- `just db-migrate`
- `just e2e`
- Supabase-Remote-Checks

## Risiko

Dieser Slice ist bewusst schema-first. Er erweitert den Datenvertrag, aber noch
nicht die Berechnungslogik. Das ist sicherer als eine sofortige Umstellung des
Sollstellungs-Generators, weil bestehende gruen validierte Demo- und
Finance-Lifecycle-Flows nicht beruehrt werden.
