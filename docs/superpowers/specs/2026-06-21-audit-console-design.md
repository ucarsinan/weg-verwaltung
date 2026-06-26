# Audit Console Design

Datum: 2026-06-21
Status: freigegebener Brainstorming-Designstand
Scope: `apps/web/`, kleine Supabase-Read-API/RPC-Erweiterungen

## Ziel

Der Audit-Bereich wird von einer rohen Ereignistabelle zu einem funktionalen Arbeitsbereich für Nachvollziehbarkeit, Integritätskontrolle und Archivstatus.

Der Nutzer soll drei Fragen beantworten können:

1. Was ist passiert?
2. Wer oder was hat es ausgelöst?
3. Ist die Audit-Kette technisch vertrauenswürdig?

Das unveränderliche `public.audit_event` bleibt die Quelle der Wahrheit. Die neue Oberfläche macht diese Quelle bedienbar, ohne Audit-Historie zu mutieren oder tenantseitig gefährliche Archivoperationen zu erlauben.

## Kontext

Die aktuelle Seite unter `/audit` lädt die letzten 100 `audit_event`-Zeilen und zeigt zwei Cold-Storage-Kacheln. Das ist technisch korrekt, aber operativ schwach:

- keine Suche und keine Filter
- keine Detailansicht
- kein menschenlesbarer Ereignistext
- kein sichtbarer Integritätsstatus
- Payload bleibt verborgen, obwohl sie für Recherche wichtig ist
- Archivierung wirkt bedienbar, ist im Server-Code aber bewusst deaktiviert

Das neue Design trennt deshalb fachliche Recherche, technische Integrität und Archivstatus klar voneinander.

## Informationsarchitektur

Der Audit-Bereich bekommt drei Tabs:

```text
Verlauf | Integrität | Archiv
```

### Verlauf

Default-Tab für alle eingeloggten Verwalter im Tenant. Der Tab beantwortet: "Was ist passiert?"

Er enthält:

- kompakte Filterleiste
- paginierten Audit-Feed
- rechtsseitiges Detailpanel für den ausgewählten Eintrag
- maskierte Payload-Ansicht mit optionalem Admin-Reveal

### Integrität

Nur für `tenant_admin`. Der Tab beantwortet: "Ist die Audit-Kette intakt?"

Er enthält:

- Status `Nicht geprüft`, `Intakt`, `Warnung` oder `Fehler`
- letzter Prüflauf
- geprüfte Sequenzspanne
- Checkpoint-Hinweis für das Forward-Verified-Window
- Button `Integrität prüfen`
- Fehlerdetails, falls eine Bruchstelle gefunden wurde

### Archiv

Nur für `tenant_admin`. Der Tab ist im ersten Schnitt read-only.

Er enthält:

- Retention-Regel
- archivierbare Partitionen als Statusliste
- vorhandene CSV-Exporte mit Download
- sichtbare Fehlerzustände für RPC-/Storage-Probleme
- klare Erklärung, dass die Tenant-UI keine globalen Audit-Partitionen detach/drop auslösen darf

## Berechtigungen

Alle eingeloggten Verwalter sehen den Verlauf für ihren Tenant. RLS bleibt die harte Mandantengrenze.

`tenant_admin` sieht zusätzlich:

- Tab `Integrität`
- Tab `Archiv`
- Payload-Reveal-Aktion
- technische Integritätsdetails

Nicht-Admins sehen keine Admin-Tabs und keinen Reveal-Button. Autorisierung wird serverseitig in Server Actions/RPCs erneut geprüft; UI-Ausblendung ist nur Komfort.

## Read-API

`public.audit_event` bleibt append-only und wird nicht für UI-Komfort verändert. Darüber entsteht eine kleine Read-Schicht.

### `public.audit_event_feed(...)`

RPC-Funktion für gefilterte und paginierte Audit-Einträge. Eine RPC ist hier besser als eine View, weil Filter, Pagination, Maskierung und rollenabhängige Felder serverseitig in einem klaren Contract zusammenlaufen.

Parameter:

- Zeitraum `from` / `to`
- `actor_type`
- `entity_typ`
- `action`
- freie Suche über Summary und Entity Label
- Flag-Filter, etwa `service_role`, `agent`, `masked`, `integrity_warning`
- Pagination über `limit` und Cursor. Der Cursor besteht aus `created_at` plus `seq`, damit neue Events die Reihenfolge nicht verschieben.

Rückgabe:

- `id`
- `seq`
- `created_at`
- `actor_type`
- `actor_user_id`
- `db_role`
- `entity_typ`
- `entity_id`
- `action`
- `summary`
- `entity_label`
- `actor_label`
- `risk_flags`
- `payload_masked`
- `can_reveal_payload`

Die freie Suche läuft nicht direkt über rohes JSON. Sie sucht über normalisierte Summary-/Label-Felder, damit die UI schnell und fachlich präzise bleibt.

### `public.audit_integrity_status()`

Liefert den letzten bekannten Integritätsstatus für den aktuellen Tenant:

- Status
- letzter Prüflauf
- geprüfte `seq`-Spanne
- Anzahl geprüfter Rows
- Checkpoint-Information
- erste Bruchstelle, falls vorhanden

### `public.audit_verify_chain()`

Nur für `tenant_admin`.

Stößt eine tenant-spezifische Prüfung der Audit-Kette an und gibt das Ergebnis zurück. Wenn die Prüfung nicht kurz genug synchron ausführbar ist, meldet die Server Action einen klaren Timeout-/Retry-Zustand. Das Design bleibt später auf einen Hintergrundjob erweiterbar.

### Payload-Reveal

Details zeigen standardmäßig maskierte Payload-Daten. `tenant_admin` kann über `Vollständig anzeigen` den unmaskierten Payload anfordern.

Der Reveal ist ein eigener serverseitig autorisierter Schritt und soll selbst wieder ein Audit-Event erzeugen. Grund: bewusste De-Pseudonymisierung ist eine nachvollziehbare Handlung.

## Verlauf-UX

Der Tab `Verlauf` ist ein Recherchewerkzeug, kein Datenbankdump.

### Filterleiste

Filter:

- Suche
- Zeitraum
- Akteur
- Entitätstyp
- Aktion
- Flag/Integritätsstatus
- Reset

Die Filter bleiben kompakt. Sie dürfen die Tabelle nicht verdrängen.

### Feed

Der Feed ist eine dichte Tabelle mit stabilen Spalten:

- Zeit
- Ereignis
- Entität
- Akteur
- Aktion
- Marker

Beispielzeilen:

- `17.06.2026, 08:42` | `Wirtschaftsplan 2026 aktualisiert` | `Wirtschaftsplan` | `Verwalter` | `update` | `masked`
- `17.06.2026, 08:41` | `WEG Lindenstr. 12 angelegt` | `WEG` | `Verwalter` | `insert` | `service_role`

Klick auf eine Zeile öffnet oder aktualisiert das Detailpanel.

### Detailpanel

Das Detailpanel zeigt:

- menschenlesbare Zusammenfassung
- Zeit, Akteur, DB-Rolle, Sequenz
- Entitätstyp, Entitäts-ID, Aktion
- strukturierte Änderung, soweit ableitbar
- maskierter Payload als formatierter JSON-Block
- Admin-Reveal für vollständigen Payload
- eingeklappte technische Details mit `prev_hash`, `row_hash`, Checkpoint/Verifier-Hinweis

Technische Werte sind erreichbar, aber nicht der erste Eindruck.

## Integrität-UX

Der Tab `Integrität` nutzt eine ruhige Statusfläche, keine dramatische Sicherheitsgrafik.

Statuslogik:

- `Nicht geprüft`: Es liegt kein UI-verwertbarer Prüflauf vor.
- `Intakt`: Die geprüfte Forward-Kette ist intakt.
- `Warnung`: Prüfung ist unvollständig, Legacy-Bereich oder nicht kritische Einschränkung.
- `Fehler`: Bruchstelle oder Prüffehler mit Integritätsrelevanz.

Die UI muss klar sagen, dass historische Legacy-Zeilen vor dem `0045`-Checkpoint nicht als v2-HMAC-verifiziert dargestellt werden. Das vermeidet falsche Sicherheit.

Button:

```text
Integrität prüfen
```

Nur `tenant_admin`. Während des Laufs ist der Button gesperrt. Ergebnis oder Fehler wird inline angezeigt.

## Archiv-UX

Archiv ist im ersten Schnitt ein Statusbereich.

Er zeigt:

- Retention-Regel: Audit bleibt 24 Monate heiß, ältere Partitionen gehen über Systemjob in Cold Storage.
- archivierbare Partitionen: Name und Monat, ohne Aktionsbutton.
- archivierte Dateien: Name, Größe, Erstellzeitpunkt und Download.
- Fehler: fehlender Bucket, RPC-Fehler oder Storage-Fehler als sichtbare Meldung.

Der bisherige Button `Archivieren` wird entfernt. Ein read-only Status ist ehrlicher als eine deaktivierte Aktion, die wie Produktfunktion wirkt.

## Komponenten

Frontend-Struktur:

```text
apps/web/src/app/(dashboard)/audit/
├── page.tsx
├── actions.ts
├── audit-shell.tsx
├── audit-feed.tsx
├── audit-detail-panel.tsx
├── audit-integrity-panel.tsx
├── audit-archive-panel.tsx
└── formatters.ts
```

### `page.tsx`

Server-Entry. Lädt Claims, Rolle und Initialdaten. Rendert Admin-Tabs nur bei `tenant_admin`.

### `audit-shell.tsx`

Client-Komponente für Tabs, Filterzustand, Pagination und ausgewählten Eintrag.

### `audit-feed.tsx`

Tabellarischer Verlauf mit Lade-, Leer- und Fehlerzuständen.

### `audit-detail-panel.tsx`

Detailansicht mit maskierter Payload, Reveal-Flow und technischen Details.

### `audit-integrity-panel.tsx`

Admin-Integritätsstatus und Prüfen-Action.

### `audit-archive-panel.tsx`

Read-only Archivstatus und Download vorhandener Exporte.

### `formatters.ts`

Summary-, Label-, Flag- und Redaction-Helfer. Ziel ist, `page.tsx` und Panels klein zu halten.

## Fehlerfälle

- Fehlende Claims: Server zeigt eine klare Auth-/Rollen-Fehlermeldung oder leitet gemäß bestehendem Auth-Pattern weiter.
- Keine Events: Empty State erklärt, dass noch keine auditierbaren Ereignisse erfasst wurden.
- Feed-RPC schlägt fehl: sichtbare Inline-Fehlermeldung mit Retry.
- Storage-Bucket fehlt: Archiv-Tab zeigt Statusfehler, nicht nur `console.error`.
- Verify schlägt fehl: Status bleibt nicht grün; Fehler wird im Integrität-Tab angezeigt.
- Verify läuft zu lange: UI zeigt Timeout und bewahrt letzten bekannten Status.
- Reveal nicht erlaubt: Server Action gibt `Nicht autorisiert`; UI zeigt keinen Button für Nicht-Admins.

## Tests

### Unit

- Summary-/Label-Formatter
- Redaction-Regeln
- Flag-Ermittlung
- Rollenlogik für sichtbare Tabs und Reveal

### Server Actions

- Feed lädt mit Filtern.
- Nicht-Admin kann Payload nicht revealen.
- `tenant_admin` kann Integritätsprüfung anstoßen.
- Archiv-Download erzeugt Signed URL nur für erlaubte Datei-Pattern.
- RPC-/Storage-Fehler werden als strukturierte Fehlerrückgabe behandelt.

### E2E

- Verlauf lädt und zeigt menschenlesbare Ereignisse.
- Filter verändern Ergebnisliste.
- Klick auf Zeile öffnet Detailpanel.
- Payload ist initial maskiert.
- `tenant_admin` sieht Integrität und Archiv.
- Nicht-Admin sieht keine Admin-Tabs.

### DB-Regression

- neue RPCs respektieren RLS.
- neue RPCs erlauben kein Update/Delete von `audit_event`.
- `audit_verify_chain()` ist nur für `tenant_admin` erreichbar.
- Legacy-Checkpoint-Status wird korrekt ausgewiesen.

## Nicht-Ziele

Dieser Schnitt baut nicht:

- echten Export-/Detach-/Drop-Archivjob
- Off-box pgaudit-Pipeline
- vollständige DBA-Forensik mit Hash-Recompute-Detailansicht für jede Zeile
- globale Cross-Tenant-Admin-Konsole
- Änderung der bestehenden Audit-Historie

## Offene Erweiterungspunkte

Spätere Erweiterungen können auf diesem Design aufsetzen:

- Hintergrundjob für Integritätsprüfung
- Audit-Exportmanifest mit HMAC
- Archivjob mit privilegiertem Export, Verifikation und anschließendem Detach
- entity-spezifische Deep Links in WEG, Wirtschaftsplan, Versammlung oder Beschluss
- Benachrichtigung bei Integritätsfehler
