# Original User Request

## Initial Request — 2026-06-10T08:36:06Z

Erweiterung der WEG-Verwaltungssoftware um das Personen- und Eigentums-Modul (Person, Unit, Ownership) zur Verwaltung von Eigentümern, historischen Verhältnissen und Co-Eigentum, sowie Behebung der Datenbank-Rechte für den Audit-Log HMAC-Schlüssel.

Working directory: /Users/sinanucar/Development/weg-verwaltung
Integrity mode: development

## Requirements

### R1. Personen-Modul (Person, Unit, Ownership)
Implementierung der Backend-Strukturen, DB-Tabellen/Migrationen und UI-Schnittstellen für:
- **Personen:** Verwaltung von natürlichen Personen (Name, Anschrift, E-Mail) ohne Login.
- **Ownerships (Eigentumsverhältnisse):** Verknüpfung von Personen zu Wohnungen (Units) mit Start- (`von`) und Enddatum (`bis`). Historische Stimmen und Protokolle müssen dem damaligen Eigentümer (gemäß des Zeitraums der Versammlung) zugeordnet bleiben.
- **Co-Eigentum:** Unterstützung von mehreren Personen für ein Eigentumsverhältnis (z. B. Ehepaare). Diese üben ihr Stimmrecht gemeinschaftlich aus (eine Stimme pro Ownership).
- **Benutzerverknüpfung:** Optionale Verknüpfung einer Person mit einem Login-Account (`auth.users`).

### R2. Datenbank-Hardening (audit_writer)
Erstellung der Migration zur Behebung des HMAC-Schlüssel-Zugriffs für den `audit_writer`:
- Erteilung der Berechtigungen `usage on schema vault, extensions` und `select on vault.decrypted_secrets`.
- Da dies auf gehosteten Supabase-Umgebungen Superuser-Rechte erfordert, muss die Migration für den lokalen Testlauf voll funktionsfähig sein und für die Cloud-Bereitstellung dokumentiert werden.

### R3. RLS-Absicherung (Mandantentrennung)
Sämtliche neuen Tabellen (`person`, `ownership` etc.) müssen durch RLS-Policies abgesichert werden, sodass Zugriffe nur für den jeweiligen Tenant möglich sind (`tenant_id = public.tenant_id()`).

## Acceptance Criteria

### Funktionalität (Web-UI)
- [ ] In der WEG-Detailansicht können Personen angelegt, editiert und gelöscht werden (CRUD).
- [ ] Einer Wohnung (Unit) können eine oder mehrere Personen als Eigentümer mit einem Zeitraum (`von` / `bis`) zugewiesen werden.
- [ ] Bei der Stimmenzählung und im Protokoll wird das Co-Eigentum korrekt als eine Stimme pro Wohnung/Eigentumsverhältnis gewertet.
- [ ] Bei einem historischen Eigentumswechsel bleibt die Stimmhistorie früherer Versammlungen unverändert beim damaligen Eigentümer.

### Sicherheit & Datenbank
- [ ] Die neuen Tabellen `person` und `ownership` haben RLS aktiviert mit Mandanten-Isolation.
- [ ] Der `audit_event`-Trigger läuft im lokalen Test ohne HMAC-Fallback-Warnungen durch.
- [ ] Alle Unit- und E2E-Tests (`just test` und `just e2e`) sind vollständig grün.

## Follow-up — 2026-06-10T14:08:47Z

Implementierung von Track 2 (Audit Log Cold-Storage) und Track 3 (Finanzmodul - Wirtschaftsplan & Hausgeld) für die WEG-Verwaltungssoftware.

Working directory: /Users/sinanucar/Development/weg-verwaltung
Integrity mode: development

## Requirements

### R1. Audit Log Cold-Storage (Track 2)
- Erstellung einer Migration `0035_audit_cold_storage.sql` zur Implementierung einer Funktion/Logik für den Export alter Audit-Log-Partitionen (> 24 Monate alt) in Supabase Storage.
- Detach-Mechanismus für diese Partitionen.
- UI-Schnittstelle im Dashboard für den `tenant_admin` zum Exportieren und Herunterladen der Archive.

### R2. Wirtschaftsplan & Hausgeld-Sollstellung (Track 3)
- Datenbank-Tabellen für Wirtschaftsplan-Positionen (tabelle `wirtschaftsplan`) und Sollstellung pro Einheit/Monat (tabelle `sollstellung`).
- Berechnung des monatlichen Hausgeldes basierend auf Miteigentumsanteilen (MEA) der Einheiten.
- UI-Formular zur Erfassung von Jahres-Gesamtkosten für eine WEG und Anzeige des resultierenden Hausgeldes pro Wohneinheit.
- RLS-Absicherung (Mandanten-Isolation) auf allen neuen Tabellen.

## Acceptance Criteria
- [ ] Ältere Partitionen des Audit-Logs lassen sich über das UI archivieren und als CSV/JSON aus dem Storage herunterladen.
- [ ] Für eine WEG kann ein Wirtschaftsplan mit Gesamtkosten angelegt werden, das Hausgeld wird automatisch nach MEA-Schlüssel auf die Einheiten verteilt.
- [ ] Alle Unit- und E2E-Tests (`just test` und `just e2e`) sind vollständig grün und alle Linter/Typecheck-Checks laufen fehlerfrei durch.
