# 10. Backup und Wiederherstellung

> **Stand: 22. September 2026.** Dieses Dokument beschreibt einen **noch nicht
> eingerichteten** Zustand. Es ist ein Entscheidungspapier, keine Zusage. Solange
> Abschnitt 10.8 keinen durchgeführten Wiederherstellungslauf verzeichnet, bleibt
> Art. 32 Abs. 1 lit. b und c DSGVO **nicht erfüllt** — und diese Maßnahme darf in
> keinem Auftragsverarbeitungsvertrag als vorhanden erscheinen.

Verwandt: [09-tom-art32.md](./09-tom-art32.md) § 9.7, [03-security-model.md](./03-security-model.md).

---

## 10.1 Warum das hier ganz oben auf der Liste steht

Art. 32 Abs. 1 verlangt zwei Dinge, die in der Praxis gern zusammengeworfen
werden:

- **lit. b** — die Fähigkeit, Verfügbarkeit und Belastbarkeit auf Dauer
  sicherzustellen.
- **lit. c** — die Fähigkeit, Verfügbarkeit und Zugang bei einem Zwischenfall
  **rasch wiederherzustellen**.

Der zweite Punkt ist der schwierigere. Ein Backup zu haben ist lit. b. Belegen zu
können, dass man daraus tatsächlich zurückkommt, ist lit. c. Ein Backup, das nie
zurückgespielt wurde, erfüllt nur den ersten Teil — und erfahrungsgemäß oft nicht
einmal den.

Für dieses Produkt kommt ein zweites Argument hinzu, das schwerer wiegt als die
Verordnung: Eine WEG-Verwaltung führt Geldbeträge, Beschlüsse und
Eigentumsverhältnisse. Ein Fehler in der Berechnung ist korrigierbar. Verlorene
Daten sind es nicht.

---

## 10.2 Der Befund: es gibt heute kein Backup

Das Projekt läuft auf dem **Supabase-Free-Plan** (`AGENTS.md`-Backlog,
verifiziert 2026-07-14 im Zusammenhang mit dem Leaked-Password-Schutz).

Laut Supabase-Dokumentation (abgerufen 22.09.2026):

| Plan | Automatische Backups |
| --- | --- |
| **Free** | **keine** — Supabase verweist ausdrücklich darauf, selbst per CLI zu exportieren und die Exporte außerhalb abzulegen |
| Pro | 7 Tage tägliche Backups |
| Team | 14 Tage |
| Enterprise | bis zu 30 Tage |

Point-in-Time-Recovery ist ein Add-on für Pro/Team/Enterprise und braucht
zusätzlich mindestens ein Small-Compute-Add-on. Wer PITR aktiviert, bekommt
**keine** täglichen Backups mehr — PITR ersetzt sie.

Das heißt in einem Satz: **Fiele die Datenbank heute aus, wäre alles weg.** Nicht
„schwer wiederherstellbar" — weg. Das ist kein Versäumnis im Code, sondern eine
Eigenschaft des gewählten Plans, die niemand bisher explizit entschieden hat.

---

## 10.3 Was ein logischer Export enthält — und was nicht

`scripts/db-dump.sh` schreibt drei Dateien plus ein Manifest. Die Dreiteilung ist
keine Kosmetik: beim Zurückspielen werden Rollen, Struktur und Daten in genau
dieser Reihenfolge gebraucht.

| Datei | Inhalt | CLI |
| --- | --- | --- |
| `roles.sql` | Cluster-Rollen | `--role-only` |
| `schema.sql` | Struktur, Trigger, Policies | Default |
| `data.sql` | Daten | `--data-only --use-copy` |
| `manifest.txt` | SHA-256 je Datei, Zeitstempel, Git-HEAD, letzte Migration, CLI-Version | — |

Das Manifest ist der Teil, den man weglässt und später vermisst. Ein Export,
dessen Schemastand niemand kennt, ist beim Zurückspielen ein Ratespiel: passt
`data.sql` zu Migration `0060` oder `0067`? Der Unterschied entscheidet, ob der
Import durchläuft oder auf halber Strecke abbricht.

**Nicht enthalten — drei Lücken, die man kennen muss:**

1. **Storage-Objekte.** Supabase dokumentiert ausdrücklich, dass über die
   Storage-API abgelegte Objekte nicht Teil von Datenbank-Backups sind. Der
   private Bucket `audit-archives` braucht einen eigenen Weg.
2. **Passwörter eigener Rollen.** Laut Supabase-Doku sichern tägliche Backups
   diese nicht.
3. **Der Audit-HMAC-Schlüssel.** Siehe 10.5 — das ist die wichtigste Lücke und
   die einzige, die man nicht sieht, bis man sie prüft.

---

## 10.4 Der Drill: was tatsächlich gemessen wurde

Am 22.09.2026 gegen die lokale Datenbank auf Migrationsstand `0067` durchgeführt,
nicht angenommen:

1. Fixture angelegt (ein Mandant, eine WEG) — dabei entstehen zwei Audit-Zeilen.
2. `scripts/db-dump.sh --local` — `roles.sql` 501 B, `schema.sql` 411 KB,
   `data.sql` 30 KB, 61 `COPY`-Blöcke für `public`, darunter die
   Audit-Partition und der Reparatur-Checkpoint.
3. `supabase db reset --local` — Schema aus den Migrationen, keine Daten.
4. `data.sql` eingespielt.

**Ergebnis 1 — die Daten kommen zurück.** Mandant, WEG und beide Audit-Zeilen
waren wieder da. Beim Einspielen traten nur drei Fehler auf, alle aus
Supabase-internen Storage-Tabellen (`buckets_pkey` doppelt, zwei
`permission denied` auf Vektor-Tabellen). Kein einziger Trigger der Anwendung hat
den Import blockiert.

Einschränkung, die man nicht unterschlagen darf: `pg_dump` warnt bei
`--data-only` selbst davor, dass ein Rückspielen ohne `--disable-triggers`
scheitern kann. Diese Fixture war klein. Für einen echten Datenbestand mit
Append-only-Triggern auf der Beschluss-Sammlung und den Agent-Guards ist damit
**nicht** bewiesen, dass es ebenso glatt läuft.

**Ergebnis 2 — die Audit-Kette kommt nicht zurück.**

```
status: error
reason: row_hash_mismatch
expected_row_hash ≠ actual_row_hash   (prev_hash war identisch)
```

Die Daten sind da, der Integritätsnachweis ist tot. Das ist der eigentliche
Befund dieses Dokuments.

---

## 10.5 Warum die Audit-Kette einen Restore nicht überlebt

Die Ursache steht seit Migration `0017` im Repository — sie wurde nur nie mit dem
Wort „Wiederherstellung" in Verbindung gebracht. Aus dem Kopf von
`0017_vault_seed_audit_hmac_key.sql`:

> Supabase Vault nutzt pgsodium mit einem projektspezifischen
> Verschlüsselungsschlüssel. Eine über Projekte hinweg kopierte
> `vault.secrets`-Zeile lässt sich absichtlich nicht entschlüsseln. Jede frische
> Umgebung erzeugt ihren eigenen Schlüssel beim ersten Anwenden.

Die Migration meinte damit das Klonen zwischen Projekten. Ein Restore ist
derselbe Vorgang: `audit_event.row_hash` wurde mit Schlüssel K1 gebildet, die
wiederhergestellte Umgebung rechnet mit einem frisch erzeugten K2 nach — und
bekommt zwangsläufig einen anderen Wert. Der Vergleich der `prev_hash`-Werte
stimmte im Test, nur der Zeilenhash wich ab. Genau das erwartet man bei
identischem Inhalt und anderem Schlüssel.

**Die Konsequenz ist unangenehm konkret.** `AuditEvent` ist laut
Sicherheitsmodell unlöschbar und fälschungssicher; das ist eine der stärksten
Zusagen dieses Produkts. Nach einem logischen Restore lässt sich diese Zusage für
alle Zeilen vor dem Restore nicht mehr belegen. Die Zeilen sind da. Nur kann
niemand mehr beweisen, dass sie unverändert sind.

Drei Wege, damit umzugehen:

| Weg | Was er kostet | Was er leistet |
| --- | --- | --- |
| **Schlüssel getrennt sichern** | Der entschlüsselte `audit_hmac_key` muss außerhalb der Datenbank abgelegt und beim Restore wieder eingesetzt werden — Schlüsselmaterial in Menschenhand, mit allem was daran hängt | Kette überlebt |
| **Physisches Backup / PITR** | Pro-Plan plus Add-on | Stellt den Cluster samt pgsodium-Schlüsselmaterial wieder her; die Kette überlebt, ohne dass jemand einen Schlüssel anfasst |
| **Bruch akzeptieren** | Nichts | Der Reparatur-Checkpoint aus `0043`/`0045` zieht eine Linie: alles davor gilt als historisch, die Verifikation beginnt neu. Ehrlich, aber der forensische Wert vor dem Restore ist verloren |

Das ist das stärkste Argument für einen Plan-Wechsel — und es ist kein
Komfortargument. Es ist der einzige Weg, auf dem die Audit-Kette einen Ausfall
überlebt, ohne dass jemand Schlüsselmaterial von Hand verwaltet.

---

## 10.6 Nebenbefund: die Kettenprüfung meldete nie „ok"

Beim Versuch, eine saubere Kontrollmessung zu bekommen, lieferte
`public.audit_verify_chain()` auf der frischen lokalen Datenbank durchgehend:

```
status: warning, rows_checked: 0
"Keine Audit-Zeilen im verifizierbaren Forward-Fenster gefunden."
```

— und zwar auch dann, wenn Audit-Zeilen vorhanden waren und der Checkpoint
`valid_after_seq = null` trug, was laut `0045` (Zeile 424) eigentlich **alle**
Zeilen einschließt.

Zwei Dinge folgen daraus:

1. Es war mir lokal nicht möglich, eine positive Kontrolle („Kette verifiziert
   ohne Restore erfolgreich") zu erzeugen. Der Restore-Befund aus 10.4 stützt
   sich deshalb auf die beobachtete Fehlermeldung plus die dokumentierte
   Schlüsselerzeugung aus `0017`, nicht auf einen A/B-Vergleich. Das ist
   belastbar, aber es ist kein Laborbeweis, und so steht es hier.
2. **Wichtiger:** Die in `09-tom-art32.md` § 9.7 vorgeschlagene nächtliche
   Kettenprüfung wäre in diesem Zustand wertlos. Ein Job, der jede Nacht
   „keine Zeilen im Fenster" meldet, sieht aus wie eine bestandene Prüfung und
   ist keine. Das gehört untersucht, **bevor** der Scheduler eingerichtet wird —
   als eigener Slice, nicht nebenbei.

---

## 10.7 Zu entscheiden

Diese Fragen kann kein Skript beantworten. Sie gehören dem Betreiber.

| Frage | Warum sie zuerst kommt |
| --- | --- |
| **RPO** — wie viele Stunden Datenverlust sind im schlimmsten Fall hinnehmbar? | Bestimmt die Frequenz. Ein wöchentlicher Export bedeutet bis zu sieben Tage Verlust. Bei Hausgeldbuchungen ist das vermutlich zu viel |
| **RTO** — wie lange darf die Wiederherstellung dauern? | Bestimmt, ob ein manueller Export genügt oder ein automatisierter Weg nötig ist |
| **Plan** | Free (heute): kein Backup, Kette überlebt keinen Restore. Pro ($25/Monat, 7 Tage tägliche Backups). PITR-Add-on ($100/Monat je 7 Tage Aufbewahrung, ersetzt die täglichen Backups). Preise laut Supabase-Preisseite, abgerufen 22.09.2026 — vor der Entscheidung erneut prüfen |
| **Ablageort** | Ein Export, der neben der Datenbank liegt, überlebt genau die Ausfälle nicht, gegen die er schützt. Verschlüsselt und an einem anderen Ort — und dieser Ort ist ein Unterauftragsverarbeiter im Sinne von § 9.8 |
| **Aufbewahrungsdauer der Exporte** | Kollidiert mit dem Löschkonzept: ein gelöschter Datensatz, der im Backup weiterlebt, ist nicht gelöscht. Art. 17 gegen zehnjährige Aufbewahrungspflicht — derselbe Konflikt wie in `03-security-model.md` § 3.2 |

---

## 10.8 Der Ablauf

### Export

```bash
scripts/db-dump.sh --local     # Übung gegen die lokale DB, harmlos
scripts/db-dump.sh --linked    # gegen die Cloud — freigabepflichtig
```

Der `--linked`-Lauf verlangt eine getippte Bestätigung, weil er echte
personenbezogene Daten auf die lokale Platte holt. Das Skript bricht ab, wenn
`backups/` nicht in `.gitignore` steht — ein Export mit Eigentümerdaten darf
niemals in einen Commit geraten.

Danach: verschlüsseln, auslagern, lokale Kopie löschen.

### Wiederherstellungs-Drill

Gegen eine **leere Zielumgebung**, niemals gegen die produktive:

```bash
# 1. Zielumgebung auf denselben Migrationsstand bringen wie im Manifest
supabase db reset --local

# 2. Integrität der Exportdateien prüfen
shasum -a 256 -c <(grep -A3 'SHA-256:' backups/<stempel>/manifest.txt | tail -3 | awk '{print $1"  backups/<stempel>/"$2}')

# 3. Einspielen, in dieser Reihenfolge
psql "$ZIEL_URL" -f backups/<stempel>/roles.sql
psql "$ZIEL_URL" -f backups/<stempel>/data.sql

# 4. Stichproben
#    - Zeilenzahlen je Kerntabelle gegen den Ausgangsstand
#    - eine Jahresabrechnung neu berechnen und mit dem Snapshot vergleichen
#    - public.audit_verify_chain() aufrufen und das Ergebnis EHRLICH notieren
```

`schema.sql` wird nur gebraucht, wenn die Zielumgebung nicht aus den Migrationen
aufgebaut werden kann.

### Nachweis

Jeder Drill wird hier eingetragen. Ein Drill, der nicht dokumentiert ist, hat für
Art. 32 Abs. 1 lit. c nicht stattgefunden.

| Datum | Ziel | Dauer | Datenverlust | Audit-Kette | Ergebnis |
| --- | --- | --- | --- | --- | --- |
| 2026-09-22 | lokal, synthetische Fixture | < 2 min | — | **gebrochen** (`row_hash_mismatch`) | Daten vollständig zurück, Integritätsnachweis verloren. Kein Produktionsdrill |
| — | — | — | — | — | _hier eintragen_ |

---

## 10.9 Was offen bleibt

| Punkt | Zuständig |
| --- | --- |
| Plan-Entscheidung und RPO/RTO festlegen | Betreiber |
| Ersten Export gegen die Cloud ziehen und auslagern | Betreiber, freigabepflichtig |
| Wiederherstellungs-Drill gegen einen echten Export | Betreiber, gemeinsam |
| Sicherung der Storage-Objekte (`audit-archives`) | offen, eigener Weg nötig |
| Umgang mit dem `audit_hmac_key` entscheiden (10.5) | Betreiber |
| Leeres Forward-Fenster der Kettenprüfung untersuchen (10.6) | eigener Slice, **vor** der nächtlichen Prüfung |
| Aufbewahrungsdauer der Exporte mit dem Löschkonzept abstimmen | offen |

---

## 10.10 Änderungshistorie

| Datum | Änderung |
| --- | --- |
| 2026-09-22 | Erstfassung. Free-Plan-Befund, Exportskript, lokaler Drill mit dem Audit-Ketten-Befund |
