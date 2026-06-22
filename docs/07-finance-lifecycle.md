# Finance Lifecycle Specification

## Zustandsmodell

`wirtschaftsplan.status` kennt vier Zustände:

- `entwurf`: angelegter, editierbarer Plan ohne Sollstellungen.
- `aktiv`: fachlich freigegebener Plan. Die Aktivierung erzeugt die initialen Sollstellungen.
- `abgeloest`: historischer Plan, der durch einen aktivierten Nachtragsplan ersetzt wurde.
- `archiviert`: final abgelegter Plan, nur noch historische Referenz.

## Erlaubte Übergänge

- `insert -> entwurf`
- `entwurf -> aktiv` über `activate_wirtschaftsplan`
- `aktiv -> abgeloest` automatisch, wenn ein anderer Plan für dieselbe `tenant_id`/`weg_id`/`jahr` aktiviert wird
- `entwurf -> archiviert` zum Verwerfen nicht aktivierter Entwürfe
- `abgeloest -> archiviert`

## Verbotene Übergänge

- Direkte Tabellen-Updates auf `status`, `aktiviert_am`, `abgeloest_am`, `archiviert_am`
- Rücksprünge nach `entwurf`
- `abgeloest -> aktiv`
- `archiviert -> *`
- `aktiv -> archiviert` ohne vorherige Ablösung
- Aktivierung durch `actor_type=agent`
- Sollstellungs-Erzeugung außerhalb von `activate_wirtschaftsplan`

## Nachtragspläne

Ein Nachtragswirtschaftsplan ist immer ein neuer `wirtschaftsplan` für dieselbe WEG und dasselbe Jahr. Der neue Plan referenziert seinen Vorgänger über `vorgaenger_wirtschaftsplan_id` und bleibt zunächst `entwurf`.

Bei Aktivierung:

- der bisher aktive Plan wird `abgeloest`
- der Nachtragsplan wird `aktiv`
- bestehende Sollstellungen bleiben unverändert
- neue Sollstellungen werden für den Nachtragsplan ab `wirksam_ab_monat` erzeugt

## Jahreswechsel

Aktivität gilt pro `tenant_id`/`weg_id`/`jahr`. Ein Plan für das Folgejahr kann als Entwurf vorbereitet oder aktiviert werden, ohne den aktiven Vorjahresplan automatisch abzulösen. Jahresabschluss oder Archivierung bleiben explizite fachliche Schritte.

## Sicherheitsregeln

Die Aktivierung läuft als tenant-geprüfte DB-RPC, serialisiert `tenant_id`/`weg_id`/`jahr` per Advisory Lock und nutzt die bestehende Audit-Kette. Direkte Sollstellung-DML bleibt gesperrt; historische Sollstellungen werden weder aktualisiert noch gelöscht.
